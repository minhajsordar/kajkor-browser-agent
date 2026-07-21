<template>
  <q-btn flat dense no-caps size="13px" class="model-btn text-grey-8" :disable="disable">
    <span class="ellipsis model-label">{{ currentLabel }}</span>
    <q-icon name="expand_less" size="14px" class="q-ml-xs" />
    <q-menu anchor="top left" self="bottom left" class="model-menu">
      <q-list dense style="min-width: 250px; max-height: 320px" class="scroll q-py-xs">
        <q-item-label header class="text-caption text-grey-7 q-pb-xs">Model</q-item-label>
        <q-item
          v-for="o in options"
          :key="o.value"
          clickable
          v-close-popup
          :active="o.value === modelValue"
          active-class="text-primary bg-grey-2"
          @click="$emit('update:modelValue', o.value)"
        >
          <q-item-section>
            <q-item-label class="text-body2">{{ o.label }}</q-item-label>
          </q-item-section>
          <q-item-section v-if="o.value === modelValue" side>
            <q-icon name="check" size="14px" color="primary" />
          </q-item-section>
        </q-item>
        <q-item v-if="!options.length">
          <q-item-section class="text-caption text-grey">
            No models — is Ollama running?
          </q-item-section>
        </q-item>
      </q-list>
    </q-menu>
  </q-btn>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: 'auto' },
  options: { type: Array, default: () => [] }, // [{label, value}]
  disable: { type: Boolean, default: false }
})
defineEmits(['update:modelValue'])

const currentLabel = computed(
  () => props.options.find((o) => o.value === props.modelValue)?.label || props.modelValue || 'Model'
)
</script>

<style scoped>
.model-btn {
  font-weight: 400;
}
.model-label {
  max-width: 200px;
}
</style>
