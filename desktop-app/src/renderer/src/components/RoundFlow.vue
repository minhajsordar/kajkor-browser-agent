<template>
  <div class="flow" :class="{ failed: failed && !running }">
    <div class="flow-head row items-center" @click="open = !open">
      <q-spinner v-if="running" size="14px" class="q-mr-sm text-primary" />
      <q-icon
        v-else
        :name="open ? 'expand_more' : 'chevron_right'"
        size="16px"
        class="q-mr-xs text-grey-6"
      />
      <span class="text-caption text-weight-medium">{{ headline }}</span>
    </div>
    <div v-if="open" class="flow-body">
      <div v-for="(e, i) in events" :key="i" class="ev text-caption" :class="'ev-' + e.kind">
        <span class="text-grey">{{ timeOf(e.at) }}</span> {{ e.msg }}
      </div>
      <div v-if="running && !events.length" class="ev text-caption text-grey">Starting…</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  events: { type: Array, default: () => [] },
  running: { type: Boolean, default: false },
  failed: { type: Boolean, default: false },
  duration: { type: Number, default: 0 }, // ms
  phaseLabel: { type: String, default: '' }
})

// Live rounds start expanded; they collapse to the one-line summary when the
// round finishes. Failed rounds stay open so the error is visible.
const open = ref(props.running || props.failed)
watch(
  () => [props.running, props.failed],
  ([running, failed]) => {
    open.value = running || failed
  }
)

const durationLabel = computed(() => {
  const s = Math.max(1, Math.round(props.duration / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
})

const headline = computed(() => {
  if (props.running) return `Working${props.phaseLabel ? ' ' + props.phaseLabel : ''}…`
  if (props.failed) return `Failed after ${durationLabel.value}`
  return `Worked for ${durationLabel.value}`
})

const timeOf = (at) => {
  try {
    return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return ''
  }
}
</script>

<style scoped>
.flow {
  border: 1px solid #e6e7ea;
  border-radius: 10px;
  background: #fafafb;
  max-width: 100%;
}
.flow.failed {
  border-color: #f0c4c4;
  background: #fdf7f7;
}
.flow-head {
  padding: 6px 10px;
  cursor: pointer;
  user-select: none;
  color: #4a4c52;
}
.flow-head:hover {
  background: rgba(0, 0, 0, 0.03);
  border-radius: 10px;
}
.flow-body {
  padding: 2px 12px 8px 30px;
}
.ev {
  padding: 1px 0;
  word-break: break-word; /* long URLs in event messages must never widen the page */
}
.ev-err {
  color: #c62828;
}
.ev-ok {
  color: #2e7d32;
}
.ev-think {
  color: #6a7080;
}
</style>
