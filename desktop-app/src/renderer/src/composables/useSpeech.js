import { ref } from 'vue'

// Local speech-to-text: MediaRecorder → 16 kHz mono PCM → Whisper via
// transformers.js (WASM). Chromium's webkitSpeechRecognition needs Google
// cloud keys and does NOT work in Electron, so we transcribe on-device.
// The model (~80 MB quantized) downloads from huggingface.co on first use and
// is cached by the browser Cache API after that.
// multilingual; override via localStorage ba_stt_model. Must be an
// onnx-community export — the older Xenova/* ONNX files lack the quantization
// scales the current onnxruntime-web requires (session creation fails).
const DEFAULT_MODEL = 'onnx-community/whisper-base'
const MAX_RECORD_MS = 120000 // safety stop so a forgotten mic doesn't run forever
const SILENCE_STOP_MS = 30000 // auto-stop after this long without speech
const SPEECH_LEVEL = 0.02 // meter peak above this counts as speech

// One pipeline for the whole app — the model is big; never load it twice.
// Reloaded only when the chosen model changes (Settings → Speech to text).
let pipePromise = null
let pipeModel = ''

// Input devices for the Settings picker. Labels are only exposed after mic
// permission has been granted at least once, so we open (and immediately
// close) a throwaway stream first.
export async function listMicrophones() {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true })
    s.getTracks().forEach((t) => t.stop())
  } catch {
    /* denied — enumerate anyway; labels may be blank */
  }
  const devs = await navigator.mediaDevices.enumerateDevices()
  return devs
    .filter((d) => d.kind === 'audioinput')
    .map((d, i) => ({ label: d.label || `Microphone ${i + 1}`, value: d.deviceId }))
}

