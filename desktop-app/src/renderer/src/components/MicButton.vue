<template>
  <q-btn
    round
    flat
    dense
    size="sm"
    :icon="recording ? 'stop' : 'mic'"
    :class="recording ? 'rec text-negative' : 'text-grey-6'"
    :style="recording ? { boxShadow: `0 0 0 ${2 + level * 14}px rgba(198, 40, 40, 0.18)` } : null"
    :loading="busy"
    :disable="disable || !supported"
    @click="toggle"
  >
    <q-tooltip>{{ hint }}</q-tooltip>
  </q-btn>
</template>

<script setup>
import { computed, watch } from 'vue'
import { useQuasar } from 'quasar'
import { useSpeech } from '@/composables/useSpeech'

const props = defineProps({ disable: { type: Boolean, default: false } })
const emit = defineEmits(['text'])

const $q = useQuasar()
const { supported, recording, busy, downloading, modelProgress, level, error, toggle } = useSpeech(
  (t) => emit('text', t)
)

const hint = computed(() => {
  if (!supported) return 'Microphone not available'
  if (recording.value)
    return `Listening — level ${Math.round(level.value * 100)}% · press to stop & transcribe`
  if (downloading.value) return `Downloading speech model… ${modelProgress.value}%`
  if (busy.value) return 'Transcribing…'
  return 'Dictate (speech-to-text)'
})

watch(error, (e) => {
  if (e) $q.notify({ message: e, color: 'negative', timeout: 3000 })
})
</script>

<style scoped>
.rec {
  animation: mic-pulse 1.2s ease-in-out infinite;
}
@keyframes mic-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}
</style>
