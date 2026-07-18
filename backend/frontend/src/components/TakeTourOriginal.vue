<template>
    <Teleport to="body">
        <div v-if="modelValue" class="tour-overlay">
            <div class="tour-highlight" :style="highlightStyle"></div>

            <div class="tour-box" :style="boxStyle">
                <h3>{{ currentStep.title }}</h3>
                <p>{{ currentStep.content }}</p>

                <div class="tour-actions">
                    <button @click="prevStep" :disabled="stepIndex === 0">Prev</button>
                    <button v-if="!isLast" @click="nextStep">Next</button>
                    <button v-else @click="finish">Finish</button>
                    <button class="skip" @click="finish">Skip</button>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick } from "vue"

const props = defineProps({
    modelValue: Boolean,
    steps: {
        type: Array,
        required: true
    }
})

const emit = defineEmits(["update:modelValue", "finish"])

const stepIndex = ref(0)
const targetEl = ref(null)

const currentStep = computed(() => props.steps[stepIndex.value])
const isLast = computed(() => stepIndex.value === props.steps.length - 1)

watch(
    () => stepIndex.value,
    async () => {
        await nextTick()
        updateTarget()
    },
    { immediate: true }
)

watch(
    () => props.modelValue,
    val => {
        if (val) {
            stepIndex.value = 0
            nextTick(updateTarget)
        }
    }
)

function updateTarget() {
    targetEl.value = document.querySelector(currentStep.value.target)
    targetEl.value?.scrollIntoView({ behavior: "smooth", block: "center" })
}

const highlightStyle = computed(() => {
    if (!targetEl.value) return {}
    const rect = targetEl.value.getBoundingClientRect()
    return {
        top: `${rect.top + window.scrollY}px`,
        left: `${rect.left + window.scrollX}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`
    }
})

const boxStyle = computed(() => {
    if (!targetEl.value) return {}
    const rect = targetEl.value.getBoundingClientRect()
    return {
        top: `${rect.bottom + window.scrollY + 10}px`,
        left: `${rect.left + window.scrollX}px`
    }
})

function nextStep() {
    if (!isLast.value) stepIndex.value++
}

function prevStep() {
    if (stepIndex.value > 0) stepIndex.value--
}

function finish() {
    emit("update:modelValue", false)
    emit("finish")
}
</script>

<style scoped>
.tour-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 9999;
}

.tour-highlight {
    position: absolute;
    border: 2px solid #42b883;
    border-radius: 6px;
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.6);
    pointer-events: none;
}

.tour-box {
    position: absolute;
    background: #fff;
    padding: 16px;
    width: 280px;
    border-radius: 8px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, .2);
}

.tour-box h3 {
    margin: 0 0 8px;
}

.tour-actions {
    display: flex;
    justify-content: space-between;
    margin-top: 12px;
}

.tour-actions button {
    padding: 6px 12px;
}

.skip {
    background: transparent;
    border: none;
    color: #999;
}
</style>
