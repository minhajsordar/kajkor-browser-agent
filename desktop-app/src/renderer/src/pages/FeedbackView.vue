<template>
  <q-page class="q-pa-lg column items-center feedback-page">
    <div class="fb-wrap column">
      <div class="row items-center q-mb-md">
        <div class="text-h6 text-weight-medium">Feedback</div>
        <q-space />
        <q-btn flat round dense icon="refresh" class="text-grey-7" :loading="store.loading" @click="reload">
          <q-tooltip>Reload</q-tooltip>
        </q-btn>
      </div>

      <div class="text-caption text-grey-7 q-mb-md">
        Every 👍 / 👎 you leave on a step lands here. Turn a correction into a
        suggested fix (Analyze), keep a record without acting (Dismiss), or remove
        it. Analyzing posts an approval-gated proposal into that session.
      </div>

      <!-- filters -->
      <div class="row items-center q-gutter-sm q-mb-md">
        <q-select
          v-model="statusFilter"
          :options="statusOptions"
          dense
          outlined
          emit-value
          map-options
          options-dense
          label="Status"
          style="min-width: 150px"
          @update:model-value="reload"
        />
        <q-input
          v-model="hostFilter"
          dense
          outlined
          clearable
          placeholder="Filter by site (e.g. facebook.com)"
          style="min-width: 220px"
          @keydown.enter="reload"
          @clear="reload"
        />
        <q-btn no-caps dense color="primary" label="Apply" @click="reload" />
      </div>

      <div v-if="store.notice" class="text-caption text-negative q-mb-sm">{{ store.notice }}</div>

      <div v-if="!store.loading && !store.items.length" class="text-caption text-grey-6 q-pa-lg text-center">
        No feedback yet. Thumb-up or thumb-down a step in a chat to capture one.
      </div>

      <q-card
        v-for="f in store.items"
        :key="f.feedbackId"
        flat
        bordered
        class="q-mb-sm fb-card"
      >
        <q-card-section class="q-pb-xs">
          <div class="row items-center no-wrap">
            <q-icon :name="kindIcon(f.kind)" :color="kindColor(f.kind)" size="18px" class="q-mr-sm" />
            <div class="col min-w-0">
              <div class="text-body2 text-weight-medium ellipsis">
                {{ f.kind === 'up' ? 'Marked correct' : (f.whatWrong || 'Correction') }}
              </div>
              <div class="text-caption text-grey-6 ellipsis">
                {{ scopeLabel(f.scope) }}
                <span v-if="f.context?.host"> · {{ f.context.host }}</span>
                <span> · {{ f.source === 'nl' ? 'typed' : 'button' }}</span>
                <span> · {{ fmtDate(f.createdAt) }}</span>
              </div>
            </div>
            <q-badge :color="statusColor(f.status)" :label="f.status" class="q-ml-sm" />
          </div>
        </q-card-section>

        <q-card-section v-if="f.kind !== 'up'" class="q-py-none">
          <div v-if="f.whatExpected" class="text-caption">
            <span class="text-grey-7">Expected: </span>{{ f.whatExpected }}
          </div>
          <div v-if="f.context?.instruction || f.context?.goal" class="text-caption text-grey-6 q-mt-xs">
            <span class="text-grey-7">On: </span>{{ f.context.instruction || f.context.goal }}
          </div>
          <div v-if="f.analysis?.error" class="text-caption text-grey-7 q-mt-xs">
            <q-icon name="info" size="13px" /> {{ f.analysis.error }}
          </div>
          <div v-else-if="f.proposalId" class="text-caption text-primary q-mt-xs">
            <q-icon name="school" size="13px" /> Proposal created — approve it in that session's chat.
          </div>
        </q-card-section>

        <q-card-actions align="right" class="q-pt-none">
          <q-btn
            v-if="f.kind !== 'up' && f.status !== 'triaged'"
            flat
            dense
            no-caps
            size="12px"
            icon="auto_fix_high"
            label="Analyze"
            class="text-primary"
            :loading="busyId === f.feedbackId"
            @click="analyze(f)"
          />
          <q-btn
            v-if="f.status === 'open'"
            flat
            dense
            no-caps
            size="12px"
            icon="do_not_disturb_on"
            label="Dismiss"
            class="text-grey-7"
            @click="dismiss(f)"
          />
          <q-btn
            flat
            dense
            no-caps
            size="12px"
            icon="delete_outline"
            label="Delete"
            class="text-grey-6"
            @click="remove(f)"
          />
        </q-card-actions>
      </q-card>
    </div>
  </q-page>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { useFeedbackStore } from '@/stores/feedback'

const $q = useQuasar()
const store = useFeedbackStore()

const statusOptions = [
  { label: 'All', value: '' },
  { label: 'Open', value: 'open' },
  { label: 'Triaged', value: 'triaged' },
  { label: 'Dismissed', value: 'dismissed' }
]
const statusFilter = ref('')
const hostFilter = ref('')
const busyId = ref('')

function reload() {
  store.load({ host: (hostFilter.value || '').trim(), status: statusFilter.value })
}

function kindIcon(k) {
  return k === 'up' ? 'thumb_up' : k === 'down' ? 'thumb_down' : 'sticky_note_2'
}
function kindColor(k) {
  return k === 'up' ? 'primary' : k === 'down' ? 'negative' : 'grey-7'
}
function statusColor(s) {
  return { open: 'amber-8', triaged: 'primary', dismissed: 'grey-6' }[s] || 'grey-6'
}
// Same scope wording as the Settings "Learned lessons" pane.
function scopeLabel(scope) {
  if (!scope || scope.type === 'global') return 'Everywhere'
  if (scope.type === 'host') return scope.value || 'This site'
  if (scope.type === 'task-type') return `${scope.value} tasks`
  if (scope.type === 'tool') return `${scope.value} step`
  return scope.type
}
function fmtDate(iso) {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? '' : new Date(t).toLocaleString()
}

async function analyze(f) {
  busyId.value = f.feedbackId
  const r = await store.analyze(f.feedbackId)
  busyId.value = ''
  if (r.ok && r.proposal) {
    $q.notify({ message: 'Suggested a fix — approve it in that session', color: 'grey-8', timeout: 1800, position: 'top' })
  } else {
    $q.notify({ message: r.error || 'No concrete fix — saved for review', color: 'grey-8', timeout: 1800, position: 'top' })
  }
  reload()
}
async function dismiss(f) {
  if (await store.dismiss(f.feedbackId)) {
    $q.notify({ message: 'Dismissed', color: 'grey-8', timeout: 1200, position: 'top' })
  }
}
async function remove(f) {
  $q.dialog({
    title: 'Delete feedback',
    message: 'Remove this feedback item permanently?',
    cancel: true,
    ok: { label: 'Delete', color: 'negative', flat: true }
  }).onOk(async () => {
    if (await store.remove(f.feedbackId)) {
      $q.notify({ message: 'Deleted', color: 'grey-8', timeout: 1200, position: 'top' })
    }
  })
}

onMounted(reload)
</script>

<style scoped>
.feedback-page {
  background: #ffffff;
}
.fb-wrap {
  width: 100%;
  max-width: 720px;
}
/* min-width:0 so a long correction clamps instead of widening the card/page. */
.min-w-0 {
  min-width: 0;
}
.fb-card {
  border-radius: 10px;
}
</style>
