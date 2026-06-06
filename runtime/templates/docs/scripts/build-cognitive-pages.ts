import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

const rootDir = process.cwd();
const docsDir = join(rootDir, 'docs');
const outputDir = join(docsDir, 'compiled');

// Ensure output directory exists
if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

function safeReadYaml(filePath: string): any {
  try {
    if (!existsSync(filePath)) return null;
    return yaml.load(readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.error(`Error reading YAML file at ${filePath}:`, e);
    return null;
  }
}

// 1. Build Profiles
function buildProfiles() {
  const profilesDir = join(docsDir, 'as-is', 'profiles');
  let content = '# Repository Profiles\n\nTechnical stack and profile information derived from code repositories.\n\n';
  
  if (existsSync(profilesDir)) {
    const files = readdirSync(profilesDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
    if (files.length === 0) {
      content += '*No repository profiles discovered yet.*\n';
    } else {
      for (const file of files) {
        const data = safeReadYaml(join(profilesDir, file));
        if (!data) continue;
        
        content += `<div class="artifact-card">\n\n`;
        content += `## Repo: ${data.repo || file.replace('.yaml', '')}\n\n`;
        content += `- **Revision**: \`${data.revision || 'unknown'}\`\n`;
        if (data.stack) {
          content += `- **Language**: \`${data.stack.language || 'unknown'}\`\n`;
          content += `- **Frameworks**: \`${(data.stack.frameworks || []).join(', ') || 'none'}\`\n`;
        }
        if (data.codegraph) {
          content += `- **Files Total**: \`${data.codegraph.files_total || 'unknown'}\`\n`;
        }
        if (data.test_commands) {
          content += `- **Test Commands**: \`${data.test_commands.join(', ') || 'none'}\`\n`;
        }
        content += `\n</div>\n\n`;
      }
    }
  } else {
    content += '*No repository profiles discovered yet.*\n';
  }
  
  writeFileSync(join(outputDir, 'profiles.md'), content);
}

// 2. Build Entries
function buildEntries() {
  const entriesDir = join(docsDir, 'as-is', 'entries');
  let content = '# Repository Entry Surfaces\n\nDiscovered system boundary entries (APIs, Message queues, Crons, etc.) awaiting developer validation.\n\n';
  
  if (existsSync(entriesDir)) {
    const files = readdirSync(entriesDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
    if (files.length === 0) {
      content += '*No entry files found.*\n';
    } else {
      for (const file of files) {
        const data = safeReadYaml(join(entriesDir, file));
        if (!data || !Array.isArray(data.entries)) continue;
        
        content += `## Repo: ${data.repo || file.replace('.yaml', '')}\n\n`;
        content += '| Entry ID | Type | Status | Summary | Anchor / Location |\n';
        content += '| --- | --- | --- | --- | --- |\n';
        
        for (const entry of data.entries) {
          const anchor = entry.anchor ? `[${entry.anchor.file}:${entry.anchor.line || ''}](file:///${entry.anchor.file})` : 'N/A';
          const badge = entry.status === 'confirmed' ? '<span class="badge-fact">confirmed</span>' : '<span class="badge-unknown">candidate</span>';
          content += `| \`${entry.id}\` | \`${entry.type || 'N/A'}\` | ${badge} | ${entry.summary || 'No summary'} | ${anchor} |\n`;
        }
        content += '\n';
      }
    }
  } else {
    content += '*No entry files found.*\n';
  }
  
  writeFileSync(join(outputDir, 'entries.md'), content);
}

// 3. Build Behaviors
function buildBehaviors() {
  const behaviorsDir = join(docsDir, 'as-is', 'behavior');
  let content = '# Behavior Flows\n\nStructured behavioral mapping detailing data writes, events triggered, and downstream RPCs.\n\n';
  
  if (existsSync(behaviorsDir)) {
    const files = readdirSync(behaviorsDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml') && !f.startsWith('_'));
    if (files.length === 0) {
      content += '*No behavior flows mapped yet.*\n';
    } else {
      for (const file of files) {
        const data = safeReadYaml(join(behaviorsDir, file));
        if (!data) continue;
        
        const badgeClass = data.confidence?.kind === 'fact' ? 'badge-fact' : (data.confidence?.kind === 'inference' ? 'badge-inference' : 'badge-unknown');
        const badgeText = data.confidence?.kind || 'unknown';
        
        content += `<div class="artifact-card">\n\n`;
        content += `## Behavior: ${data.id || file.replace('.yaml', '')} <span class="${badgeClass}">${badgeText}</span>\n\n`;
        content += `- **Repo**: \`${data.repo || 'unknown'}\`\n`;
        
        if (data.entry) {
          content += `- **Entry**: \`${data.entry.method || ''} ${data.entry.path || ''}\` (Type: \`${data.entry.type || 'N/A'}\`)\n`;
        }
        
        content += '\n### Topological Flow\n\n';
        content += '```mermaid\ngraph LR\n';
        
        const entryLabel = data.entry ? `"${data.entry.method || 'Trigger'} ${data.entry.path || ''}"` : '"Trigger"';
        content += `  entry[${entryLabel}] --> node["${data.id}"]\n`;
        
        if (Array.isArray(data.writes)) {
          for (const [i, w] of data.writes.entries()) {
            content += `  node --> write_${i}[("Write: ${w.table} (${w.operation})")]\n`;
          }
        }
        if (Array.isArray(data.events)) {
          for (const [i, ev] of data.events.entries()) {
            content += `  node --> event_${i}["Event: ${ev}"]\n`;
          }
        }
        if (Array.isArray(data.calls)) {
          for (const [i, call] of data.calls.entries()) {
            content += `  node --> call_${i}["Call: ${call}"]\n`;
          }
        }
        content += '```\n\n';
        
        if (Array.isArray(data.risks) && data.risks.length > 0) {
          content += '### Identified Risks\n\n';
          for (const r of data.risks) {
            content += `- ⚠️ **${r}**\n`;
          }
          content += '\n';
        }
        
        if (Array.isArray(data.sources) && data.sources.length > 0) {
          content += '### Source Evidence\n\n';
          for (const src of data.sources) {
            const handle = src.symbol_handle ? ` (Symbol: \`${src.symbol_handle}\`)` : '';
            const line = src.line ? `:${src.line}` : '';
            content += `- File: [\`${src.file}${line}\`](file:///${src.file})${handle}\n`;
          }
          content += '\n';
        }
        
        content += `</div>\n\n`;
      }
    }
  } else {
    content += '*No behavior flows mapped yet.*\n';
  }
  
  writeFileSync(join(outputDir, 'behaviors.md'), content);
}

// 4. Build State Machines
function buildStateMachines() {
  const statesDir = join(docsDir, 'as-is', 'state-machines');
  let content = '# State Machines\n\nSystem entity state transition models compiled from behavior writes.\n\n';
  
  if (existsSync(statesDir)) {
    const files = readdirSync(statesDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
    if (files.length === 0) {
      content += '*No state machines defined yet.*\n';
    } else {
      for (const file of files) {
        const data = safeReadYaml(join(statesDir, file));
        if (!data) continue;
        
        const badgeClass = data.confidence?.kind === 'fact' ? 'badge-fact' : (data.confidence?.kind === 'inference' ? 'badge-inference' : 'badge-unknown');
        const badgeText = data.confidence?.kind || 'unknown';
        
        content += `<div class="artifact-card">\n\n`;
        content += `## Entity: ${data.entity} <span class="${badgeClass}">${badgeText}</span>\n\n`;
        
        content += '### Transition Diagram\n\n';
        content += '```mermaid\nstateDiagram-v2\n';
        
        if (Array.isArray(data.transitions)) {
          for (const t of data.transitions) {
            const from = t.from || '[*]';
            const to = t.to;
            const trigger = t.trigger ? `: ${t.trigger}` : '';
            content += `  ${from} --> ${to}${trigger}\n`;
          }
        }
        
        content += '```\n\n';
        
        if (Array.isArray(data.states) && data.states.length > 0) {
          content += '### Available States\n\n';
          for (const s of data.states) {
            content += `- **${s}**\n`;
          }
          content += '\n';
        }
        
        content += `</div>\n\n`;
      }
    }
  } else {
    content += '*No state machines defined yet.*\n';
  }
  
  writeFileSync(join(outputDir, 'state-machines.md'), content);
}

// 5. Build Features
function buildFeatures() {
  const featuresDir = join(rootDir, 'features');
  let content = '# Active Features & Backlog\n\nIsolated requirement workspaces currently active or archived in this workspace.\n\n';
  
  if (existsSync(featuresDir)) {
    const dirs = readdirSync(featuresDir);
    let count = 0;
    
    for (const dir of dirs) {
      const featYamlPath = join(featuresDir, dir, 'feature.yaml');
      if (!existsSync(featYamlPath)) continue;
      
      const data = safeReadYaml(featYamlPath);
      if (!data) continue;
      
      count++;
      content += `<div class="artifact-card">\n\n`;
      content += `## Feature: ${data.name || dir}\n\n`;
      content += `- **Objective**: ${data.objective || 'No objective defined.'}\n`;
      content += `- **Repos Involved**: \`${(data.repos || []).join(', ') || 'none'}\`\n`;
      
      const progressFile = join(featuresDir, dir, 'reports', 'feature-progress.md');
      if (existsSync(progressFile)) {
        try {
          const progressText = readFileSync(progressFile, 'utf8');
          const m = progressText.match(/## Stage: (\S+)/);
          if (m) {
            content += `- **Current Stage**: \`${m[1]}\`\n`;
          }
        } catch {}
      }
      content += `\n</div>\n\n`;
    }
    
    if (count === 0) {
      content += '*No features created yet.*\n';
    }
  } else {
    content += '*No features created yet.*\n';
  }
  
  writeFileSync(join(outputDir, 'features.md'), content);
}

console.log('Compiling cognitive assets to Markdown...');
buildProfiles();
buildEntries();
buildBehaviors();
buildStateMachines();
buildFeatures();
console.log('Compilation completed successfully.');
