<template>
  <div class="row group" :class="isUser ? 'justify-end' : 'justify-start'">
    <div class="bubble" :class="isUser ? 'me' : 'ai'">
      <div class="who text-caption">{{ isUser ? 'You' : 'Agent' }}</div>
      <div v-if="attachments.length" class="row q-gutter-xs q-mb-xs justify-end">
        <img
          v-for="a in attachments"
          :key="a.fileId"
          :src="fileUrl(a)"
          :alt="a.name"
          :title="a.name"
          class="attach-thumb"
          @click="preview = fileUrl(a)"
        />
      </div>
      <div v-if="text" class="txt">{{ text }}</div>
      <div v-if="!isUser" class="footer row items-center q-gutter-xs">
        <span v-if="stamp" class="text-caption text-grey-5">{{ stamp }}</span>
        <q-btn flat dense round size="10px" icon="content_copy" class="copy text-grey-6" @click="copy">
          <q-tooltip>Copy</q-tooltip>
        </q-btn>
      </div>
    </div>

    <!-- click a thumbnail to see it full size -->
    <q-dialog v-model="previewOpen">
      <q-card class="bg-white">
        <img :src="preview" class="preview-img" />
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { copyToClipboard, useQuasar } from 'quasar'
import { getBackendUrl } from '@/boot/backend'

const props = defineProps({
  role: { type: String, default: 'assistant' },
  text: { type: String, default: '' },
  at: { type: String, default: '' },
  taskId: { type: String, default: '' },
  attachments: { type: Array, default: () => [] }
})

const preview = ref('')
const previewOpen = computed({
  get: () => !!preview.value,
  set: (v) => {
    if (!v) preview.value = ''
  }
})

// Images are served by the backend, not embedded in the transcript.
function fileUrl(a) {
  return `${getBackendUrl()}/tasks/${props.taskId}/files/${a.fileId}`
}

const $q = useQuasar()
const isUser = computed(() => props.role === 'user')

const stamp = computed(() => {
  if (!props.at) return ''
  try {
    return new Date(props.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
})

async function copy() {
  try {
    await copyToClipboard(props.text || '')
    $q.notify({ message: 'Copied', color: 'grey-8', timeout: 900, position: 'top' })
  } catch {
    $q.notify({ message: 'Copy failed', color: 'negative', timeout: 1500 })
  }
}
</script>

<style scoped>
.bubble {
  max-width: 78%;
  padding: 8px 11px;
  border-radius: 12px;
  border: 1px solid transparent;
}
.bubble.me {
  background: #f2f3f5;
  border-color: #e6e7ea;
}
.bubble.ai {
  background: transparent;
  max-width: 100%;
  padding-left: 0;
}
.who {
  opacity: 0.6;
  margin-bottom: 2px;
}
.txt {
  white-space: pre-wrap;
  word-break: break-word;
}
.footer {
  margin-top: 2px;
  opacity: 0;
  transition: opacity 0.12s;
}
.group:hover .footer {
  opacity: 1;
}
.copy {
  min-height: 0;
}
.attach-thumb {
  max-width: 190px;
  max-height: 150px;
  border-radius: 8px;
  border: 1px solid #e6e7ea;
  cursor: zoom-in;
  display: block;
}
.preview-img {
  display: block;
  max-width: 88vw;
  max-height: 88vh;
}
</style>
