<template>
  <!-- No session selected: centered composer to start one -->
  <div v-if="!store.selectedId" class="col column flex-center q-pa-lg empty-wrap">
    <div class="composer-zone column">
      <!-- project selector -->
      <div class="row justify-start q-mb-sm">
        <q-btn flat dense no-caps class="project-btn text-grey-8">
          <q-icon name="folder_open" size="16px" class="q-mr-xs" />
          <span class="ellipsis" style="max-width: 220px">
            {{ projects.current?.name || 'No Project' }}
          </span>
          <q-icon name="expand_more" size="16px" class="q-ml-xs" />
          <q-menu>
            <q-list dense style="min-width: 230px" class="q-py-xs">
              <q-item
                v-for="p in projects.projects"
                :key="p.name"
                clickable
                v-close-popup
                :active="p.name === projects.currentName"
                active-class="bg-grey-2 text-primary"
                @click="projects.setCurrent(p.name)"
              >
                <q-item-section avatar><q-icon name="folder" size="16px" /></q-item-section>
                <q-item-section><q-item-label lines="1">{{ p.name }}</q-item-label></q-item-section>
              </q-item>
              <q-separator v-if="projects.projects.length" class="q-my-xs" />
              <q-item
                v-if="projects.current?.projectId"
                clickable
                v-close-popup
                @click="settingsOpen = true"
              >
                <q-item-section avatar><q-icon name="tune" size="16px" /></q-item-section>
                <q-item-section>Project settings</q-item-section>
              </q-item>
              <q-item clickable v-close-popup @click="createOpen = true">
                <q-item-section avatar><q-icon name="create_new_folder" size="16px" /></q-item-section>
                <q-item-section>New Project</q-item-section>
              </q-item>
              <q-separator class="q-my-xs" />
              <q-item clickable v-close-popup @click="projects.setCurrent('')">
                <q-item-section avatar><q-icon name="folder_off" size="16px" /></q-item-section>
                <q-item-section>No Project</q-item-section>
              </q-item>
            </q-list>
          </q-menu>
        </q-btn>
      </div>

      <!-- composer card -->
      <div
        class="composer-card column"
        :class="{ dragging: dragOver }"
        @dragover.prevent="dragOver = true"
        @dragleave="dragOver = false"
        @drop.prevent="onDrop"
      >
        <StagedImages v-model="pending" />
        <q-input
          v-model="draft"
          type="textarea"
          borderless
          autogrow
          autofocus
          placeholder="Ask for actions — or attach an image to analyze"
          class="composer-input q-px-md q-pt-xs"
          @paste="onPaste"
          @keydown.enter.exact.prevent="start"
        />
        <div class="row items-center q-px-sm q-pb-sm">
          <ModelPicker :model-value="store.model" :options="modelOptions" @update:model-value="store.setModel" />
          <SkillPicker
            :model-value="store.newSessionSkillIds"
            class="q-ml-xs"
            @update:model-value="store.setNewSessionSkills"
          />
          <q-space />
          <ImageAttach ref="attachNew" v-model="pending" />
          <MicButton @text="appendDraft" />
          <q-btn
            round
            dense
            unelevated
            color="primary"
            icon="arrow_upward"
            class="q-ml-sm"
            :loading="store.sending"
            :disable="!draft.trim() && !pending.length"
            @click="start"
          />
        </div>
      </div>
      <!-- Where the composer's model/skills came from: a project default, or an
           override the user made this session. Only shown for a backend-backed
           project that actually sets defaults. -->
      <div v-if="projectHint" class="text-caption q-mt-xs row items-center inherit-hint">
        <q-icon name="folder" size="13px" class="q-mr-xs" />
        <template v-if="projectHint.overridden">
          <span class="text-grey-7">Overriding <b>{{ projectHint.name }}</b>'s defaults this session</span>
          <q-btn flat dense no-caps size="11px" label="Reset to project" class="q-ml-xs text-primary" @click="resetToProject" />
        </template>
        <span v-else class="text-grey-6">Model &amp; skills from project <b>{{ projectHint.name }}</b></span>
      </div>
      <div v-if="store.notice" class="text-caption text-negative q-mt-sm">{{ store.notice }}</div>
    </div>
    <CreateProjectDialog v-model="createOpen" />
    <ProjectSettingsDialog v-model="settingsOpen" :project="projects.current" />
  </div>

  <!-- Active session.
       min-width:0 here too: this column is itself a flex child, so without it
       the header's long goal sets its min size and the whole pane grows wider
       than the window. -->
  <div v-else class="col column full-height thread-pane">
    <FeedbackDialog v-model="feedbackOpen" :round="feedbackRound" :message-at="feedbackMessageAt" />
    <!-- header -->
    <div class="row items-center q-px-md q-py-sm thread-head">
      <!-- min-width:0 is load-bearing: `.ellipsis` is white-space:nowrap, and a
           flex child defaults to min-width:auto, so a long goal refuses to
           shrink and stretches the whole thread pane thousands of px wide. The
           transcript (max-width 860px, margin auto) then centres inside THAT
           and sits off-screen — the pane looks blank. Same root cause as the
           sidebar's sideways scroll. -->
      <div class="col col-clamp">
        <div class="text-body2 ellipsis">
          <span class="text-grey-6">{{ current?.project?.name || 'No project' }}</span>
          <span class="text-grey-5 q-mx-xs">/</span>
          <span class="text-weight-medium" :title="current?.goal">{{ goalLabel }}</span>
        </div>
        <div class="text-caption text-grey">
          <q-badge :color="badgeColor(current?.status)" :label="current?.status" />
          <span class="q-ml-sm">{{ progress }}</span>
          <span v-if="current?.sessionSummary" class="q-ml-sm">· compacted</span>
        </div>
      </div>
      <q-btn
        dense
        flat
        no-caps
        icon="compress"
        label="Compact"
        class="text-grey-7"
        :disable="store.currentBusy"
        @click="store.compact()"
      >
        <q-tooltip>Summarize the session to keep the model fast</q-tooltip>
      </q-btn>
    </div>

    <q-separator />

    <!-- conversation + activity -->
    <q-scroll-area ref="scrollArea" class="col" @scroll="onScroll">
      <div class="q-pa-md column q-gutter-sm thread-body">
        <!-- one block per round: user turn → what the agent did → its reply → outcomes -->
        <template v-for="(r, ri) in rounds" :key="ri">
          <ChatBubble
            role="user"
            :text="r.user.text"
            :task-id="current?.taskId"
            :attachments="r.user.attachments || []"
          />
          <RoundFlow
            v-if="r.events.length || r.running"
            :events="r.events"
            :running="r.running"
            :failed="r.failed"
            :duration="r.duration"
            :phase-label="r.running ? phaseLabel : ''"
          />
          <ChatBubble
            v-for="(m, mi) in r.replies"
            :key="ri + '-' + mi"
            :role="m.role"
            :text="m.text"
            :at="m.at"
          />
          <div v-if="r.chips.length || !r.running" class="row items-center q-gutter-xs">
            <!-- per-round feedback, LEFT-aligned: was this step right or wrong?
                 Feedback is on the round, not the whole session. -->
            <template v-if="(r.replies.length || r.events.length) && !r.running">
              <!-- Feedback rates the LIVE attempt, so it is disabled while an
                   older version is being viewed (r.viewingArchived). -->
              <q-btn
                dense
                flat
                round
                size="10px"
                :icon="likedRounds.has(r.round) ? 'thumb_up' : 'thumb_up_off_alt'"
                :class="likedRounds.has(r.round) ? 'text-primary round-fb' : 'text-grey-5 round-fb'"
                :disable="r.viewingArchived"
                @click="likeStep(r)"
              >
                <q-tooltip>{{ r.viewingArchived ? 'Switch to the latest version to rate it' : 'This step was right' }}</q-tooltip>
              </q-btn>
              <q-btn
                dense
                flat
                round
                size="10px"
                icon="thumb_down_off_alt"
                class="text-grey-5 round-fb"
                :disable="r.viewingArchived"
                @click="openFeedback(r)"
              >
                <q-tooltip>{{ r.viewingArchived ? 'Switch to the latest version to rate it' : 'Something wrong in this step? Tell the agent' }}</q-tooltip>
              </q-btn>
              <!-- Run again: regenerate the last round in place — any round,
                   including the initial task (round 0) and rounds that acted.
                   Keeps the previous attempt as a version. -->
              <q-btn
                v-if="ri === rounds.length - 1"
                dense
                flat
                round
                size="10px"
                icon="refresh"
                class="text-grey-5 round-fb"
                :disable="store.currentBusy || store.sending"
                @click="regenerate"
              >
                <q-tooltip>Run again</q-tooltip>
              </q-btn>
              <!-- Version switcher: flip between the attempts of this round. -->
              <template v-if="r.versions">
                <q-btn
                  dense
                  flat
                  round
                  size="10px"
                  icon="chevron_left"
                  class="text-grey-6 round-fb"
                  :disable="r.versions.index === 0 || store.currentBusy"
                  @click="setView(r, r.versions.index - 1)"
                >
                  <q-tooltip>Previous version</q-tooltip>
                </q-btn>
                <span class="text-caption text-grey-6 version-count">{{ r.versions.index + 1 }}/{{ r.versions.total }}</span>
                <q-btn
                  dense
                  flat
                  round
                  size="10px"
                  icon="chevron_right"
                  class="text-grey-6 round-fb"
                  :disable="r.versions.index === r.versions.total - 1 || store.currentBusy"
                  @click="setView(r, r.versions.index + 1)"
                >
                  <q-tooltip>Next version</q-tooltip>
                </q-btn>
              </template>
            </template>
            <q-chip
              v-for="(c, ci) in r.chips"
              :key="ci"
              dense
              square
              size="12px"
              :icon="c.icon"
              :class="c.neg ? 'chip-neg' : 'chip-ok'"
            >
              {{ c.label }}
            </q-chip>
          </div>

          <!-- sources / collected data belong to the round that gathered them -->
          <template v-if="ri === dataRound">
            <!-- research sources — HIDDEN by default, revealed on click -->
            <div v-if="sources.length" class="sources-box">
              <div class="sources-head row items-center" @click="sourcesOpen = !sourcesOpen">
                <q-icon :name="sourcesOpen ? 'expand_more' : 'chevron_right'" size="18px" class="q-mr-xs text-grey-7" />
                <span class="text-body2">{{ sourcesOpen ? 'Hide sources' : 'Show sources' }}</span>
                <q-badge class="q-ml-sm" color="grey-4" text-color="grey-9" :label="sources.length" />
                <q-space />
                <q-btn
                  dense
                  flat
                  no-caps
                  size="11px"
                  icon="table_rows"
                  label="Review data"
                  class="text-primary"
                  @click.stop="reviewOpen = true"
                />
              </div>
              <div v-if="sourcesOpen" class="q-px-sm q-pb-xs">
                <div v-for="s in sources" :key="s.index" class="src-row row items-start no-wrap">
                  <span class="src-i text-caption text-grey-7">[{{ s.index }}]</span>
                  <div class="col">
                    <a :href="s.url" target="_blank" rel="noopener" class="src-title">{{ s.title || s.url }}</a>
                    <div class="text-caption text-grey-6">
                      {{ hostOfUrl(s.url) }}
                      <span v-if="s.readError" class="text-negative">· unreadable</span>
                      <span v-else-if="s.text">· {{ Math.max(1, Math.round(s.text.length / 1000)) }}k chars read</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- non-source collected data -->
            <div v-else-if="collectedCount" class="collected-bar row items-center">
              <q-icon name="table_rows" size="16px" class="q-mr-sm text-grey-7" />
              <span class="text-body2">Collected {{ collectedCount }} record{{ collectedCount === 1 ? '' : 's' }}</span>
              <q-space />
              <q-btn dense flat no-caps size="12px" icon="visibility" label="Review" class="text-primary" @click="reviewOpen = true" />
            </div>
          </template>
        </template>

      </div>
    </q-scroll-area>

    <!-- Review: collected records as a table -->
    <q-dialog v-model="reviewOpen">
      <q-card style="width: 900px; max-width: 94vw; border-radius: 12px">
        <q-card-section class="row items-center q-pb-none">
          <div class="text-subtitle1 text-weight-medium">Collected records</div>
          <q-badge class="q-ml-sm" color="grey-4" text-color="grey-9" :label="collectedCount" />
          <q-space />
          <q-btn flat dense no-caps size="12px" icon="download" label="Copy JSON" class="text-grey-7 q-mr-xs" @click="copyRecords" />
          <q-btn v-close-popup flat round dense size="sm" icon="close" />
        </q-card-section>
        <q-card-section>
          <q-table
            :rows="collectedRows"
            :columns="collectedColumns"
            row-key="__i"
            dense
            flat
            bordered
            :pagination="{ rowsPerPage: 20 }"
            :rows-per-page-options="[20, 50, 100, 0]"
            class="review-table"
          >
            <template #body-cell="props">
              <q-td :props="props">
                <div class="cell-clip">{{ props.value }}</div>
              </q-td>
            </template>
          </q-table>
        </q-card-section>
      </q-card>
    </q-dialog>

    <!-- pending host command proposal -->
    <q-card v-if="store.pendingHost" flat bordered class="q-ma-sm host-card">
      <q-card-section class="q-pb-none">
        <div class="text-caption text-weight-medium row items-center">
          <q-icon name="terminal" size="16px" class="q-mr-xs" />
          Run this command?
          <q-badge v-if="store.pendingHost.danger" color="negative" label="destructive" class="q-ml-sm" />
        </div>
        <pre class="cmd">{{ store.pendingHost.argv.join(' ') }}</pre>
        <div class="text-caption text-grey q-mb-xs">{{ store.pendingHost.explanation }}</div>
        <q-input
          v-model="store.pendingHost.cwd"
          dense
          outlined
          label="Working directory"
          hint="Blank = your home folder. Set this if the command needs a specific folder."
        />
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat dense no-caps label="Deny" color="negative" @click="store.denyHost()" />
        <q-btn
          unelevated
          dense
          no-caps
          :color="store.pendingHost.danger ? 'negative' : 'primary'"
          label="Run"
          @click="store.runHost()"
        />
      </q-card-actions>
    </q-card>

    <!-- App launches run immediately (the instruction already asked for it); the
         outcome shows in the transcript, so there is no confirmation card. -->

    <!-- pending confirmation -->
    <q-banner v-if="pendingQuestion" dense class="bg-amber-2 q-ma-sm rounded-borders">
      {{ pendingQuestion.question }}
      <template #action>
        <q-btn flat dense label="Approve" @click="store.answer('yes')" />
        <q-btn flat dense label="Decline" color="negative" @click="store.answer('no')" />
      </template>
    </q-banner>

    <!-- the agent wants to change its own saved elements/skills -->
    <q-banner v-for="p in pendingProposals" :key="p.proposalId" dense class="proposal-banner q-mx-md q-mb-sm">
      <template #avatar><q-icon name="school" color="primary" size="20px" /></template>
      <div class="text-body2 prop-text">{{ p.summary }}</div>
      <!-- `.ellipsis` (nowrap) on a long selector/detail widened the banner to
           3146px, the same failure as the header. Wrap and clamp instead. -->
      <div v-if="p.detail" class="text-caption text-grey-7 prop-text" :title="p.detail">
        {{ p.detail }}
      </div>
      <template #action>
        <q-btn flat dense no-caps label="Not now" class="text-grey-7" @click="store.decideProposal(p.proposalId, 'decline')" />
        <!-- "…and do it now" is the user's answer to a genuinely ambiguous
             sentence ("do this AND save it as a todo"), so it is a separate
             button rather than a guess. Save stays the primary — it is the
             reversible one. -->
        <q-btn
          v-if="isAppProposal(p)"
          flat dense no-caps label="Save & run now" class="text-primary"
          @click="store.decideProposal(p.proposalId, 'approve', { run: true })"
        />
        <q-btn unelevated dense no-caps color="primary" :label="isAppProposal(p) ? 'Save' : 'Save it'" @click="store.decideProposal(p.proposalId, 'approve')" />
      </template>
    </q-banner>

    <!-- input -->
    <div class="q-px-md q-pb-md q-pt-xs relative-position">
      <!-- reading back through the session: one click returns to the newest -->
      <q-btn
        v-if="!stick"
        round
        dense
        unelevated
        icon="arrow_downward"
        class="jump-latest"
        @click="jumpToLatest"
      >
        <q-tooltip>Jump to latest</q-tooltip>
      </q-btn>
      <!-- prompts typed while a round was running; they run in order after it -->
      <div v-if="queued.length" class="queue-strip row items-center q-mb-xs">
        <q-icon name="schedule" size="14px" class="text-grey-7 q-mr-xs" />
        <span class="text-caption text-grey-7 q-mr-sm">
          Up next ({{ queued.length }})
        </span>
        <q-chip
          v-for="(q, i) in queued"
          :key="q.id"
          dense
          removable
          size="11px"
          class="queue-chip"
          :title="q.text"
          @remove="store.cancelQueued(q.id)"
        >
          {{ i + 1 }}. {{ q.text }}
        </q-chip>
      </div>

      <div
        class="composer-card column"
        :class="{ dragging: dragOver }"
        @dragover.prevent="dragOver = true"
        @dragleave="dragOver = false"
        @drop.prevent="onDrop"
      >
        <StagedImages v-model="pending" />
        <q-input
          v-model="draft"
          type="textarea"
          borderless
          autogrow
          dense
          class="composer-input q-px-md"
          :placeholder="
            store.currentBusy
              ? 'Working… type the next prompt and it runs when this finishes'
              : 'Follow up, or attach an image to analyze'
          "
          @paste="onPaste"
          @keydown.enter.exact.prevent="send"
        />
        <div class="row items-center q-px-sm q-pb-sm">
          <ModelPicker
            :model-value="current?.model || 'auto'"
            :options="modelOptions"
            :disable="store.currentBusy"
            @update:model-value="store.setSessionModel"
          />
          <SkillPicker
            :model-value="sessionSkillIds"
            :disable="store.currentBusy"
            class="q-ml-xs"
            @update:model-value="store.setSessionSkills"
          />
          <q-space />
          <ImageAttach ref="attach" v-model="pending" />
          <MicButton @text="appendDraft" />
          <!-- while busy: stop the run; the send button queues instead -->
          <q-btn
            v-if="store.currentBusy"
            round
            dense
            unelevated
            color="negative"
            icon="stop"
            class="q-ml-sm"
            :title="
              queued.length
                ? `Stop this run and discard ${queued.length} queued prompt(s)`
                : 'Stop this run'
            "
            @click="store.stopTask()"
          />
          <q-btn
            round
            dense
            unelevated
            :color="store.currentBusy ? 'grey-7' : 'primary'"
            :icon="store.currentBusy ? 'playlist_add' : 'arrow_upward'"
            class="q-ml-sm"
            :title="store.currentBusy ? 'Queue this prompt' : 'Send'"
            :loading="store.sending"
            :disable="!draft.trim() && !pending.length"
            @click="send"
          />
        </div>
      </div>
      <div v-if="store.notice" class="text-caption text-grey q-mt-xs">{{ store.notice }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { copyToClipboard, useQuasar } from 'quasar'
import { useSessionsStore } from '@/stores/sessions'
import { useProjectsStore } from '@/stores/projects'
import ChatBubble from '@/components/ChatBubble.vue'
import ModelPicker from '@/components/ModelPicker.vue'
import SkillPicker from '@/components/SkillPicker.vue'
import ImageAttach from '@/components/ImageAttach.vue'
import StagedImages from '@/components/StagedImages.vue'
import CreateProjectDialog from '@/components/CreateProjectDialog.vue'
import ProjectSettingsDialog from '@/components/ProjectSettingsDialog.vue'
import FeedbackDialog from '@/components/FeedbackDialog.vue'
import MicButton from '@/components/MicButton.vue'
import RoundFlow from '@/components/RoundFlow.vue'

const $q = useQuasar()
const store = useSessionsStore()
const projects = useProjectsStore()
const draft = ref('')
const scrollArea = ref(null)
const createOpen = ref(false)
const settingsOpen = ref(false)
const feedbackOpen = ref(false)
const feedbackRound = ref(0)
const feedbackMessageAt = ref(null)
// Rounds the user liked this session — drives the filled thumb-up icon. Local
// (reset per session); the like itself is persisted server-side.
const likedRounds = ref(new Set())

// Open the feedback form for a SPECIFIC round (the last assistant reply in it),
// so the correction is tied to what actually went wrong, not the whole session.
function openFeedback(r) {
  feedbackRound.value = typeof r.round === 'number' ? r.round : 0
  const lastReply = r.replies && r.replies.length ? r.replies[r.replies.length - 1] : null
  feedbackMessageAt.value = lastReply?.at || null
  feedbackOpen.value = true
}

// Like a round — a positive example, no form. Confirm immediately (fill the
// icon) so the click reads as done even while the request is in flight.
async function likeStep(r) {
  const round = typeof r.round === 'number' ? r.round : 0
  const lastReply = r.replies && r.replies.length ? r.replies[r.replies.length - 1] : null
  likedRounds.value = new Set(likedRounds.value).add(round)
  const okDone = await store.likeRound({ round, messageAt: lastReply?.at || null })
  if (okDone) $q.notify({ message: 'Marked this step as right', color: 'grey-8', timeout: 1200, position: 'top' })
}
// Run the last round again in place. Backend re-runs the same instruction through
// the same routing (re-launches, re-plans, re-answers); refreshCurrent shows it.
async function regenerate() {
  const ok = await store.regenerate()
  if (ok) $q.notify({ message: 'Running again…', color: 'grey-8', timeout: 1000, position: 'top' })
}
// Flip to another attempt of a round (view-only; the live attempt is untouched).
async function setView(r, index) {
  await store.setRoundView(r.round, index)
}

// Images staged for the next turn: [{name, dataUrl}]. Uploaded on send.
const pending = ref([])
const dragOver = ref(false)
const attach = ref(null) // in-session ImageAttach
const attachNew = ref(null) // new-session ImageAttach

const current = computed(() => store.current)

// Truncate BEFORE it reaches the DOM. `.ellipsis` is white-space:nowrap, and a
// nowrap text node's min-content width is its FULL length — an instruction-style
// goal measured 3089px and dragged the whole pane out to 3216px inside a ~996px
// parent, pushing the centred transcript off-screen (the pane looked blank).
// CSS containment on the ancestors is in place too, but not putting a
// thousand-pixel string in the box is what actually removes the failure mode.
// The full text stays available as a tooltip.
const GOAL_MAX = 110
const goalLabel = computed(() => {
  const g = String(current.value?.goal || '')
  return g.length > GOAL_MAX ? g.slice(0, GOAL_MAX).trimEnd() + '…' : g
})
const queued = computed(() => current.value?.queue || [])
const pendingProposals = computed(() =>
  (current.value?.proposals || []).filter((p) => p.status === 'pending')
)
// A `/todo` or `/routine` proposal — the only kind that can also be run on the
// spot, so it is the only one that gets the extra button.
const isAppProposal = (p) => p.kind === 'todo.add' || p.kind === 'routine.create'
const sessionSkillIds = computed(() =>
  (current.value?.useSkills || []).map((s) => s.skillId).filter(Boolean)
)

const modelOptions = computed(() => [
  { label: '🔮 Auto (best for the task)', value: 'auto' },
  ...store.models.map((m) => ({ label: m.name, value: m.name }))
])

// Inheritance hint for the new-session composer. selecting a project pushes its
// model/skills into the composer (projects.applySettings); this tells the user
// those values came from the project, and flags when they've changed them (an
// override) with a one-click way back to the project's defaults. Only for a
// backend-backed project that actually sets a model or skills.
const projectHint = computed(() => {
  const p = projects.current
  const s = p?.settings
  if (!p?.projectId || !s) return null
  const hasModel = !!s.model
  const hasSkills = Array.isArray(s.skillIds) && s.skillIds.length > 0
  if (!hasModel && !hasSkills) return null
  const modelOverridden = hasModel && store.model !== s.model
  const a = [...(store.newSessionSkillIds || [])].sort()
  const b = [...(s.skillIds || [])].sort()
  const skillsOverridden = hasSkills && (a.length !== b.length || a.some((x, i) => x !== b[i]))
  return { name: p.name, overridden: modelOverridden || skillsOverridden }
})
function resetToProject() {
  if (projects.current) projects.applySettings(projects.current)
}

// Route pasted/dropped image files through the same validation as the picker.
function currentAttach() {
  return attach.value || attachNew.value
}
function onPaste(e) {
  const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'))
  if (!files.length) return // plain text paste — leave it to the input
  e.preventDefault()
  currentAttach()?.add(files)
}
function onDrop(e) {
  dragOver.value = false
  currentAttach()?.add([...(e.dataTransfer?.files || [])])
}

// Upload staged images and return their ids. Clears the strip only once the
// upload succeeded, so a failed upload doesn't silently drop the user's files.
async function uploadPending() {
  if (!pending.value.length) return []
  const files = await store.uploadImages(pending.value)
  if (files.length) pending.value = []
  return files.map((f) => f.fileId)
}

async function start() {
  const g = draft.value.trim()
  const hasImages = pending.value.length > 0
  if (!g && !hasImages) return
  draft.value = ''

  if (hasImages) {
    // An image-led first turn is analysis, not a browser instruction — start an
    // idle session so the extension doesn't try to plan and execute it.
    const staged = pending.value
    await store.createSession(g || `Analyze ${staged[0].name}`, projects.current, { idle: true })
    if (!store.selectedId) return // creation failed; notice is already set
    const ids = await uploadPending()
    if (ids.length) await store.sendChat(g, ids)
    return
  }
  await store.createSession(g, projects.current)
}

// Sending while a round is running does NOT fail — the backend queues it and
// runs it when the current round reaches a terminal status.
async function send() {
  const m = draft.value.trim()
  if (!m && !pending.value.length) return
  draft.value = ''
  const ids = await uploadPending()
  await store.sendChat(m, ids)
}

// Dictated text lands in the draft (never auto-sends) so it can be reviewed.
function appendDraft(t) {
  draft.value = draft.value ? draft.value.replace(/\s+$/, '') + ' ' + t : t
}

const pendingQuestion = computed(() => {
  const q = current.value?.pendingQuestion
  return q && !q.answer ? q : null
})

const badgeColor = (status) =>
  ({ running: 'green', planning: 'amber', checking: 'amber', waiting: 'amber', done: 'blue', error: 'negative', stopped: 'grey' }[
    status
  ] || 'grey')

const haveOf = (t) => {
  const m = t?.plan?.target?.metric
  if (m === 'details') return t.extracted?.length || 0
  if (m === 'scrolls') return t.scrolls || 0
  if (m === 'actions') return t.actions || 0
  return t?.collected?.length || 0
}
const progress = computed(() => {
  const t = current.value
  const tg = t?.plan?.target
  return tg ? `${haveOf(t)}/${tg.count} ${tg.metric}` : ''
})

const phaseLabel = computed(() => {
  const t = current.value
  const n = t?.plan?.phases?.length || 0
  return n ? `· phase ${Math.min((t.currentPhaseIndex || 0) + (store.currentBusy ? 1 : 0), n)}/${n}` : ''
})

const events = computed(() => current.value?.events || [])

// Partition the session into rounds. Prefer the server-stamped `round` index
// (Phase 2) for exact grouping; fall back to timestamps for sessions created
// before rounds were stamped.
const rounds = computed(() => {
  const t = current.value
  if (!t) return []
  const chat = t.chat || []
  const evs = events.value
  const stamped =
    chat.some((m) => typeof m.round === 'number') || evs.some((e) => typeof e.round === 'number')
  const out = stamped ? roundsByIndex(t, chat, evs) : roundsByTime(t, chat, evs)
  return applyVariants(out, t)
})

// Version switcher overlay. The LAST round may have earlier attempts frozen in
// `variants[R].archived`; the live attempt is the flat arrays we just grouped.
// If the round's `viewIndex` points at a frozen attempt, swap that attempt's
// chat/events in for rendering (view-only — the live arrays are untouched). We
// annotate the round with `versions` (drives the `< n/m >` control) and
// `viewingArchived` (gates feedback — you only rate the live attempt).
function applyVariants(out, t) {
  if (!out.length) return out
  const last = out[out.length - 1]
  const v = (t.variants || {})[String(last.round)]
  if (!v || !Array.isArray(v.archived) || !v.archived.length) return out
  const total = v.archived.length + 1 // frozen attempts + the live one
  const idx = Number.isInteger(v.viewIndex) ? Math.min(Math.max(v.viewIndex, 0), total - 1) : total - 1
  last.versions = { total, index: idx }
  if (idx < v.archived.length) {
    const a = v.archived[idx] || {}
    const aChat = a.chat || []
    const au = aChat.find((m) => m.role === 'user')
    if (au) last.user = { text: au.text, at: au.at }
    last.replies = aChat.filter((m) => m.role !== 'user')
    last.events = a.events || []
    last.running = false
    last.failed = false
    last.viewingArchived = true
    last.chips = chipsFor(last)
  }
  return out
}

// Exact: group by the server `round` field. Round 0 is headed by the goal;
// round N (N≥1) by the Nth user chat turn. Compaction may drop an old round's
// user turn while keeping its events — such orphans keep a synthetic head.
function roundsByIndex(t, chat, evs) {
  const map = new Map()
  const get = (n) => {
    if (!map.has(n)) map.set(n, { round: n, user: null, replies: [], events: [] })
    return map.get(n)
  }
  get(0).user = { text: t.goal, at: t.createdAt }
  for (const m of chat) {
    const n = m.round || 0
    if (m.role === 'user') get(n).user = { text: m.text, at: m.at }
    else get(n).replies.push(m)
  }
  for (const e of evs) get(e.round || 0).events.push(e)
  const out = [...map.values()].sort((a, b) => a.round - b.round)
  const maxRound = out.length ? out[out.length - 1].round : 0
  finalizeRounds(out, t, (r) => r.round === maxRound)
  return out
}

// Fallback: a round = one user turn + the events/replies that followed it
// before the next user turn (by timestamp).
function roundsByTime(t, chat, evs) {
  const heads = [{ text: t.goal, at: t.createdAt }]
  const repliesPer = [[]]
  for (const m of chat) {
    if (m.role === 'user') {
      heads.push({ text: m.text, at: m.at })
      repliesPer.push([])
    } else {
      repliesPer[repliesPer.length - 1].push(m)
    }
  }
  const hts = heads.map((h) => Date.parse(h.at) || 0)
  const out = heads.map((h, i) => ({ round: i, user: h, replies: repliesPer[i], events: [], start: hts[i] }))
  for (const e of evs) {
    const ts = Date.parse(e.at) || 0
    let i = out.length - 1
    while (i > 0 && ts < hts[i]) i--
    out[i].events.push(e)
  }
  finalizeRounds(out, t, (_r, i) => i === out.length - 1)
  return out
}

// Shared: fill in head, running/failed flags, duration, and chips.
function finalizeRounds(out, t, isLast) {
  const busy = store.currentBusy
  out.forEach((r, i) => {
    if (!r.user) r.user = { text: '(earlier round — compacted)', at: r.events[0]?.at || t.createdAt }
    const last = isLast(r, i)
    r.running = last && busy
    const start = r.start ?? (Date.parse(r.user.at) || Date.parse(r.events[0]?.at) || 0)
    const evEnd = r.events.length ? Date.parse(r.events[r.events.length - 1].at) || start : start
    const repEnd = r.replies.length ? Date.parse(r.replies[r.replies.length - 1].at) || 0 : 0
    r.duration = Math.max(0, (r.running ? Date.now() : Math.max(evEnd, repEnd)) - start)
    r.failed = last && t.status === 'error'
    r.chips = chipsFor(r)
  })
}

// Outcome chips — prefer structured event `meta` (Phase 2, exact); fall back to
// parsing event/reply text for sessions without metadata.
function chipsFor(r) {
  const chips = []

  // Records collected: meta.collected is authoritative; else parse "Collected N".
  let rec = 0
  for (const e of r.events) {
    if (typeof e.meta?.collected === 'number') rec = Math.max(rec, e.meta.collected)
    else {
      const m = /collected\s+(\d+)/i.exec(e.msg || '')
      if (m) rec = Math.max(rec, Number(m[1]))
    }
  }
  if (rec) chips.push({ icon: 'table_rows', label: `${rec} record${rec === 1 ? '' : 's'} collected` })

  // Host command outcome: exact from meta.host, with exit status.
  const host = r.events.find((e) => e.meta?.host)
  if (host) {
    const m = host.meta
    if (m.denied) chips.push({ icon: 'block', label: 'command denied' })
    else if (m.timedOut) chips.push({ icon: 'timer_off', label: 'command timed out', neg: true })
    else if (m.exitCode === 0) chips.push({ icon: 'terminal', label: 'command ✓' })
    else chips.push({ icon: 'terminal', label: `command exited ${m.exitCode ?? '?'}`, neg: true })
  } else if (r.replies.some((m) => /🖥️|exit\s?code|proposed command/i.test(m.text || ''))) {
    chips.push({ icon: 'terminal', label: 'command' })
  }

  if (r.events.some((e) => e.kind === 'err'))
    chips.push({ icon: 'error_outline', label: 'issues — see flow', neg: true })
  return chips
}

const collectedCount = computed(() => current.value?.collected?.length || 0)
const reviewOpen = ref(false)

// Research sources: collected records that carry a URL. Rendered collapsed —
// the answer stays the focus, the evidence is one click away.
const sourcesOpen = ref(false)
const sources = computed(() =>
  (current.value?.collected || [])
    .filter((r) => r && r.url)
    .map((r, i) => ({
      index: r.index || i + 1,
      url: r.url,
      title: r.title || '',
      text: r.text || '',
      readError: r.readError || ''
    }))
)
function hostOfUrl(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, '')
  } catch {
    return u
  }
}

