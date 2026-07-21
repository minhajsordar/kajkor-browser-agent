<template>
  <q-btn flat dense no-caps size="13px" class="skill-btn text-grey-8" :disable="disable">
    <q-icon name="auto_awesome" size="14px" class="q-mr-xs" />
    <span class="ellipsis skill-label">{{ currentLabel }}</span>
    <q-icon name="expand_less" size="14px" class="q-ml-xs" />
    <q-menu anchor="top left" self="bottom left">
      <q-list dense style="min-width: 280px; max-height: 340px" class="scroll q-py-xs">
        <q-item-label header class="text-caption text-grey-7 q-pb-none">
          Skills the planner may use
        </q-item-label>
        <q-item-label caption class="q-px-md q-pb-xs text-grey-6">
          Fewer skills = a shorter prompt = faster planning. Selecting none
          leaves them all available.
        </q-item-label>

        <q-item clickable :disable="allSelected" @click="selectAll">
          <q-item-section avatar style="min-width: 34px">
            <q-icon name="done_all" size="18px" :color="allSelected ? 'grey-5' : 'primary'" />
          </q-item-section>
          <q-item-section>
            <q-item-label class="text-body2 text-weight-medium">Select all</q-item-label>
          </q-item-section>
        </q-item>
        <q-separator class="q-my-xs" />

        <q-item v-for="s in skills" :key="s.skillId" clickable @click="toggle(s.skillId)">
          <q-item-section avatar style="min-width: 34px">
            <q-checkbox
              :model-value="isOn(s.skillId)"
              dense
              size="xs"
              @update:model-value="toggle(s.skillId)"
            />
          </q-item-section>
          <q-item-section>
            <q-item-label class="text-body2">{{ s.name }}</q-item-label>
            <q-item-label caption class="ellipsis">
              {{ s.kind === 'collection' ? 'collection' : s.action || 'action' }} · {{ s.urlPattern }}
            </q-item-label>
          </q-item-section>
        </q-item>

        <q-item v-if="!skills.length">
          <q-item-section class="text-caption text-grey">
            No learned skills yet — teach one from the extension.
          </q-item-section>
        </q-item>
      </q-list>
    </q-menu>
  </q-btn>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useLibraryStore } from '@/stores/library'

const props = defineProps({
  // Selected skillIds. EMPTY means "no restriction" — every skill is offered
  // to the planner, which is also what a brand-new session does.
  modelValue: { type: Array, default: () => [] },
  disable: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue'])

const library = useLibraryStore()
const skills = computed(() => library.skills || [])
const selected = computed(() => props.modelValue || [])

// "All" is both the explicit full set and the empty (unrestricted) default —
// they plan identically, so showing them as the same state avoids a
// distinction the user would have to reason about.
const allSelected = computed(
  () => !selected.value.length || selected.value.length >= skills.value.length
)

const currentLabel = computed(() => {
  if (!skills.value.length) return 'Skills'
  if (allSelected.value) return `All skills (${skills.value.length})`
  return `${selected.value.length} of ${skills.value.length} skills`
})

// Empty selection = every skill is available, so every box reads as checked.
function isOn(id) {
  return !selected.value.length || selected.value.includes(id)
}

function toggle(id) {
  // An empty selection is unrestricted, so unchecking the last box lands back
  // on "all" rather than on an unusable "no skills" state.
  const base = selected.value.length ? selected.value : skills.value.map((s) => s.skillId)
  const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id]
  emit('update:modelValue', next)
}

function selectAll() {
  emit('update:modelValue', [])
}

onMounted(() => {
  if (!library.skills.length) library.loadSkills()
})
</script>

<style scoped>
.skill-btn {
  font-weight: 400;
}
.skill-label {
  max-width: 180px;
}
</style>
