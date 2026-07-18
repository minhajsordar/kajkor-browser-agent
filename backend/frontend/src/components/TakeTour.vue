<template>
  <Teleport to="body">
    <div v-if="modelValue" class="fixed inset-0 z-[9999] pointer-events-none">
      <!-- Overlay -->
      <div class="absolute inset-0"></div>

      <!-- Highlight -->
      <div v-if="rect" class="fixed rounded-lg border-2 border-blue-500
               shadow-[0_0_0_999999px_rgba(0,0,0,0.6)]
               transition-all" :style="highlightStyle" />

      <!-- Tooltip -->
      <div v-if="rect" ref="tooltipRef" class="fixed z-[10000] bg-white rounded-xl shadow-xl
               p-4 w-[300px] pointer-events-auto" :style="tooltipStyle">
        <div class="flex justify-between items-center mb-2">
          <span class="text-xs font-semibold text-blue-600">
            Step {{ stepIndex + 1 }} / {{ steps.length }}
          </span>
          <div class="flex gap-2">
            <button v-if="manualPosition" @mousedown="resetTooltipPosition" class="flex items-center text-base rounded cursor-pointer"
            :title="'Reset tooltip position'"
            >
              <q-icon name="replay" />
            </button>
            <button @mousedown="startDrag" class="flex items-center text-base rounded cursor-move"
            :title="'Drag tooltip'"
            >
              <q-icon name="drag_indicator" />
            </button>

            <button @click="finish" class="text-gray-400 hover:text-gray-600"
            
            :title="'Close tour'"
            >
              ✕
            </button>
          </div>
        </div>
        <h3 class="text-lg font-semibold mb-1">
          {{ currentStep.title }}
        </h3>

        <p class="text-sm text-gray-600 mb-3">
          {{ currentStep.content }}
        </p>

        <p v-if="hasAdvanceRules" class="text-xs text-blue-600 mb-2">
          👉 Perform the highlighted action to continue
        </p>
        <p v-if="operationalError" class="text-xs text-red-600 mb-2">
          {{ operationalError }}
        </p>

        <div class="flex justify-between">
          <button @click="prevStep" :disabled="stepIndex === 0"
            class="px-3 py-1 rounded bg-gray-200 disabled:opacity-50">
            Prev
          </button>

          <button @click="nextStep" class="px-4 py-1 rounded bg-blue-600 text-white">
            {{ isLast ? 'Finish' : 'Next' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from "vue"
import { useQuasar } from "quasar"

const $q = useQuasar()

/* ---------------- PROPS ---------------- */

const props = defineProps({
  modelValue: Boolean,
  steps: { type: Array, required: true }
})

const emit = defineEmits(["update:modelValue", "finish"])

/* ---------------- STATE ---------------- */

const stepIndex = ref(0)
const rect = ref(null)
const tooltipRef = ref(null)
const operationalError = ref('')
const isDragging = ref(false)
const dragOffset = ref({ x: 0, y: 0 })
const manualPosition = ref(null)

let targetEl = null
let cleanupScroll = null

let clickHandler = null
let dblClickHandler = null
let keyHandler = null
let focusHandler = null
let blurHandler = null

/* ---------------- COMPUTED ---------------- */

const currentStep = computed(() => props.steps[stepIndex.value] || {})
const isLast = computed(() => stepIndex.value === props.steps.length - 1)

const hasAdvanceRules = computed(() =>
  Array.isArray(currentStep.value?.advanceOn) &&
  currentStep.value.advanceOn.length > 0
)

/* ---------------- WATCHERS ---------------- */

watch(
  () => stepIndex.value,
  async () => {
    cleanup()
    await nextTick()
    setup()
  },
  { immediate: true }
)

watch(
  () => props.modelValue,
  v => !v && cleanup()
)

onBeforeUnmount(cleanup)

function startDrag(e) {
  isDragging.value = true

  const tooltipRect = tooltipRef.value.getBoundingClientRect()

  // offset inside tooltip
  dragOffset.value = {
    x: e.clientX - tooltipRect.left,
    y: e.clientY - tooltipRect.top
  }

  manualPosition.value = {
    top: tooltipRect.top,
    left: tooltipRect.left
  }
  document.addEventListener("mousemove", onDragMove)
  document.addEventListener("mouseup", stopDrag)
}
function onDragMove(e) {
  if (!isDragging.value) return

  manualPosition.value = {
    top: e.clientY - dragOffset.value.y,
    left: e.clientX - dragOffset.value.x
  }
}
function stopDrag() {
  isDragging.value = false
  document.removeEventListener("mousemove", onDragMove)
  document.removeEventListener("mouseup", stopDrag)
}


/* ---------------- CORE SETUP ---------------- */

function setup() {
  if (!currentStep.value?.target) return

  targetEl = document.querySelector(currentStep.value.target)
  if (!targetEl) return

  updateRect()

  targetEl.scrollIntoView({
    behavior: "smooth",
    block: "center",
    inline: "center"
  })

  // Listen scroll inside Quasar layout / scroll areas
  const scrollTarget = $q.app?.scrollTarget || window
  const onScroll = () => updateRect()
  scrollTarget.addEventListener("scroll", onScroll, true)

  cleanupScroll = () =>
    scrollTarget.removeEventListener("scroll", onScroll, true)

  setupAdvanceListeners()
}

function cleanup() {
  if (targetEl && clickHandler)
    targetEl.removeEventListener("click", clickHandler, true)

  if (targetEl && dblClickHandler)
    targetEl.removeEventListener("dblclick", dblClickHandler, true)

  if (targetEl && keyHandler)
    targetEl.removeEventListener("keydown", keyHandler, true)

  if (targetEl && focusHandler)
    targetEl.removeEventListener("focus", focusHandler, true)

  if (targetEl && blurHandler)
    targetEl.removeEventListener("blur", blurHandler, true)

  cleanupScroll?.()

  clickHandler = null
  dblClickHandler = null
  keyHandler = null
  focusHandler = null
  blurHandler = null
  cleanupScroll = null
  targetEl = null
  rect.value = null
}
function resolveTarget(selector) {
  if (!selector) return null
  return document.querySelector(selector)
}

/* ---------------- ADVANCE LOGIC ---------------- */

async function nextStep() {
  const nextIndex = stepIndex.value + 1
  const next = props.steps[nextIndex]
  const current = props.steps[stepIndex.value]

  // FINISH
  if (!next) {
    finish()
    return
  }

  const tar = resolveTarget(next.target);
  if (!tar) {
    // Target not found, stay on current step
    const advanceActions = (current?.advanceOn || []).join(" or ");
    operationalError.value = `Please complete the previous step first and do the required actions: ${advanceActions}`;
    return;
  }

  // ✅ SAFE TO MOVE
  operationalError.value = '';
  isDragging.value = false
  cleanup()
  stepIndex.value = nextIndex
}


function prevStep() {
  if (stepIndex.value === 0) return
  isDragging.value = false
  operationalError.value = '';
  cleanup()
  stepIndex.value--
}

function finish() {
  operationalError.value = '';
  cleanup()
  emit("update:modelValue", false)
  emit("finish")
}
function resetTooltipPosition() {
  manualPosition.value = null
}


/* ---------------- EVENT MATCHERS ---------------- */

function matchKeyEvent(e, rule) {
  const parts = rule.toLowerCase().split("+").map(p => p.trim())

  let needCtrl = false
  let needShift = false
  let needAlt = false
  let needMeta = false
  let key = null

  for (const p of parts) {
    if (p === "ctrl" || p === "control") needCtrl = true
    else if (p === "shift") needShift = true
    else if (p === "alt") needAlt = true
    else if (p === "meta" || p === "cmd" || p === "command")
      needMeta = true
    else key = p
  }

  if (needCtrl && !e.ctrlKey) return false
  if (needShift && !e.shiftKey) return false
  if (needAlt && !e.altKey) return false
  if (needMeta && !e.metaKey) return false

  if (key) {
    if (key === "enter" && e.key !== "Enter") return false
    if (key === "esc" && e.key !== "Escape") return false
  }

  return true
}

/* ---------------- LISTENER SETUP ---------------- */

function setupAdvanceListeners() {
  const rules = currentStep.value.advanceOn
  if (!Array.isArray(rules) || !targetEl) return

  // CLICK / SHIFT+CLICK
  if (rules.some(r => r.includes("click"))) {
    clickHandler = e => {
      if (
        rules.includes("click") ||
        (rules.includes("shift+click") && e.shiftKey)
      ) {
        e.stopPropagation()
        nextStep()
      }
    }
    targetEl.addEventListener("click", clickHandler, true)
  }

  // DOUBLE CLICK
  if (rules.includes("dblclick")) {
    dblClickHandler = e => {
      e.stopPropagation()
      nextStep()
    }
    targetEl.addEventListener("dblclick", dblClickHandler, true)
  }

  // KEY EVENTS
  if (rules.some(r => r.includes("enter"))) {
    keyHandler = e => {
      if (rules.some(rule => matchKeyEvent(e, rule))) {
        e.preventDefault()
        nextStep()
      }
    }
    targetEl.addEventListener("keydown", keyHandler, true)
  }

  // FOCUS
  if (rules.includes("focus")) {
    focusHandler = () => nextStep()
    targetEl.addEventListener("focus", focusHandler, true)
  }

  // BLUR
  if (rules.includes("blur")) {
    blurHandler = () => nextStep()
    targetEl.addEventListener("blur", blurHandler, true)
  }
}

/* ---------------- POSITIONING ---------------- */

function updateRect() {
  if (!targetEl) return
  rect.value = targetEl.getBoundingClientRect()
}

const highlightStyle = computed(() => {
  if (!rect.value) return {}
  const r = rect.value
  return {
    top: `${r.top}px`,
    left: `${r.left}px`,
    width: `${r.width}px`,
    height: `${r.height}px`
  }
})

const tooltipStyle = computed(() => {
  if (!rect.value) return {}

  const r = rect.value
  const gap = 12
  const width = 300
  const height = tooltipRef.value?.offsetHeight || 140

  let top = r.bottom + gap
  let left = r.left + r.width / 2 - width / 2

  if (top + height > window.innerHeight) {
    top = r.top - height - gap
  }

  left = Math.max(12, Math.min(left, window.innerWidth - width - 12))

  if (manualPosition.value) {
    top = manualPosition.value.top;
    left = manualPosition.value.left;
  }
  return {
    top: `${top}px`,
    left: `${left}px`
  }
})
</script>

<!--
  usages:
  - Show tour when modelValue is true
  - Steps array with target, title, content, waitForTarget, advanceOn
  - Each step can have waitForTarget (wait for element to appear) and advanceOn (events to trigger next)
  - advanceOn supports: click, dblclick, focus, blur, enter, esc, shift+click, ctrl+enter, etc.
  [{
  target: '#save-btn',
  title: 'Save',
  content: 'Click or press Ctrl + Enter',
  waitForTarget: true,
  advanceOn: ['click', 'ctrl+enter']
}

{
  target: '#price-input',
  title: 'Price',
  content: 'Enter price and leave field',
  advanceOn: ['blur']
}

{
  target: '#bulk',
  title: 'Bulk Action',
  content: 'Shift + click required',
  advanceOn: ['shift+click']
}] -->