// Which round gathered the data — so the sources panel renders under THAT
// answer instead of at the bottom of the whole thread (below later questions).
const dataRound = computed(() => {
  const rs = rounds.value
  for (let i = rs.length - 1; i >= 0; i--) {
    const hit = rs[i].events.some(
      (e) => e.meta?.synthesized || /result link|read \d+ page|collected /i.test(e.msg || '')
    )
    if (hit) return i
  }
  return rs.length - 1
})

// Build table rows/columns from collected records. Columns are the union of
// non-internal keys (skip _-prefixed bookkeeping like _collectedAt); values are
// stringified so nested objects render in a cell.
const collectedRows = computed(() =>
  (current.value?.collected || []).map((rec, i) => {
    const row = { __i: i }
    for (const [k, v] of Object.entries(rec || {})) {
      if (k.startsWith('_')) continue
      row[k] = typeof v === 'object' && v !== null ? JSON.stringify(v) : v
    }
    return row
  })
)
const collectedColumns = computed(() => {
  const keys = []
  for (const row of collectedRows.value) {
    for (const k of Object.keys(row)) if (k !== '__i' && !keys.includes(k)) keys.push(k)
  }
  return keys.map((k) => ({
    name: k,
    label: k,
    field: k,
    align: 'left',
    sortable: true
  }))
})