export function useSpeech(onText) {
  const supported = !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder)
  const recording = ref(false)
  const busy = ref(false) // transcribing (includes first-run model load)
  const downloading = ref(false)
  const modelProgress = ref(0) // 0-100 while the model downloads
  const level = ref(0) // live input peak (0..1) while recording
  const error = ref('')

  let recorder = null
  let chunks = []
  let stopTimer = null
  let meterCtx = null
  let meterTimer = null

  // Live level meter so a dead input is visible WHILE recording, not after.
  // Doubles as the silence watchdog: no speech for SILENCE_STOP_MS → auto-stop
  // so a forgotten mic doesn't keep listening.
  function startMeter(stream) {
    meterCtx = new AudioContext()
    const an = meterCtx.createAnalyser()
    an.fftSize = 512
    meterCtx.createMediaStreamSource(stream).connect(an)
    const buf = new Float32Array(an.fftSize)
    let lastLoudAt = Date.now()
    meterTimer = setInterval(() => {
      an.getFloatTimeDomainData(buf)
      let p = 0
      for (let i = 0; i < buf.length; i++) p = Math.max(p, Math.abs(buf[i]))
      level.value = p
      if (p > SPEECH_LEVEL) lastLoudAt = Date.now()
      else if (Date.now() - lastLoudAt > SILENCE_STOP_MS) stop()
    }, 100)
  }
  function stopMeter() {
    clearInterval(meterTimer)
    meterTimer = null
    meterCtx?.close()
    meterCtx = null
    level.value = 0
  }

  function loadPipe() {
    // Migrate values saved before the onnx-community switch.
    const model = (localStorage.getItem('ba_stt_model') || DEFAULT_MODEL).replace(
      /^Xenova\//,
      'onnx-community/'
    )
    if (!pipePromise || pipeModel !== model) {
      pipeModel = model
      pipePromise = (async () => {
        const { pipeline } = await import('@huggingface/transformers')
        return pipeline('automatic-speech-recognition', model, {
          // NOT q8: q8 decoders fail in onnxruntime-web ≥1.23 ("Missing
          // required scale … MatMulNBits" at session creation). q4 uses
          // MatMulNBits directly and skips the broken QDQ conversion.
          dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
          progress_callback: (p) => {
            if (p.status === 'progress' && typeof p.progress === 'number') {
              downloading.value = true
              modelProgress.value = Math.round(p.progress)
            }
            if (p.status === 'ready') downloading.value = false
          }
        })
      })().catch((e) => {
        pipePromise = null // failed download → retry on next attempt
        throw e
      })
    }
    return pipePromise
  }

  // Whisper wants 16 kHz mono Float32; the AudioContext resamples the webm/opus
  // recording for us during decode.
  async function decodeTo16k(blob) {
    const buf = await blob.arrayBuffer()
    const ctx = new AudioContext({ sampleRate: 16000 })
    try {
      const audio = await ctx.decodeAudioData(buf)
      const ch0 = audio.getChannelData(0)
      if (audio.numberOfChannels > 1) {
        const ch1 = audio.getChannelData(1)
        const mono = new Float32Array(ch0.length)
        for (let i = 0; i < ch0.length; i++) mono[i] = (ch0[i] + ch1[i]) / 2
        return mono
      }
      return Float32Array.from(ch0)
    } finally {
      ctx.close()
    }
  }

  async function transcribe(blob) {
    busy.value = true
    try {
      // Decode and level-gate BEFORE touching the model: a silent take must
      // fail instantly, not after a multi-minute first-run model download.
      const audio = await decodeTo16k(blob)
      // Whisper hallucinates ("you you you", "Thank you.") on silence — gate on
      // level so a dead/muted mic reports itself instead of producing garbage.
      let peak = 0
      let sum = 0
      for (let i = 0; i < audio.length; i++) {
        const a = Math.abs(audio[i])
        if (a > peak) peak = a
        sum += audio[i] * audio[i]
      }
      const rms = Math.sqrt(sum / (audio.length || 1))
      if (rms < 0.001) {
        error.value =
          'Mic captured silence — pick a different microphone in Settings → Speech to text, or check Windows sound settings.'
        return
      }
      // Quiet capture → boost to a level Whisper transcribes reliably.
      if (peak < 0.3) {
        const g = 0.9 / peak
        for (let i = 0; i < audio.length; i++) audio[i] *= g
      }
      const pipe = await loadPipe()
      const out = await pipe(audio, {
        chunk_length_s: 30,
        task: 'transcribe',
        no_repeat_ngram_size: 3 // blocks "you you you"-style decoder loops
      })
      // Whisper marks silence with bracket tokens ("[BLANK_AUDIO]") — drop them.
      const text = String(out?.text || '').replace(/\[[^\]]*\]/g, '').trim()
      if (text && typeof onText === 'function') onText(text)
      else if (!text) error.value = 'Heard nothing — try again closer to the mic.'
    } catch (e) {
      error.value = 'Transcription failed: ' + (e?.message || e)
    } finally {
      busy.value = false
      downloading.value = false
    }
  }

  async function start() {
    error.value = ''
    if (!supported) {
      error.value = 'Microphone not available on this device.'
      return
    }
    let stream
    const devId = localStorage.getItem('ba_stt_device') || ''
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: devId ? { deviceId: { ideal: devId } } : true
      })
    } catch {
      error.value = 'Microphone permission denied (check Windows mic privacy settings).'
      return
    }
    startMeter(stream)
    chunks = []
    recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data)
    }
    recorder.onstop = () => {
      stopMeter()
      stream.getTracks().forEach((t) => t.stop())
      recording.value = false
      clearTimeout(stopTimer)
      const blob = new Blob(chunks, { type: 'audio/webm' })
      chunks = []
      if (blob.size) transcribe(blob)
    }
    recorder.start()
    recording.value = true
    stopTimer = setTimeout(() => stop(), MAX_RECORD_MS)
  }

  function stop() {
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    // Flip the UI immediately — onstop finalizes (meter/stream cleanup) async.
    recording.value = false
  }

  // Mic button behavior: press to talk, press again to transcribe.
  async function toggle() {
    if (busy.value) return
    if (recording.value) stop()
    else await start()
  }

  return { supported, recording, busy, downloading, modelProgress, level, error, toggle }
}
