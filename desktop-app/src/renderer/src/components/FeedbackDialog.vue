<template>
  <q-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)">
    <q-card style="width: 520px; max-width: 94vw; border-radius: 12px">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-subtitle1 text-weight-medium">What did the agent get wrong?</div>
        <q-space />
        <q-btn v-close-popup flat round dense size="sm" icon="close" />
      </q-card-section>

      <q-card-section class="q-gutter-sm">
        <div class="text-caption text-grey-7">
          Captured with this round's context. If it maps to a concrete fix (reordering a skill's steps,
          clarifying it, or repointing an element), a proposal appears below for you to approve.
        </div>
        <q-input
          v-model="whatWrong"
          label="What went wrong"
          type="textarea"
          dense
          outlined
          autogrow
          input-style="min-height: 64px"
        />
        <q-input
          v-model="whatExpected"
          label="What should have happened (optional)"
          type="textarea"
          dense
          outlined
          autogrow
          input-style="min-height: 64px"
        />
        <q-select
          v-model="scopeType"
          :options="scopeOptions"
          label="Applies to"
          dense
          outlined
          emit-value
          map-options
          options-dense
          hint="How widely this correction should apply."
        />
      </q-card-section>

      <q-card-actions align="right">
        <q-btn v-close-popup flat no-caps label="Cancel" />
        <q-btn unelevated no-caps color="primary" label="Send" :loading="sending" :disable="!whatWrong.trim()" @click="send" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useQuasar } from 'quasar'
import { useSessionsStore } from '@/stores/sessions'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  round: { type: Number, default: 0 },
  messageAt: { type: String, default: null }
})
const emit = defineEmits(['update:modelValue'])

const $q = useQuasar()
const store = useSessionsStore()
const whatWrong = ref('')
const whatExpected = ref('')
const scopeType = ref('host')
const sending = ref(false)

const scopeOptions = [
  { label: 'This site only', value: 'host' },
  { label: 'This kind of task', value: 'task-type' },
  { label: 'Everywhere', value: 'global' }
]

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      whatWrong.value = ''
      whatExpected.value = ''
      scopeType.value = 'host'
    }
  }
)

async function send() {
  if (!whatWrong.value.trim()) return
  sending.value = true
  const fb = await store.submitFeedback({
    round: props.round,
    messageAt: props.messageAt,
    whatWrong: whatWrong.value.trim(),
    whatExpected: whatExpected.value.trim(),
    scope: { type: scopeType.value }
  })
  emit('update:modelValue', false)
  // Turn the correction into a fix proposal, if it maps to one. Non-blocking to
  // the dialog close; the proposal (or the "saved for review" outcome) is shown
  // via a toast, and any proposal lands in the transcript below.
  if (fb?.feedbackId) {
    const res = await store.analyzeFeedback(fb.feedbackId)
    if (res?.ok && res.proposal) {
      $q.notify({ message: 'Suggested a fix — review it below', color: 'primary', timeout: 2500, position: 'top' })
    } else {
      $q.notify({ message: 'Thanks — saved for review', color: 'grey-8', timeout: 1800, position: 'top' })
    }
  }
  sending.value = false
}
</script>