async function copyRecords() {
  try {
    await copyToClipboard(JSON.stringify(current.value?.collected || [], null, 2))
    $q.notify({ message: 'Records copied as JSON', color: 'grey-8', timeout: 1200, position: 'top' })
  } catch {
    $q.notify({ message: 'Copy failed', color: 'negative', timeout: 1500 })
  }
}

// Autoscroll only when the user is already at the bottom — otherwise reading
// back through the transcript (during the 1.5s poll) would be yanked down.
const stick = ref(true)
function onScroll(info) {
  const remaining = info.verticalSize - info.verticalPosition - info.verticalContainerSize
  stick.value = remaining < 60
  // The user moved away from the bottom — drop any scroll we had queued, or it
  // would fire a frame later and yank them back down mid-scroll.
  if (!stick.value) cancelQueuedScroll()
}

let queuedScroll = null
function cancelQueuedScroll() {
  if (queuedScroll != null) {
    cancelAnimationFrame(queuedScroll)
    queuedScroll = null
  }
}

// Jump to the bottom. Two rAFs after nextTick so QScrollArea has re-measured
// the freshly rendered messages before we set the position (nextTick alone
// scrolls to a stale, smaller height and lands near the top).
async function scrollToBottom() {
  await nextTick()
  cancelQueuedScroll()
  queuedScroll = requestAnimationFrame(() => {
    queuedScroll = requestAnimationFrame(() => {
      queuedScroll = null
      scrollArea.value?.setScrollPosition?.('vertical', 1e9, 0)
    })
  })
}

