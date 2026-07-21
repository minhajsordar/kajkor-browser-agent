<template>
  <div v-if="modelValue.length" class="row q-gutter-xs q-px-md q-pt-sm">
    <div v-for="(img, i) in modelValue" :key="i" class="staged">
      <img :src="img.dataUrl" :alt="img.name" :title="img.name" />
      <q-btn
        round
        dense
        unelevated
        size="8px"
        icon="close"
        class="remove"
        @click="remove(i)"
      />
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  // [{ name, dataUrl }] — staged locally, uploaded on send.
  modelValue: { type: Array, default: () => [] }
})
const emit = defineEmits(['update:modelValue'])

function remove(i) {
  emit(
    'update:modelValue',
    props.modelValue.filter((_, n) => n !== i)
  )
}
</script>

<style scoped>
.staged {
  position: relative;
  width: 62px;
  height: 62px;
}
.staged img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid #e6e7ea;
}
.remove {
  position: absolute;
  top: -5px;
  right: -5px;
  background: rgba(0, 0, 0, 0.62);
  color: #fff;
  min-height: 0;
}
</style>
