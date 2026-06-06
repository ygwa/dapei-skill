<script setup lang="ts">
import { computed } from 'vue'

interface Step {
  name?: string
  action?: string
  description?: string
}

const props = defineProps<{
  steps: Step[]
  repo?: string
}>()

const graphCode = computed(() => {
  if (!props.steps?.length) return ''
  const lines = ['```mermaid', 'graph TD']
  for (let i = 0; i < props.steps.length; i++) {
    const label = (props.steps[i].action || props.steps[i].description || props.steps[i].name || `Step ${i + 1}`).replace(/"/g, "'")
    lines.push(`  S${i}["${label}"]`)
    if (i > 0) lines.push(`  S${i - 1} --> S${i}`)
  }
  lines.push('```')
  return lines.join('\n')
})
</script>

<template>
  <div class="behavior-flow" v-if="steps && steps.length">
    <ol class="behavior-steps">
      <li v-for="(step, i) in steps" :key="i" class="behavior-step">
        <span class="step-index">{{ i + 1 }}</span>
        <div class="step-body">
          <div v-if="step.name" class="step-name">{{ step.name }}</div>
          <div v-if="step.action" class="step-action">{{ step.action }}</div>
          <div v-if="step.description" class="step-description">{{ step.description }}</div>
        </div>
      </li>
    </ol>
    <details v-if="steps.length" class="behavior-flow-source">
      <summary>Flowchart</summary>
      <pre><code>{{ graphCode }}</code></pre>
    </details>
  </div>
</template>

<style scoped>
.behavior-flow {
  margin: 1.2rem 0;
}
.behavior-steps {
  list-style: none;
  padding: 0;
  margin: 0;
}
.behavior-step {
  display: flex;
  gap: 0.8rem;
  align-items: flex-start;
  padding: 0.6rem 0;
  border-bottom: 1px dashed var(--vp-c-divider, #e2e2e3);
}
.behavior-step:last-child {
  border-bottom: none;
}
.step-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.8rem;
  height: 1.8rem;
  border-radius: 50%;
  background: var(--vp-c-brand-1, #3451b2);
  color: white;
  font-weight: 600;
  font-size: 0.85rem;
  flex-shrink: 0;
}
.step-body {
  flex: 1;
}
.step-name {
  font-weight: 600;
  margin-bottom: 0.2rem;
}
.step-action {
  color: var(--vp-c-text-2, #555);
  font-size: 0.95rem;
}
.behavior-flow-source {
  margin-top: 0.8rem;
  font-size: 0.85rem;
}
.behavior-flow-source summary {
  cursor: pointer;
  color: var(--vp-c-text-2, #555);
  user-select: none;
}
.behavior-flow-source pre {
  margin-top: 0.5rem;
  padding: 0.8rem;
  background: var(--vp-c-bg-soft, #f6f6f7);
  border-radius: 6px;
  overflow-x: auto;
}
</style>