// Explicit return-to-latest, so leaving the bottom is never a one-way trip.
function jumpToLatest() {
  stick.value = true
  scrollToBottom()
}

// Live updates: stick to the bottom only if the user is already there.
// The key is a STRING, not an array — a fresh array is a new reference every
// evaluation, so the watcher fired (and re-scrolled) on every poll even when
// nothing had been added.
watch(
  () => `${current.value?.chat?.length || 0}:${events.value.length}`,
  () => {
    if (stick.value) scrollToBottom()
  }
)
// A different session's data loaded → reset draft and jump to its latest message.
watch(
  () => current.value?.taskId,
  () => {
    draft.value = ''
    stick.value = true
    sourcesOpen.value = false // sources start hidden in every session
    likedRounds.value = new Set() // like state is per-session
    scrollToBottom()
  },
  { immediate: true }
)
</script>

<style scoped>
.empty-wrap {
  background: #ffffff;
}
.composer-zone {
  width: 100%;
  max-width: 640px;
}
.project-btn {
  font-size: 13px;
  border-radius: 8px;
}
/* Queued prompts scroll sideways inside their own strip so a long queue never
   widens the chat column (the page itself must never scroll horizontally). */
.queue-strip {
  overflow-x: auto;
  flex-wrap: nowrap;
  padding-bottom: 2px;
}
.queue-strip::-webkit-scrollbar {
  height: 4px;
}
.queue-chip {
  max-width: 260px;
  flex: 0 0 auto;
}
.queue-chip :deep(.q-chip__content) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}
.composer-card {
  background: #fff;
  border: 1px solid #e0e1e4;
  border-radius: 14px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
}
.composer-card.dragging {
  border-color: var(--q-primary);
  background: #f6f9ff;
}
.composer-card:focus-within {
  border-color: #b9c3f0;
  box-shadow: 0 1px 6px rgba(85, 112, 230, 0.12);
}
.composer-input :deep(textarea) {
  font-size: 14px;
}
.thread-head {
  background: #fafafa;
}
/* `min-width: 0` alone is NOT enough here. It lets a flex item shrink, but it
   does not stop the item's own CONTENT from sizing it — the header's nowrap
   goal text (measured at 2827px) still pushed this pane to 2954px inside a
   996px parent. `overflow: hidden` makes it a formatting context, so its
   automatic minimum size is 0 and content can no longer widen it.
   Both axes explicitly: `overflow-x` alone forces the other axis to `auto`,
   which is what produced a second scrollbar earlier. The q-scroll-area inside
   still does all the scrolling; this element just clips. */
