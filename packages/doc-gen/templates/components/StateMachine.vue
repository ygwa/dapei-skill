<script setup lang="ts">
import { computed } from 'vue'

interface Transition {
  trigger: string
  from?: string | null
  to: string
  behavior_id?: string
}

const props = defineProps<{
  entity: string
  states: string[]
  transitions: Transition[]
  initial_state?: string
}>()

const diagramCode = computed(() => {
  const lines = ['```mermaid', 'stateDiagram-v2']
  const init = props.initial_state || props.states[0]
  if (init) lines.push(`  [*] --> ${init}`)
  for (const t of props.transitions || []) {
    const from = t.from || '[*]'
    const trigger = t.trigger ? `: ${t.trigger}` : ''
    lines.push(`  ${from} --> ${t.to}${trigger}`)
  }
  lines.push('```')
  return lines.join('\n')
})
</script>

<template>
  <div class="state-machine" v-if="states && states.length">
    <div class="state-machine-meta">
      <div><strong>Initial:</strong> <code>{{ initial_state || states[0] }}</code></div>
      <div><strong>States:</strong> <code>{{ states.length }}</code></div>
      <div><strong>Transitions:</strong> <code>{{ transitions?.length || 0 }}</code></div>
    </div>
    <ul class="state-list">
      <li v-for="s in states" :key="s" class="state-chip">{{ s }}</li>
    </ul>
    <details class="state-machine-source" v-if="transitions && transitions.length">
      <summary>State diagram</summary>
      <pre><code>{{ diagramCode }}</code></pre>
    </details>
  </div>
</template>

<style scoped>
.state-machine {
  margin: 1.2rem 0;
}
.state-machine-meta {
  display: flex;
  gap: 1.2rem;
  flex-wrap: wrap;
  font-size: 0.9rem;
  margin-bottom: 0.8rem;
  color: var(--vp-c-text-2, #555);
}
.state-list {
  list-style: none;
  padding: 0;
  margin: 0 0 1rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.state-chip {
  display: inline-block;
  padding: 0.2rem 0.6rem;
  border-radius: 12px;
  background: var(--vp-c-bg-soft, #f6f6f7);
  border: 1px solid var(--vp-c-divider, #e2e2e3);
  font-family: var(--vp-font-family-mono, monospace);
  font-size: 0.85rem;
}
.state-machine-source summary {
  cursor: pointer;
  color: var(--vp-c-text-2, #555);
  user-select: none;
  font-size: 0.85rem;
}
.state-machine-source pre {
  margin-top: 0.5rem;
  padding: 0.8rem;
  background: var(--vp-c-bg-soft, #f6f6f7);
  border-radius: 6px;
  overflow-x: auto;
}
</style>
