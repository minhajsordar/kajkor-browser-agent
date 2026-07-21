<template>
  <span>
    <q-btn
      flat
      dense
      round
      size="12px"
      icon="image"
      class="text-grey-7"
      :disable="disable"
      @click="pick"
    >
      <q-tooltip>Attach an image (or paste / drag one in)</q-tooltip>
    </q-btn>
    <input
      ref="input"
      type="file"
      accept="image/*"
      multiple
      class="hidden-input"
      @change="onPick"
    />
  </span>
</template>

<script setup>
import { ref } from 'vue'
import { useQuasar } from 'quasar'

const MAX_FILES = 4
const MAX_BYTES = 8 * 1024 * 1024

const props = defineProps({
  // Already-staged images, so the picker can enforce the total cap.
  modelValue: { type: Array, default: () => [] },
  disable: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue'])

const $q = useQuasar()
const input = ref(null)

function pick() {
  input.value?.click()
}

async function onPick(e) {
  await add([...(e.target.files || [])])
  // Clear it, or picking the same file twice in a row fires no change event.
  e.target.value = ''
}

// Read files into data URLs and stage them. Exposed so the composer can feed
// in paste and drag-drop files through the same validation.
async function add(files) {
  const images = files.filter((f) => f.type.startsWith('image/'))
  if (!images.length) return

  const room = MAX_FILES - props.modelValue.length
  if (room <= 0) {
    $q.notify({ message: `Up to ${MAX_FILES} images per message.`, color: 'grey-8', timeout: 1600, position: 'top' })
    return
  }

  const staged = []
  for (const f of images.slice(0, room)) {
    if (f.size > MAX_BYTES) {
      $q.notify({ message: `"${f.name}" is larger than 8MB.`, color: 'negative', timeout: 2200, position: 'top' })
      continue
    }
    try {
      staged.push({ name: f.name || 'image', dataUrl: await readAsDataUrl(f) })
    } catch {
      $q.notify({ message: `Could not read "${f.name}".`, color: 'negative', timeout: 2000, position: 'top' })
    }
  }
  if (staged.length) emit('update:modelValue', [...props.modelValue, ...staged])
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

defineExpose({ add })
</script>

<style scoped>
.hidden-input {
  display: none;
}
</style>