.thread-pane {
  min-width: 0;
  overflow: hidden;
}
.col-clamp {
  min-width: 0;
}
/* Nothing in the transcript may widen the pane. A single long unbroken string
   (a URL, a selector, a pasted token) would otherwise reintroduce the same
   sideways overflow that hid the whole conversation. */
.thread-body {
  min-width: 0;
  overflow-wrap: anywhere;
}
.proposal-banner {
  border: 1px solid #d5ddf5;
  background: #f6f9ff;
  border-radius: 10px;
  min-width: 0;
  overflow: hidden;
}
/* Wrap and clamp to 2 lines instead of one nowrap line that can be any width. */
.prop-text {
  min-width: 0;
  overflow: hidden;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.proposal-banner :deep(.q-banner__content) {
  min-width: 0;
  overflow: hidden;
}
.jump-latest {
  position: absolute;
  top: -44px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  background: #fff;
  color: #3c4048;
  border: 1px solid #e0e1e4;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}
/* `margin: 0 auto` centres the transcript — which is why an over-wide parent
   pushed it off-screen instead of merely clipping it. The max-width is capped
   to the parent so centring can never move it out of view again. */
.thread-body {
  max-width: min(860px, 100%);
  margin: 0 auto;
  width: 100%;
}
.version-count {
  min-width: 26px;
  text-align: center;
  user-select: none;
}
.chip-ok {
  background: #eef1f4;
  color: #3c4048;
}
.chip-neg {
  background: #fbeaea;
  color: #b03a3a;
}
.collected-bar {
  border: 1px solid #e6e7ea;
  border-radius: 10px;
  background: #fafafb;
  padding: 6px 10px;
}
.sources-box {
  border: 1px solid #e6e7ea;
  border-radius: 10px;
  background: #fafafb;
  max-width: 100%;
}
.sources-head {
  padding: 6px 10px;
  cursor: pointer;
  user-select: none;
}
.sources-head:hover {
  background: rgba(0, 0, 0, 0.03);
  border-radius: 10px;
}
.src-row {
  padding: 4px 0 4px 4px;
  gap: 8px;
}
.src-i {
  flex: 0 0 auto;
  min-width: 26px;
}
.src-title {
  color: #3b5bdb;
  text-decoration: none;
  word-break: break-word;
}
.src-title:hover {
  text-decoration: underline;
}
.review-table {
  max-height: 62vh;
}
.review-table :deep(thead tr th) {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #fff;
}
.cell-clip {
  max-width: 320px;
  max-height: 4.5em;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
.host-card {
  background: rgba(246, 196, 83, 0.08);
}
.host-card .cmd {
  margin: 6px 0;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 6px;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
