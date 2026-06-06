<script setup lang="ts">
import { computed } from 'vue'

interface SourceRef {
  file: string
  line?: number
  symbol_handle?: string
  repo?: string
}

const props = defineProps<{
  source: SourceRef
  /** Workspace root for resolving absolute file paths (defaults to current dir). */
  workspaceRoot?: string
  /** Optional git remote URL (e.g., https://github.com/org/repo) for remote links. */
  gitRemoteUrl?: string
  /** Optional git ref (branch / SHA). Defaults to 'main'. */
  gitRef?: string
}>()

const file = computed(() => props.source.file || 'unknown')
const line = computed(() => (typeof props.source.line === 'number' ? props.source.line : null))
const symbol = computed(() => props.source.symbol_handle || null)
const repo = computed(() => props.source.repo || null)

const displayPath = computed(() => {
  const base = file.value
  return line.value ? `${base}:${line.value}` : base
})

const vscodeUri = computed(() => {
  // vscode://file/<absolute path>:<line> — workspace-relative path is acceptable in current working dir
  if (typeof window === 'undefined' || !props.workspaceRoot) return null
  const abs = `${props.workspaceRoot.replace(/\/$/, '')}/${file.value}`.replace(/^\//, '/')
  const lineFrag = line.value ? `:${line.value}` : ''
  return `vscode://file${abs.startsWith('/') ? abs : '/' + abs}${lineFrag}`
})

const remoteUrl = computed(() => {
  if (!props.gitRemoteUrl) return null
  const ref = props.gitRef || 'main'
  const path = file.value.replace(/^\/+/, '')
  const lineFrag = line.value ? `#L${line.value}` : ''
  return `${props.gitRemoteUrl.replace(/\.git$/, '')}/blob/${ref}/${path}${lineFrag}`
})
</script>

<template>
  <span class="code-link" :title="file + (line ? ':' + line : '')">
    <a v-if="vscodeUri" :href="vscodeUri" class="code-link-vscode" target="_blank" rel="noopener">📄 {{ displayPath }}</a>
    <span v-else class="code-link-path">📄 {{ displayPath }}</span>
    <span v-if="symbol" class="code-link-symbol" :title="symbol">— <code>{{ symbol }}</code></span>
    <a v-if="remoteUrl" :href="remoteUrl" class="code-link-remote" target="_blank" rel="noopener">↗ GitHub</a>
    <span v-if="repo" class="code-link-repo">({{ repo }})</span>
  </span>
</template>

<style scoped>
.code-link {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-family: var(--vp-font-family-mono, monospace);
  font-size: 0.85em;
  flex-wrap: wrap;
}
.code-link-vscode,
.code-link-remote {
  text-decoration: none;
  color: var(--vp-c-brand-1, #3451b2);
}
.code-link-vscode:hover,
.code-link-remote:hover {
  text-decoration: underline;
}
.code-link-remote {
  font-size: 0.8em;
  color: var(--vp-c-text-2, #555);
}
.code-link-symbol code {
  font-size: 0.85em;
  background: var(--vp-c-bg-soft, #f6f6f7);
  padding: 0 0.3em;
  border-radius: 3px;
}
.code-link-repo {
  font-size: 0.8em;
  color: var(--vp-c-text-2, #777);
}
</style>
