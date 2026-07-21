<template>
  <q-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)">
    <q-card class="create-project">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-subtitle1 text-weight-medium">Create Project</div>
        <q-space />
        <q-btn v-close-popup flat round dense size="sm" icon="close" />
      </q-card-section>

      <q-card-section>
        <div class="text-caption text-grey-7 q-mb-sm">Select folder(s)</div>

        <div
          v-for="(f, i) in folders"
          :key="f"
          class="folder-row row items-center q-mb-sm"
        >
          <q-icon name="folder" size="18px" class="q-mr-sm text-grey-7" />
          <div class="col ellipsis text-body2">{{ f }}</div>
          <q-btn flat round dense size="sm" icon="close" @click="folders.splice(i, 1)" />
        </div>

        <q-btn
          outline
          no-caps
          class="add-folder full-width text-grey-8"
          icon="add"
          label="Add Folder"
          @click="addFolder"
        />
      </q-card-section>

      <q-card-actions align="right" class="q-pt-none">
        <q-btn v-close-popup flat no-caps label="Skip" class="text-grey-7" />
        <q-btn
          v-if="folders.length"
          unelevated
          no-caps
          color="primary"
          label="Create"
          @click="create"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useProjectsStore } from '@/stores/projects'

const props = defineProps({ modelValue: { type: Boolean, default: false } })
const emit = defineEmits(['update:modelValue', 'created'])

const projects = useProjectsStore()
const folders = ref([])

watch(
  () => props.modelValue,
  (open) => {
    if (open) folders.value = []
  }
)

async function addFolder() {
  const dir = await projects.pickFolder()
  if (dir && !folders.value.includes(dir)) folders.value.push(dir)
}

// Each picked folder becomes a project (name = folder basename); the first one
// becomes the active project for the next conversation.
async function create() {
  let first = null
  for (const dir of folders.value) {
    const name = await projects.addFolder(dir)
    if (!first) first = name
  }
  if (first) projects.setCurrent(first)
  emit('created', first)
  emit('update:modelValue', false)
}
</script>

<style scoped>
.create-project {
  width: 460px;
  max-width: 92vw;
  border-radius: 12px;
}
.add-folder {
  border-style: dashed;
  border-radius: 8px;
}
.folder-row {
  border: 1px solid #e4e5e8;
  border-radius: 8px;
  padding: 6px 10px;
}
</style>
