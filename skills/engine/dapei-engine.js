#!/usr/bin/env node
import{resolve as ll}from"node:path";import{appendFileSync as Ia,existsSync as cr,mkdirSync as Pa,readFileSync as La,renameSync as Ta,statSync as Fa}from"node:fs";import{createHash as Ba}from"node:crypto";import{join as ar,isAbsolute as Na}from"node:path";import{existsSync as Re,readdirSync as Jr}from"node:fs";import{basename as Ss,dirname as Qn,join as K}from"node:path";import{fileURLToPath as As}from"node:url";var A=class extends Error{code;constructor(e,n){super(n),this.code=e}};import{execFileSync as ls}from"node:child_process";import{closeSync as ps,existsSync as gt,mkdirSync as ds,openSync as us,readFileSync as fs,renameSync as gs,writeFileSync as Gr,readdirSync as Ur,statSync as ms,cpSync as hs}from"node:fs";import{basename as ys,dirname as Kn,isAbsolute as Zn,join as Wt,relative as bs,resolve as ft}from"node:path";import{randomBytes as vs}from"node:crypto";function Le(t,e,n){return ls(t,e,{cwd:n,encoding:"utf8"}).trim()}function ne(t,e,n){try{return Le(t,e,n)}catch{return""}}function J(t){ds(t,{recursive:!0})}function L(t){return fs(t,"utf8")}function R(t,e){J(Kn(t)),Gr(t,e,"utf8")}function at(t,e){J(Kn(t));let n=`${t}.tmp.${vs(8).toString("hex")}`,r=us(n,"w");try{Gr(r,e,"utf8")}finally{ps(r)}gs(n,t)}function Hr(t,e){!gt(t)||gt(e)||(J(Kn(e)),hs(t,e))}function Wr(t){return gt(t)?Ur(t).filter(n=>![".DS_Store",".gitkeep"].includes(n)).length===0:!0}function Jn(t){if(gt(Wt(t,".dapei")))return!0;let e=0;return gt(Wt(t,"repos"))&&e++,gt(Wt(t,"docs"))&&e++,gt(Wt(t,"features"))&&e++,e>=2}function Ae(t,e,n=50){let r=[],i=[".git","node_modules","dist","build","vendor","__pycache__","target",".next"];function a(s){if(!(r.length>=n))for(let c of Ur(s)){if(i.includes(c))continue;let p=Wt(s,c);if(ms(p).isDirectory()?a(p):e.some(u=>p.endsWith(u))&&r.push(p),r.length>=n)return}}return gt(t)&&a(t),r}function V(t){let e=ft(t);return{rootDir:e,workspaceName:ys(e),dapeiDir:ft(e,".dapei"),reposDir:ft(e,"repos"),featuresDir:ft(e,"features"),docsDir:ft(e,"docs"),runtimeDir:ft(e,"runtime")}}function wt(t,e){if(!Zn(t))throw new Error(`safeJoinWithin: root must be absolute, got ${t}`);if(Zn(e))throw new Error(`safeJoinWithin: rel must be relative, got ${e}`);let n=ft(t),r=ft(n,e),i=bs(n,r);if(i.startsWith("..")||Zn(i))throw new Error(`safeJoinWithin: path traversal blocked: ${e} escapes ${t}`);return r}import{existsSync as Ee}from"node:fs";import{join as xe}from"node:path";function X(t,e){for(let n of e)if(t[n]===void 0||t[n]===null||t[n]==="")throw new A("INVALID_INPUT",`missing field: ${n}`)}function We(t){let e=[];for(let n of t.split(`
`)){let r=n.match(/^\s*- name:\s*"?([^"\s]+)"?/);r&&e.push(r[1])}return e}function Ze(t){let e=[];for(let n of t.split(`
`)){let r=n.match(/^\s*- name:\s*"([^"]+)"/);r&&e.push(r[1])}return e}function Zt(t){let e=[];for(let n of t.split(`
`)){let r=n.match(/^\s*- id:\s*([a-zA-Z0-9-]+)\s*$/);r&&e.push(r[1])}return e}var _s=["solution-design","implementation","acceptance"];function ws(t){let e=[],n=!1;for(let r of t.split(`
`)){let i=r.replace(/\r$/,"");if(!n){let s=i.match(/^gates:\s*\[(.*)\]\s*(?:#.*)?$/);if(s){for(let c of s[1].split(",")){let p=c.trim().replace(/["']/g,"");p&&e.push(p)}continue}/^gates:\s*(?:#.*)?$/.test(i)&&(n=!0);continue}let a=i.match(/^\s+-\s+([^\s#]+)/);if(a){e.push(a[1].replace(/["']/g,""));continue}i.trim()===""||i.trimStart().startsWith("#")||(n=!1)}return e.length>0?e:[..._s]}function kn(t,e,n){if(ws(t).includes(e)&&!n)throw new A("CONFIRMATION_REQUIRED",`stage '${e}' is a confirmation gate and requires confirmation. Re-run with --yes to confirm.`)}function Sn(t,e,n){for(let r of ks(t,n))if(!Ee(xe(e,"reports",`stage-${r}.completed`)))throw new A("STAGE_PREREQ_MISSING",`required stage '${r}' not completed before '${n}'`)}function ks(t,e){let n=t.split(`
`),r=!1;for(let i of n){if(i.match(new RegExp(`^\\s*- id:\\s*${e}\\s*$`))){r=!0;continue}if(r&&i.match(/^\s*- id:\s*[a-zA-Z0-9-]+\s*$/))break;if(r){let a=i.match(/^\s*requires:\s*\[(.*)\]\s*$/);if(a)return a[1].split(",").map(s=>s.replace(/["\s]/g,"")).filter(Boolean)}}return[]}function Zr(t,e){let n=t.split(`
`),r=!1,i=!1,a=[];for(let s of n){if(s.match(new RegExp(`^\\s*- id:\\s*${e}\\s*$`))){r=!0;continue}if(r&&s.match(/^\s*- id:\s*[a-zA-Z0-9-]+\s*$/))break;if(r){if(s.match(/^\s*outputs:\s*$/)){i=!0;continue}if(i){let c=s.match(/^\s*-\s+(.+)\s*$/);if(c)a.push(c[1].trim().replace(/\s*\(.*\)\s*$/,""));else if(s.match(/^\s*[a-zA-Z_-]+:\s*$/))break}}}return a}function Pt(t){let e=[];return Ee(xe(t,"package.json"))&&e.push("nodejs"),Ee(xe(t,"pom.xml"))&&e.push("java-maven"),(Ee(xe(t,"build.gradle"))||Ee(xe(t,"build.gradle.kts")))&&e.push("java-gradle"),(Ee(xe(t,"pyproject.toml"))||Ee(xe(t,"requirements.txt")))&&e.push("python"),Ee(xe(t,"go.mod"))&&e.push("go"),Ee(xe(t,"Cargo.toml"))&&e.push("rust"),e.join(" ")||"unknown"}function kt(t){let e=[];return Ee(xe(t,"package.json"))&&(L(xe(t,"package.json")).includes('"test"')&&e.push("npm test"),Ee(xe(t,"pnpm-lock.yaml"))&&e.push("pnpm test"),Ee(xe(t,"yarn.lock"))&&e.push("yarn test")),(Ee(xe(t,"pyproject.toml"))||Ee(xe(t,"requirements.txt")))&&e.push("pytest"),Ee(xe(t,"go.mod"))&&e.push("go test ./..."),Ee(xe(t,"Cargo.toml"))&&e.push("cargo test"),Ee(xe(t,"pom.xml"))&&e.push("mvn test"),(Ee(xe(t,"build.gradle"))||Ee(xe(t,"build.gradle.kts")))&&e.push("./gradlew test"),[...new Set(e)]}function Ke(t){let e=ne("git",["-C",t,"symbolic-ref","--quiet","--short","refs/remotes/origin/HEAD"],t).replace(/^origin\//,"");return e||(ne("git",["-C",t,"show-ref","--verify","--quiet","refs/heads/main"],t)===""?"main":ne("git",["-C",t,"show-ref","--verify","--quiet","refs/heads/master"],t)===""?"master":ne("git",["-C",t,"rev-parse","--abbrev-ref","HEAD"],t)||"main")}var Kr={"01-current-state.md.template":`# 01. Current State

Date: {{date}}

## Objective
{{objective}}

## Touched Repositories
{{repos}}

## Current Module Structure
<!-- List key modules and their responsibilities -->

## Dependencies
<!-- List external dependencies (databases, services, libraries) -->

## Existing Tests
<!-- List existing test suites and coverage -->

## Unknowns
<!-- List things that need investigation -->
- [ ] Unknown item 1
- [ ] Unknown item 2

## Evidence
<!-- Facts gathered from code analysis -->`,"02-gap-analysis.md.template":`# 02. Gap Analysis

Date: {{date}}

## Related Documents
- Previous: [01. Current State](./01-current-state.md)

## Business Gaps
<!-- What business capabilities are missing or inadequate? -->
- [ ] Gap 1
- [ ] Gap 2

## Technical Gaps
<!-- What technical deficiencies exist? -->
- [ ] Gap 1
- [ ] Gap 2

## Test Gaps
<!-- What test coverage is missing? -->
- [ ] Gap 1

## Risks
<!-- What could go wrong? -->
- Risk 1
- Risk 2

## Open Questions
<!-- What needs clarification before proceeding? -->
- [ ] Question 1
- [ ] Question 2`,"03-business-design.md.template":`# 03. Business Design

Date: {{date}}

## Related Documents
- Previous: [02. Gap Analysis](./02-gap-analysis.md)

## Problem Statement
<!-- What business problem are we solving? -->

## Success Criteria
<!-- How do we know we've succeeded? -->
- [ ] Criterion 1
- [ ] Criterion 2

## User Stories / Use Cases
<!-- Who benefits and how? -->
- US-1: As a ... I want ... so that ...
- US-2: ...

## Business Rules
<!-- What constraints must be followed? -->
1. Rule 1
2. Rule 2

## Metrics
<!-- How do we measure success? -->
- Metric 1: target value
- Metric 2: target value`,"04-technical-design.md.template":`# 04. Technical Design

Date: {{date}}

## Related Documents
- Previous: [03. Business Design](./03-business-design.md)

## Architecture Overview
<!-- High-level architecture diagram or description -->

## Component Design

### Component 1
- Responsibility:
- Public API:
- Dependencies:

### Component 2
- Responsibility:
- Public API:
- Dependencies:

## Data Model
<!-- Database schema, entity relationships -->

## API Design
<!-- If applicable, REST/GraphQL/etc -->

## Error Handling
<!-- How errors are caught and communicated -->

## Migration Strategy
<!-- If modifying existing systems -->`,"05-task-breakdown.md.template":`# 05. Task Breakdown

Date: {{date}}

## Related Documents
- Previous: [04. Technical Design](./04-technical-design.md)

## Task Backlog

### Phase 1: Foundation
- [ ] Task 1.1: Description (estimated: Xh)
- [ ] Task 1.2: Description (estimated: Xh)

### Phase 2: Core Implementation
- [ ] Task 2.1: Description (estimated: Xh)
- [ ] Task 2.2: Description (estimated: Xh)

### Phase 3: Validation
- [ ] Task 3.1: Description (estimated: Xh)

## Timeline
<!-- Visual timeline or milestone schedule -->

## Dependencies
- External dependency 1
- External dependency 2

## Effort Estimate
| Task | Estimate | Assignee |
|------|----------|----------|
| Total | X days | |`,"06-acceptance.md.template":`# 06. Acceptance Criteria

Date: {{date}}

## Related Documents
- Previous: [05. Task Breakdown](./05-task-breakdown.md)

## Acceptance Checklist

### Functional Requirements
- [ ] AC-1: Description with verification method
- [ ] AC-2: Description with verification method

### Non-Functional Requirements
- [ ] AC-3: Performance criteria
- [ ] AC-4: Security criteria

### Test Requirements
- [ ] AC-5: Unit test coverage
- [ ] AC-6: Integration test coverage

## Sign-off
| Role | Name | Date | Signature |
|------|------|------|-----------|
| PM | | | |
| Tech Lead | | | |
| QA | | | |`,"agents.feature.md.template":`# Feature Agents

## Runtime Context

- Feature: <feature-name>
- Objective: <feature-objective>
- Repos: <repo-list>

## Roles

1. PM Agent
- Owns scope and acceptance checklists.

2. Architect Agent
- Owns boundary and design review.

3. Implementer Agent
- Owns code changes and local validation.

4. QA Agent
- Owns test report and regression risk.

## Handoff Contract

- Input contract: consume \`context/*\` and \`tasks/plan.md\`
- Output contract: write to \`reports/*\` and \`memory/*\`
- Never edit outside \`features/<feature>\` except mapped repository targets under \`features/<feature>/repos\`
`,"dapei/cognitive/index.yaml":`version: "1.0"
updated_at: "1970-01-01T00:00:00.000Z"
behaviors: []
state_machines: []
unknowns: []
`,"dapei/commands.yaml":`version: 0.1
commands:
  - name: init-workspace
    cli: "@dapei init workspace"
    capability: workspace.init
    purpose: bootstrap context os structure for one engineering workspace
    inputs: []
    workflow:
      - validate-root-structure
      - init-dapei-metadata
      - init-docs-and-runtime
      - emit-workspace-report
    outputs:
      - .dapei/workspace.yaml
      - docs/workflows

  - name: create-feature
    cli: "@dapei create feature <name> --repos <repo1,repo2>"
    capability: feature.create
    purpose: create an isolated feature workspace with mapped repos and baseline context
    inputs:
      - feature_name
      - repos
      - objective
    workflow:
      - validate-feature-name
      - create-feature-dirs
      - ensure-repos-available-or-interactive-clone
      - map-repo-worktrees
      - init-feature-manifest
      - init-context-memory-task-report
      - create-feature-agent-context
    outputs:
      - features/<feature>/feature.yaml
      - features/<feature>/agents.md
      - features/<feature>/context/runtime-context.md

  - name: build-context
    cli: "@dapei context build <feature> --stage <stage>"
    capability: context.build
    purpose: build an auditable layered runtime context bundle for one feature stage
    inputs:
      - feature_name
      - stage
    workflow:
      - load-workspace-context-policy
      - collect-docs-knowledge
      - collect-repo-evidence
      - collect-feature-context
      - emit-context-bundle
    outputs:
      - features/<feature>/context/runtime-context.md

  - name: analyze-repos
    cli: "@dapei repos analyze <name|--all>"
    capability: repos.analyze
    purpose: reverse-engineer imported repositories into durable workspace docs
    inputs:
      - repo_name
    workflow:
      - scan-repo-metadata
      - detect-stack-and-tests
      - collect-structural-evidence
      - update-as-is-docs
    outputs:
      - docs/as-is/repo-inventory.md
      - docs/architecture/technical-current-state.md

  - name: run-workflow
    cli: "@dapei run workflow <feature> --stage <stage>"
    # Not \`workflow.run\`: the registered id is workflow.runStage.
    capability: workflow.runStage
    purpose: execute one stage in feature lifecycle dag
    inputs:
      - feature_name
      - stage
    workflow:
      - load-layered-context
      - run-stage-checklist
      - persist-memory
      - update-progress-report
    outputs:
      - features/<feature>/reports/feature-progress.md

  - name: report-feature
    cli: "@dapei report feature <name>"
    capability: feature.report
    purpose: generate structured status, risk, and architecture drift report
    inputs:
      - feature_name
    workflow:
      - collect-changes
      - collect-memory
      - run-guardrails
      - emit-report-pack
    outputs:
      - features/<feature>/reports/daily-report.md
      - features/<feature>/reports/architecture-review.md

  - name: validate-feature
    cli: "@dapei validate feature <name>"
    # Not \`validation.validate\`: the registered id is validation.run.
    capability: validation.run
    purpose: run repeatable local validation and emit test and validation reports
    inputs:
      - feature_name
    workflow:
      - detect-repo-test-commands
      - execute-local-checks
      - run-guardrails
      - emit-validation-report
    outputs:
      - features/<feature>/reports/test-report.md
      - features/<feature>/reports/validation-report.md

  - name: close-feature
    cli: "@dapei close feature <name>"
    capability: feature.close
    purpose: verify feature status, backfill decision logs, and document feature impact in docs/
    inputs:
      - feature_name
    workflow:
      - check-reports
      - archive-decisions
      - create-feature-impact-doc
      - update-feature-manifest-status
    outputs:
      - docs/decisions/<feature>-decisions.md
      - docs/feature-impact/<feature>.md

  - name: workspace-validate
    cli: "@dapei workspace validate"
    capability: workspace.validate
    purpose: check if workspace conforms to dapei structure specification
    inputs: []
    workflow:
      - check-dapei-dir
      - check-repos-dir
      - check-features-dir
    outputs: []

  - name: workspace-status
    cli: "@dapei workspace status"
    capability: workspace.status
    purpose: show workspace overview - repo count, feature count, conformance
    inputs: []
    workflow:
      - count-repos
      - count-features
      - check-conformance
    outputs: []

  - name: workflow-status
    cli: "@dapei workflow status <feature>"
    capability: workflow.status
    purpose: get current stage and completed stages for a feature
    inputs:
      - feature_name
    workflow:
      - read-progress
      - list-completed-stages
    outputs:
      - features/<feature>/reports/feature-progress.md

  - name: feature-status
    cli: "@dapei feature status"
    capability: feature.status
    purpose: list all features and their current stages
    inputs: []
    workflow:
      - scan-features
      - emit-status
    outputs: []

  - name: feature-stage
    cli: "@dapei feature stage <feature> <action> [--stage <stage>]"
    capability: feature.stage
    purpose: get or set the current stage of a feature
    inputs:
      - feature_name
      - action
      - stage
    workflow:
      - get-stage
      - set-stage
    outputs:
      - features/<feature>/reports/feature-progress.md

  - name: feature-tasks
    cli: "@dapei feature tasks <feature> <action> [--content <content>]"
    capability: feature.tasks
    purpose: list or append to feature backlog tasks
    inputs:
      - feature_name
      - action
      - content
    workflow:
      - read-backlog
      - append-task
    outputs:
      - features/<feature>/tasks/backlog.md

  - name: validation-detect
    cli: "@dapei validation detect <repo>"
    capability: validation.detect
    purpose: detect available test and validation commands for a repo
    inputs:
      - repo_name
    workflow:
      - read-manifest
      - detect-commands
    outputs: []

  - name: validation-execute
    cli: "@dapei validation execute <repo> <command>"
    capability: validation.execute
    purpose: execute a validation command and return output
    inputs:
      - repo_name
      - command
    workflow:
      - run-command
      - capture-output
    outputs: []

  - name: memory-append
    cli: "@dapei memory append <feature> <type> <content>"
    capability: memory.append
    purpose: record a decision, risk, question, or note to feature memory
    inputs:
      - feature_name
      - type
      - content
    workflow:
      - append-memory-entry
    outputs:
      - features/<feature>/memory/<type>.md

  - name: repos-remove
    cli: "@dapei repos remove <name> [--force]"
    capability: repos.remove
    purpose: remove a repo from the registry and delete its directory
    inputs:
      - repo_name
      - force
    workflow:
      - check-worktree-usage
      - remove-from-registry
      - delete-repo
    outputs: []

  - name: workspace-report
    cli: "@dapei workspace report"
    capability: workspace.report
    purpose: generate a workspace-level health report aggregating repos and features
    inputs: []
    workflow:
      - collect-repos-status
      - collect-features-progress
      - emit-workspace-report
    outputs: []

  - name: audit-query
    cli: "@dapei audit query [--since <date>] [--until <date>] [--capability <cap>] [--feature <feat>]"
    capability: audit.query
    purpose: query the capability audit log with filters
    inputs:
      - since
      - until
      - capability
      - feature
    workflow:
      - parse-audit-log
      - filter-entries
    outputs: []

  - name: cdr-profile
    cli: "@dapei profile repo <name>"
    capability: cdr.profile
    purpose: generate a tech profile YAML for one repo (language, framework, manifest files, directory tree, test commands)
    inputs:
      - repo_name
    workflow:
      - resolve-repo-path
      - detect-language-and-framework
      - scan-manifest-files
      - emit-profile-yaml
    outputs:
      - docs/as-is/profiles/<repo>.yaml

  - name: cdr-entries-prepare
    cli: "@dapei discover entries for <repo>"
    capability: cdr.entries.prepare
    purpose: scan a repo for entry-point candidate files (controller, route, resource, handler, listener, consumer, scheduler, job)
    inputs:
      - repo_name
    workflow:
      - resolve-repo-path
      - scan-for-entry-patterns
      - emit-entries-candidates-yaml
    outputs:
      - docs/as-is/entries/<repo>.yaml

  - name: cdr-entries-confirm
    cli: "@dapei confirm entry <entry_id> in <repo>"
    capability: cdr.entries.confirm
    purpose: mark one entry candidate as confirmed and attach a human-written summary for downstream behavior mining
    inputs:
      - repo_name
      - entry_id
      - summary
    workflow:
      - load-entries-yaml
      - mark-entry-confirmed
      - write-summary
    outputs:
      - docs/as-is/entries/<repo>.yaml

  - name: cdr-state-derive
    cli: "@dapei discover states for <entity> in <repo>"
    # The registered id is cdr.state.derive (inference-level state-machine
    # draft). The bare \`discover states\` wording above belongs to
    # cognitive.state.suggest, so this entry carries an explicit routing
    # sample naming the state-machine vocabulary it actually runs.
    capability: cdr.state.derive
    intent: "@dapei derive state machine for Order in mall-order"
    purpose: derive a state-machine draft from a specified list of confirmed behaviors' writes and events (inference-level, Agent must confirm)
    inputs:
      - entity
      - behaviors
      - repo
    workflow:
      - load-behaviors-for-entity
      - extract-states-from-writes-and-events
      - build-transitions
      - emit-draft-state-machine
    outputs:
      - docs/as-is/state-machines/<entity>.yaml

  - name: cdr-behavior-upsert
    cli: "@dapei upsert behavior <id> (via cognitive.artifact.upsert)"
    # The registered id is cdr.behavior.upsert (schema-validated behavior
    # write with the mandatory evidence block), not the generic
    # cognitive.artifact.upsert named in the CLI line, so this entry carries
    # an explicit routing sample instead of relying on that wording.
    capability: cdr.behavior.upsert
    intent: "@dapei upsert behavior order-create for mall-order"
    purpose: validate a behavior YAML and insert it into the cognitive index (used by Agent after tracing an entry; evidence-block required)
    inputs:
      - id
      - repo
      - entry
      - writes
      - events
      - calls
      - risks
      - confidence
      - sources
    workflow:
      - validate-evidence-block
      - validate-behavior-schema
      - write-behavior-yaml
      - update-cognitive-index
    outputs:
      - docs/as-is/behavior/<id>.yaml
      - .dapei/cognitive/index.yaml

  - name: cdr-domain-compose
    cli: "@dapei compose domain <name> from <behaviors>"
    capability: cdr.domain.compose
    purpose: cluster behaviors into a domain YAML with required derived_from reference (P1 rule enforcement)
    inputs:
      - domain
      - description
      - behaviors
    workflow:
      - verify-behaviors-in-index
      - compose-domain-yaml
      - validate-derived-from
      - write-domain-yaml
    outputs:
      - docs/as-is/domains/<domain>.yaml

  - name: cdr-capability-map-init
    cli: "@dapei init capability map for <product>"
    capability: cdr.capability.map.init
    purpose: initialize the L1 product capability map referencing existing domain artifacts
    inputs:
      - product
      - capabilities
    workflow:
      - validate-capability-ids
      - emit-capability-map-yaml
    outputs:
      - docs/as-is/capabilities/product-map.yaml

  - name: cdr-index-list
    cli: "@dapei list assets [--repo <repo>] [--kind <fact|inference|unknown>]"
    capability: cdr.index.list
    purpose: list all cognitive assets (behaviors, state machines, domains, capability maps, unknowns) with optional filters
    inputs:
      - repo
      - kind
    workflow:
      - load-cognitive-index
      - filter-by-inputs
      - render-summary
    outputs: []

  - name: cdr-doc-generate
    cli: "@dapei generate documentation portal [--output-dir <dir>]"
    capability: cdr.doc.generate
    purpose: compile docs/as-is/* cognitive assets into a VitePress-ready static site with Mermaid diagrams and confidence badges
    inputs:
      - output_dir
    workflow:
      - ensure-output-dirs
      - load-all-cognitive-assets
      - render-l1-capability-pages
      - render-l2-domain-pages
      - render-l3-behavior-and-state-pages
      - render-profile-pages
      - render-business-rules-pages
      - emit-vitepress-config
    outputs:
      - .dapei/docs-portal/

  - name: cdr-business-compose
    cli: "@dapei compose business <id>"
    capability: cdr.business.compose
    purpose: validate a business-rule YAML (invariant | constraint | authorization | sla | compensation) and write docs/as-is/business-rules/<id>.yaml with evidence-block + cognitive index update
    inputs:
      - id
      - kind
      - description
      - expr
      - applies_to
      - repo
      - confidence
      - sources
    workflow:
      - validate-evidence-block
      - validate-business-rule-schema
      - write-business-rule-yaml
      - update-cognitive-index
    outputs:
      - docs/as-is/business-rules/<id>.yaml
      - .dapei/cognitive/index.yaml

`,"dapei/feature.schema.yaml":`$schema: "https://json-schema.org/draft/2020-12/schema"
title: dapei feature manifest v2
type: object
required:
  - version
  - feature
properties:
  version:
    type: string
    enum: ["0.2"]
  feature:
    type: object
    required:
      - name
      - objective
      - owner
      - repos
      - acceptance
    properties:
      name:
        type: string
        pattern: "^[a-z0-9-]+$"
      objective:
        type: string
        minLength: 10
      owner:
        type: string
      isolation:
        type: string
        enum: [symlink, worktree]
      repos:
        type: array
        minItems: 1
        items:
          type: object
          required:
            - name
            - branch
            - base-ref
          properties:
            name:
              type: string
            branch:
              type: string
            base-ref:
              type: string
              description: "master commit hash at feature creation"
            base-time:
              type: string
              format: date-time
            path:
              type: string
      scope:
        type: object
        properties:
          in:
            type: array
            items: { type: string }
          out:
            type: array
            items: { type: string }
      acceptance:
        type: array
        minItems: 1
        items:
          type: string
      risk_level:
        type: string
        enum: [low, medium, high]
      dependencies:
        type: array
        items: { type: string }
      last-review-at:
        oneOf:
          - type: string
            format: date-time
          - type: "null"
additionalProperties: false
`,"dapei/repos.schema.yaml":`$schema: "https://json-schema.org/draft/2020-12/schema"
title: dapei repos registry
type: object
required:
  - version
  - repos
properties:
  version:
    type: string
    enum: ["0.1"]
  repos:
    type: array
    items:
      type: object
      required:
        - name
        - path
        - url
        - added-at
      properties:
        name:
          type: string
        path:
          type: string
        url:
          type: string
        added-at:
          type: string
          format: date-time
        default-branch:
          type: string`,"dapei/rules/api.yaml":`version: 0.1
rule_set: api
mode: report
rules:
  - id: API-001
    title: api change needs compatibility note
    severity: medium
    check:
      type: file-required
      files:
        - "features/<feature>/memory/tradeoff.md"
    message: include backward compatibility strategy in tradeoff notes
`,"dapei/rules/cognitive.yaml":`version: 0.1
rules:
  - id: COG-001
    title: Cognitive behavior facts before solution design
    severity: medium
    message: At least one validated behavior artifact with kind=fact should exist before solution-design
    check:
      type: cognitive-artifact-required
      min_facts: 1
`,"dapei/rules/ddd.yaml":`version: 0.1
rule_set: ddd
mode: report
rules:
  - id: DDD-001
    title: cross-domain dependency requires decision record
    severity: high
    check:
      type: evidence-required
      evidence_file: "features/<feature>/memory/decision-log.md"
      condition: "cross-domain-change=true"
    message: record rationale before introducing cross-domain coupling
`,"dapei/rules/layering.yaml":`version: 0.1
rule_set: layering
mode: report
rules:
  - id: LAYER-001
    title: no direct edits in repos by agent
    severity: high
    check:
      type: path-deny
      patterns:
        - "repos/**"
    message: agent must work in features/* only

  - id: LAYER-002
    title: feature must declare repo boundaries
    severity: medium
    check:
      type: file-required
      files:
        - "features/<feature>/feature.yaml"
        - "features/<feature>/context/constraints.md"
`,"dapei/rules/naming.yaml":`version: 0.1
rule_set: naming
mode: report
rules:
  - id: NAME-001
    title: feature folder naming convention
    severity: medium
    check:
      type: folder-name-regex
      regex: "^[a-z0-9-]+$"
    message: use kebab-case for feature names
`,"dapei/workflows/feature-lifecycle.yaml":`version: 0.1
name: feature-lifecycle
description: AI SDLC lifecycle for one isolated feature workspace

# Stages that cross a confirmation boundary: advancing into one of these
# requires an explicit \`confirmed: true\` (CLI \`--yes\`) and, when
# \`guardrail_mode\` is not \`report\`, a non-FAIL guardrail run.
# This list is the single source of truth for the gate stage ids \u2014 the engine
# reads it (see yamlGateStages in packages/core/src/capabilities/shared.ts)
# instead of hardcoding them.
gates:
  - solution-design
  - implementation
  - acceptance

stages:
  - id: analyze-current-state
    requires: []
    inputs:
      - feature manifest
      - layered context
    outputs:
      - docs/01-current-state.md
      - context/repo-context.md

  - id: gap-analysis
    requires: [analyze-current-state]
    inputs:
      - docs/01-current-state.md
      - context/constraints.md
    outputs:
      - docs/02-gap-analysis.md

  - id: solution-design
    requires: [gap-analysis]
    inputs:
      - docs/02-gap-analysis.md
      - context/architecture-context.md
    outputs:
      - docs/03-business-design.md
      - docs/04-technical-design.md

  - id: task-breakdown
    requires: [solution-design]
    inputs:
      - docs/04-technical-design.md
    outputs:
      - docs/05-task-breakdown.md
      - tasks/backlog.md

  - id: implementation
    requires: [task-breakdown]
    inputs:
      - docs/05-task-breakdown.md
      - repos/ (symlinks)
    outputs:
      - implementation-log.md (in reports/)
      - code changes

  - id: local-validation
    requires: [implementation]
    inputs:
      - code changes
      - docs/06-acceptance.md
    outputs:
      - reports/validation-report.md
      - reports/test-report.md

  - id: architecture-review
    requires: [local-validation]
    inputs:
      - reports/validation-report.md
      - .dapei/rules/
    outputs:
      - reports/architecture-review.md

  - id: acceptance
    requires: [architecture-review]
    inputs:
      - all reports
      - docs/06-acceptance.md
    outputs:
      - reports/acceptance-report.md
      - release-notes.md
`,"feature.yaml.template":`version: "0.2"
feature:
  name: "<feature-name>"
  objective: "<describe objective min 10 chars>"
  owner: "unassigned"
  isolation: "symlink"
  repos:
    - name: "<repo1>"
      branch: "feature/<feature-name>"
      base-ref: "<auto-filled>"
      base-time: "<auto-filled>"
      path: "repos/<repo1>"
  scope:
    in: []
    out: []
  acceptance:
    - "<define acceptance criteria>"
  risk_level: "medium"
  dependencies: []
  last-review-at: null
`};function $s(){let t=[],e=process.env.DAPEI_ENGINE_HOME;e&&t.push(e);let n=Qn(As(import.meta.url));for(let r=0;r<12;r++){t.push(n);let i=Qn(n);if(i===n)break;n=i}for(let r of t)if(Re(K(r,"runtime","templates","dapei","commands.yaml")))return r;return null}function Ds(t,e,n){if(Re(n))return;if(t){let i=K(t,"runtime","templates",e);if(Re(i)){Hr(i,n);return}throw new A("TEMPLATE_MISSING",`engine home ${t} has no runtime/templates/${e}`)}let r=Kr[e];if(r===void 0)throw new A("TEMPLATE_MISSING",`template ${e} is neither on disk (no engine home found) nor embedded in this build; run \`npm run gen:assets\``);J(Qn(n)),R(n,r)}var Qr={id:"workspace.init",version:"1.0.0",inputSchema:{},outputs:[".dapei/workspace.yaml",".dapei/commands.yaml",".dapei/feature.schema.yaml",".dapei/repos.schema.yaml",".dapei/workflows/",".dapei/rules/",".dapei/cognitive/index.yaml","runtime/templates/","runtime/ai-rules/","docs/"],async execute(t){let e=V(t.rootDir);if(J(e.rootDir),!Wr(e.rootDir)&&!Jn(e.rootDir))throw new A("WORKSPACE_INVALID",`current directory is not empty and does not look like a dapei workspace: ${e.rootDir}`);Re(K(e.rootDir,".git"))||ne("git",["init","-b","main"],e.rootDir);let n=K(e.rootDir,".gitignore");Re(n)||R(n,`# dapei workspace gitignore
node_modules/
.DS_Store
.dapei/audit/
features/*/repos/
`),[K(e.dapeiDir,"workflows"),K(e.dapeiDir,"rules"),K(e.dapeiDir,"cognitive"),e.reposDir,e.featuresDir,K(e.docsDir,"as-is"),K(e.docsDir,"as-is","behavior"),K(e.docsDir,"as-is","state-machines"),K(e.docsDir,"as-is","domains"),K(e.docsDir,"architecture"),K(e.docsDir,"standards"),K(e.docsDir,"business"),K(e.docsDir,"domain"),K(e.docsDir,"glossary"),K(e.docsDir,"workflows"),K(e.docsDir,"decisions"),K(e.docsDir,"feature-impact"),K(e.docsDir,"integrations"),K(e.docsDir,"observability"),K(e.docsDir,"playbooks"),K(e.docsDir,"specs"),K(e.runtimeDir,"templates"),K(e.runtimeDir,"ai-rules")].forEach(J);let i=K(e.dapeiDir,"workspace.yaml");Re(i)||R(i,`version: 0.2
workspace:
  name: ${Ss(e.rootDir)}
  root: .
  default_branch: main
  locale: zh-CN
  repos_file: .dapei/repos.yaml

repos:
  root_dir: repos
  feature_repo_mode: worktree
  management_mode: submodule
  managed_repos: []

quality_gates:
  guardrail_mode: report
  required_reports:
    - feature-progress
    - daily-report
    - architecture-review
    - validation-report
`);let a=$s(),s=[["dapei/commands.yaml",K(e.dapeiDir,"commands.yaml")],["dapei/feature.schema.yaml",K(e.dapeiDir,"feature.schema.yaml")],["dapei/repos.schema.yaml",K(e.dapeiDir,"repos.schema.yaml")],["dapei/workflows/feature-lifecycle.yaml",K(e.dapeiDir,"workflows","feature-lifecycle.yaml")],["dapei/rules/api.yaml",K(e.dapeiDir,"rules","api.yaml")],["dapei/rules/cognitive.yaml",K(e.dapeiDir,"rules","cognitive.yaml")],["dapei/rules/ddd.yaml",K(e.dapeiDir,"rules","ddd.yaml")],["dapei/rules/layering.yaml",K(e.dapeiDir,"rules","layering.yaml")],["dapei/rules/naming.yaml",K(e.dapeiDir,"rules","naming.yaml")],["dapei/cognitive/index.yaml",K(e.dapeiDir,"cognitive","index.yaml")],["01-current-state.md.template",K(e.runtimeDir,"templates","01-current-state.md.template")],["02-gap-analysis.md.template",K(e.runtimeDir,"templates","02-gap-analysis.md.template")],["03-business-design.md.template",K(e.runtimeDir,"templates","03-business-design.md.template")],["04-technical-design.md.template",K(e.runtimeDir,"templates","04-technical-design.md.template")],["05-task-breakdown.md.template",K(e.runtimeDir,"templates","05-task-breakdown.md.template")],["06-acceptance.md.template",K(e.runtimeDir,"templates","06-acceptance.md.template")]];for(let[p,f]of s)Ds(a,p,f);return[{path:K(e.docsDir,"architecture","README.md"),title:"Architecture & Boundary"},{path:K(e.docsDir,"standards","README.md"),title:"Standards & Rules"},{path:K(e.docsDir,"glossary","README.md"),title:"Terminology Glossary"},{path:K(e.docsDir,"decisions","README.md"),title:"Design Decisions (ADR)"}].forEach(({path:p,title:f})=>{Re(p)||R(p,`# ${f}

*Placeholder for workspace documentation.*
`)}),Re(K(e.docsDir,"agents.md"))||R(K(e.docsDir,"agents.md"),`# Workspace Agents

Use this workspace as the durable source of engineering context.
`),{ok:!0,data:{message:`workspace initialized at ${e.rootDir}`},sideEffects:["filesystem"],reportFragments:["workspace initialized"],artifactPaths:[".dapei/workspace.yaml",".dapei/commands.yaml"]}}},Xr={id:"workspace.report",version:"1.0.0",inputSchema:{},async execute(t){let e=V(t.rootDir),n=K(e.dapeiDir,"repos.yaml"),r=[];if(Re(n)){let a=We(L(n));for(let s of a){let c=K(e.reposDir,s);Re(K(c,".git"))?r.push({name:s,branch:ne("git",["-C",c,"rev-parse","--abbrev-ref","HEAD"],e.rootDir)||void 0,hash:ne("git",["-C",c,"rev-parse","--short","HEAD"],e.rootDir)||void 0,cloned:!0}):r.push({name:s,cloned:!1})}}let i=[];if(Re(e.featuresDir))for(let a of Jr(e.featuresDir)){if(!Re(K(e.featuresDir,a,"feature.yaml")))continue;let s=K(e.featuresDir,a,"reports","feature-progress.md"),c=null;if(Re(s)){let p=L(s).match(/## Stage: (\S+)/);p&&(c=p[1])}i.push({name:a,stage:c})}return{ok:!0,data:{repos:r,features:i},sideEffects:[],reportFragments:["workspace report generated"]}}},ei={id:"workspace.validate",version:"1.0.0",inputSchema:{},async execute(t){let e=V(t.rootDir),n=[],r=[];return Re(K(e.dapeiDir,"workspace.yaml"))||n.push(".dapei/workspace.yaml missing"),Re(e.reposDir)||r.push("repos/ directory missing"),Re(e.featuresDir)||r.push("features/ directory missing"),Re(K(e.docsDir,"agents.md"))||r.push("docs/agents.md missing"),{ok:!0,data:{status:n.length===0?r.length===0?"valid":"warn":"invalid",errors:n,warnings:r},sideEffects:[],reportFragments:["workspace validated"]}}},ti={id:"workspace.status",version:"1.0.0",inputSchema:{},async execute(t){let e=V(t.rootDir),n=K(e.dapeiDir,"repos.yaml"),r=Re(n)?We(L(n)).length:0,i=Re(e.featuresDir)?Jr(e.featuresDir).filter(s=>Re(K(e.featuresDir,s,"feature.yaml"))).length:0,a=Jn(e.rootDir);return{ok:!0,data:{repoCount:r,featureCount:i,conforms:a},sideEffects:[],reportFragments:["workspace status"]}}};import{existsSync as Te,readdirSync as Cs}from"node:fs";import{join as we,relative as xs}from"node:path";function An(t,e,n){try{return{ok:!0,out:Le(t,e,n)}}catch(r){return{ok:!1,out:r?.stdout?.toString?.()||"",err:r?.stderr?.toString?.()||r?.message||String(r)}}}function Xn(t,e){return!!ne("git",["-C",t,"status","--porcelain"],e)}function ni(t,e){return ne("git",["-C",t,"rev-parse","--abbrev-ref","HEAD"],e)||"HEAD"}function ri(t,e){let n=Ke(t);if(ni(t,e)===n)return{ok:!0};if(Xn(t,e))return{ok:!1,message:`repo is dirty; cannot checkout default branch '${n}'`};let i=An("git",["-C",t,"checkout",n],e);return i.ok?{ok:!0}:{ok:!1,message:`failed to checkout default branch '${n}': ${i.err||"unknown error"}`}}function ii(t,e){let n=Ke(t),r=ne("git",["-C",t,"rev-parse","--short","HEAD"],e)||"",i=An("git",["-C",t,"fetch","origin"],e);if(!i.ok)return{ok:!1,message:`fetch failed: ${i.err||"unknown error"}`};let a=An("git",["-C",t,"merge","--ff-only",`origin/${n}`],e);if(!a.ok)return{ok:!1,message:`fast-forward failed: ${a.err||"unknown error"}`};let s=ne("git",["-C",t,"rev-parse","--short","HEAD"],e)||"";return{ok:!0,before:r,after:s}}var oi={id:"repos.add",version:"1.1.0",inputSchema:{required:["name","url"],properties:{name:{type:"string",minLength:1},url:{type:"string",minLength:1},auto_profile:{type:"boolean"}},additionalProperties:!1},async execute(t,e){X(e,["name","url"]);let n=V(t.rootDir),r=String(e.name),i=String(e.url),a=we(n.reposDir,r);J(n.reposDir),J(n.dapeiDir);let s=e.auto_profile===!0,c="clone",p=we(n.dapeiDir,"workspace.yaml");if(Te(p)){let b=L(p).match(/management_mode:\s*["']?([a-z]+)["']?/);b&&(b[1]==="submodule"||b[1]==="clone")&&(c=b[1])}if(Te(we(a,".git")))throw new A("REPO_EXISTS",`repos '${r}' already exists`);if(c==="submodule"){Te(we(n.rootDir,".git"))||ne("git",["init","-b","main"],n.rootDir);try{Le("git",["-c","protocol.file.allow=always","submodule","add",i,`repos/${r}`],n.rootDir),Le("git",["-c","protocol.file.allow=always","submodule","update","--init","--recursive",`repos/${r}`],n.rootDir)}catch{Le("git",["clone",i,a],n.rootDir)}}else Le("git",["clone",i,a],n.rootDir);let f=ri(a,n.rootDir);if(!f.ok)throw new A("REPO_INVALID_BASE",`repos/${r} not on default branch: ${f.message||"unknown error"}`);let u=ii(a,n.rootDir);if(!u.ok)throw new A("REPO_SYNC_FAILED",`repos/${r} failed to sync default branch: ${u.message||"unknown error"}`);let l=we(n.dapeiDir,"repos.yaml");Te(l)||R(l,`version: "0.2"
repos:
`);let d=L(l);!d.includes(`name: ${r}`)&&!d.includes(`name: "${r}"`)&&R(l,d+`  - name: ${r}
    path: repos/${r}
    url: ${i}
    added-at: ${new Date().toISOString()}
    default-branch: ${Ke(a)}
    test-commands: []
`);let g=[c==="submodule"?"git submodule add":"git clone","repos registry"],h={name:r,url:i};if(s){if(!t.dispatch)throw new A("DISPATCH_UNAVAILABLE","repos.add requires ctx.dispatch to run 'cdr.profile'");let{result:v}=await t.dispatch("cdr.profile",{repo:r}),b=v.data;h.profile_path=b.path,g.push(`cdr.profile: ${b.path}`)}return{ok:!0,data:h,sideEffects:g,reportFragments:s?["repos add done; profile generated"]:["repos add done"]}}},si={id:"repos.sync",version:"1.0.0",inputSchema:{required:["target"],properties:{target:{type:"string",minLength:1}},additionalProperties:!1},async execute(t,e){X(e,["target"]);let n=String(e.target),r=V(t.rootDir),i=we(r.dapeiDir,"repos.yaml"),a=n==="--all"&&Te(i)?We(L(i)):[n],s=[];for(let c of a){let p=we(r.reposDir,c);if(!Te(we(p,".git")))continue;if(Xn(p,r.rootDir))throw new A("REPO_DIRTY",`repos/${c} is dirty; base repos must be read-only. Please discard changes: (cd repos/${c} && git status)`);let f=ri(p,r.rootDir);if(!f.ok)throw new A("REPO_INVALID_BASE",`repos/${c} not on default branch: ${f.message||"unknown error"}`);let u=Ke(p),l=ii(p,r.rootDir);if(!l.ok)throw new A("REPO_SYNC_FAILED",`repos/${c} failed to fast-forward '${u}': ${l.message||"unknown error"}`);s.push(`${c}: ${u} ${l.before||"???"} -> ${l.after||"???"}`)}return{ok:!0,data:{target:n,results:s},sideEffects:["git fetch","git merge --ff-only"],reportFragments:["repos sync"]}}},ai={id:"repos.check",version:"1.0.0",inputSchema:{required:["target"],properties:{target:{type:"string",minLength:1}},additionalProperties:!1},async execute(t,e){X(e,["target"]);let n=String(e.target),r=V(t.rootDir),i=we(r.dapeiDir,"repos.yaml"),a=n==="--all"&&Te(i)?We(L(i)):[n];if(a.length===0)return{ok:!0,data:{status:"WARN",text:"No repos registered."},sideEffects:[],reportFragments:[]};let s="PASS",c=[`Repo Check (${a.length})`],p=[];for(let f of a){let u=we(r.reposDir,f);if(!Te(we(u,".git"))){s="FAIL",p.push({repo:f,status:"FAIL",detail:"missing .git (not cloned/submodule not initialized)"});continue}let l=An("git",["-C",u,"fetch","--dry-run","origin"],r.rootDir),d="PASS",g=[];l.ok||(d="WARN",g.push("remote fetch dry-run failed"));let h=Ke(u),v=ni(u,r.rootDir);Xn(u,r.rootDir)&&(d="FAIL",g.push("dirty (\u7981\u6B62\u5728\u57FA\u5EA7\u4ED3\u5E93\u5F00\u53D1)")),v!==h&&(d="FAIL",g.push(`not on default branch (expected '${h}', got '${v}')`)),d==="FAIL"?s="FAIL":d==="WARN"&&s!=="FAIL"&&(s="WARN"),p.push({repo:f,status:d,detail:g.length?g.join("; "):"ok"})}c.push(`Overall: ${s}`);for(let f of p)c.push(`- ${f.repo}: ${f.status} - ${f.detail}`);return{ok:!0,data:{status:s,results:p,text:c.join(`
`)},sideEffects:[],reportFragments:["repos check"]}}},ci={id:"repos.list",version:"1.0.0",inputSchema:{},async execute(t){let e=V(t.rootDir),n=we(e.dapeiDir,"repos.yaml");if(!Te(n))return{ok:!0,data:{text:"No repos registered."},sideEffects:[],reportFragments:[]};let r=We(L(n)),i=[`Codebases (${r.length}):`];for(let a of r){let s=we(e.reposDir,a);Te(we(s,".git"))?i.push(`  - ${a}: ${ne("git",["-C",s,"rev-parse","--abbrev-ref","HEAD"],e.rootDir)||"???"} (${ne("git",["-C",s,"rev-parse","--short","HEAD"],e.rootDir)||"???"})`):i.push(`  - ${a}: not cloned`)}return{ok:!0,data:{text:i.join(`
`)},sideEffects:[],reportFragments:[]}}},li={id:"repos.analyze",version:"2.0.0",inputSchema:{required:["target"],properties:{target:{type:"string",minLength:1},use_cdr:{type:"boolean"}},additionalProperties:!1},async execute(t,e){X(e,["target"]);let n=V(t.rootDir),r=String(e.target),i=e.use_cdr===void 0?!0:!!e.use_cdr,a=r==="--all"&&Te(we(n.dapeiDir,"repos.yaml"))?We(L(we(n.dapeiDir,"repos.yaml"))):[r];if(i){if(!t.dispatch)throw new A("DISPATCH_UNAVAILABLE","repos.analyze requires ctx.dispatch to run 'cdr.profile'");let f=t.dispatch,u=[];for(let l of a){let d=we(n.reposDir,l);if(!Te(we(d,".git")))continue;let h=(await f("cdr.profile",{repo:l})).result.data;u.push({name:h.repo,profile_path:h.path,language:h.language,manifest_files:h.manifest_files,test_commands:h.test_commands,codegraph:h.codegraph})}return{ok:!0,data:{target:r,use_cdr:!0,profiles:u,next_step:u.length===0?"no repos found; check `repos list`":"review each profile_path; next: `@dapei discover entries for <repo>`"},sideEffects:["cdr.profile per repo"],reportFragments:[`repos analyzed via cdr.profile (${u.length})`]}}let s=[];for(let f of a){let u=we(n.reposDir,f);if(!Te(we(u,".git")))continue;let l=ne("git",["-C",u,"rev-parse","--abbrev-ref","HEAD"],n.rootDir)||"",d=ne("git",["-C",u,"rev-parse","--short","HEAD"],n.rootDir)||"",g=Pt(u),h=kt(u),v=(ne("find",[u,"-maxdepth","3","-type","d"],n.rootDir)||"").split(`
`).slice(0,60).map(S=>S.replace(`${u}/`,"")),b=(ne("grep",["-rnE","\\.(get|post|put|delete|patch)\\s*\\(|@(Get|Post|Put|Delete|Patch|Request)Mapping",u,"--include=*.js","--include=*.ts","--include=*.java"],n.rootDir)||"").split(`
`).filter(Boolean).slice(0,30),_=(ne("find",[u,"-type","f","(","-name","*.sql","-o","-path","*/migrations/*","-o","-path","*/migrate/*",")"],n.rootDir)||"").split(`
`).filter(Boolean).slice(0,20).map(S=>S.replace(`${u}/`,"")),y=(ne("grep",["-rliE","kafka|rabbitmq|amqp|bull|celery|nats|SQS|SNS|EventBridge",u],n.rootDir)||"").split(`
`).filter(Boolean).slice(0,15).map(S=>S.replace(`${u}/`,"")),$=(ne("grep",["-rnE","TODO|FIXME|HACK",u,"--include=*.js","--include=*.ts","--include=*.java","--include=*.py","--include=*.go","--include=*.rs"],n.rootDir)||"").split(`
`).filter(Boolean).slice(0,20);s.push({name:f,branch:l,hash:d,stack:g,testCommands:h,structure:v,apiEndpoints:b,dbFiles:_,mqEvidence:y,todos:$})}let c=we(n.docsDir,"as-is","repo-inventory.md"),p=["# Repo Inventory","",`- Generated At: ${new Date().toISOString()}`,`- Target: ${r}`,`- Repos: ${s.length}`,"- Mode: legacy (use_cdr=false; deprecated)",""];for(let f of s)p.push(`## ${f.name}`,"",`- Branch: ${f.branch||"unknown"}`,`- Commit: ${f.hash||"unknown"}`,`- Stack: ${f.stack||"unknown"}`,`- Test Commands: ${f.testCommands.length?f.testCommands.join(", "):"none detected"}`,"","### Structure",...f.structure.length?f.structure.map(u=>`- ${u}`):["- none"],"","### API Evidence",...f.apiEndpoints.length?f.apiEndpoints.map(u=>`- ${u}`):["- none"],"","### Database Evidence",...f.dbFiles.length?f.dbFiles.map(u=>`- ${u}`):["- none"],"","### Messaging Evidence",...f.mqEvidence.length?f.mqEvidence.map(u=>`- ${u}`):["- none"],"","### TODO Evidence",...f.todos.length?f.todos.map(u=>`- ${u}`):["- none"],"");return R(c,p.join(`
`)),{ok:!0,data:{target:r,use_cdr:!1,repos:s,report:xs(n.rootDir,c),deprecated:!0},sideEffects:["repo inventory report (legacy)"],reportFragments:["repos scanned (legacy mode; pass use_cdr:true to use cdr.profile)"]}}},pi={id:"repos.remove",version:"1.0.0",inputSchema:{required:["name"],properties:{name:{type:"string",minLength:1},force:{type:"boolean"}},additionalProperties:!1},async execute(t,e){X(e,["name"]);let n=String(e.name),r=V(t.rootDir),i=we(r.reposDir,n),a=we(r.dapeiDir,"repos.yaml");if(!Te(we(i,".git")))throw new A("REPO_MISSING",`repos/${n} not found`);if(Te(r.featuresDir))for(let s of Cs(r.featuresDir)){let c=we(r.featuresDir,s,"repos",n);if(Te(we(c,".git"))&&e.force!==!0)throw new A("REPO_IN_USE",`repos/${n} in use by feature '${s}'. use --force to override`)}if(Te(a)){let c=L(a).split(`
`),p=[],f=!1;for(let u=0;u<c.length;u++){let l=c[u],d=l.match(/^\s+- name:\s*"?([^"]+)"?/);if(d&&d[1]===n){f=!0;continue}if(f)if(l.match(/^\s+- name:\s*/))f=!1;else continue;p.push(l)}R(a,p.join(`
`))}return ne("rm",["-rf",i],r.rootDir),{ok:!0,data:{name:n},sideEffects:["repo removed","registry updated"],reportFragments:[`repos ${n} removed`]}}};import{existsSync as me,readdirSync as zi,copyFileSync as na,unlinkSync as ra}from"node:fs";import{createHash as ji}from"node:crypto";import{join as q,relative as St}from"node:path";import{existsSync as Ge}from"node:fs";import{readdirSync as Zs,readFileSync as xn,writeFileSync as Ks,mkdirSync as Js}from"node:fs";import{join as Be}from"node:path";import{existsSync as Hs}from"node:fs";import{join as Je}from"node:path";var Rs=Object.create,di=Object.defineProperty,Es=Object.getOwnPropertyDescriptor,Is=Object.getOwnPropertyNames,Ps=Object.getPrototypeOf,Ls=Object.prototype.hasOwnProperty,Se=(t,e)=>()=>(e||(t((e={exports:{}}).exports,e),t=null),e.exports),Ts=(t,e,n,r)=>{if(e&&typeof e=="object"||typeof e=="function")for(var i=Is(e),a=0,s=i.length,c;a<s;a++)c=i[a],!Ls.call(t,c)&&c!==n&&di(t,c,{get:(p=>e[p]).bind(null,c),enumerable:!(r=Es(e,c))||r.enumerable});return t},Fs=(t,e,n)=>(n=t!=null?Rs(Ps(t)):{},Ts(e||!t||!t.__esModule?di(n,"default",{value:t,enumerable:!0}):n,t)),Kt=Se(((t,e)=>{function n(p){return typeof p>"u"||p===null}function r(p){return typeof p=="object"&&p!==null}function i(p){return Array.isArray(p)?p:n(p)?[]:[p]}function a(p,f){if(f){let u=Object.keys(f);for(let l=0,d=u.length;l<d;l+=1){let g=u[l];p[g]=f[g]}}return p}function s(p,f){let u="";for(let l=0;l<f;l+=1)u+=p;return u}function c(p){return p===0&&Number.NEGATIVE_INFINITY===1/p}e.exports.isNothing=n,e.exports.isObject=r,e.exports.toArray=i,e.exports.repeat=s,e.exports.isNegativeZero=c,e.exports.extend=a})),Jt=Se(((t,e)=>{function n(i,a){let s="",c=i.reason||"(unknown reason)";return i.mark?(i.mark.name&&(s+='in "'+i.mark.name+'" '),s+="("+(i.mark.line+1)+":"+(i.mark.column+1)+")",!a&&i.mark.snippet&&(s+=`

`+i.mark.snippet),c+" "+s):c}function r(i,a){Error.call(this),this.name="YAMLException",this.reason=i,this.mark=a,this.message=n(this,!1),Error.captureStackTrace?Error.captureStackTrace(this,this.constructor):this.stack=new Error().stack||""}r.prototype=Object.create(Error.prototype),r.prototype.constructor=r,r.prototype.toString=function(a){return this.name+": "+n(this,a)},e.exports=r})),Bs=Se(((t,e)=>{var n=Kt();function r(s,c,p,f,u){let l="",d="",g=Math.floor(u/2)-1;return f-c>g&&(l=" ... ",c=f-g+l.length),p-f>g&&(d=" ...",p=f+g-d.length),{str:l+s.slice(c,p).replace(/\t/g,"\u2192")+d,pos:f-c+l.length}}function i(s,c){return n.repeat(" ",c-s.length)+s}function a(s,c){if(c=Object.create(c||null),!s.buffer)return null;c.maxLength||(c.maxLength=79),typeof c.indent!="number"&&(c.indent=1),typeof c.linesBefore!="number"&&(c.linesBefore=3),typeof c.linesAfter!="number"&&(c.linesAfter=2);let p=/\r?\n|\r|\0/g,f=[0],u=[],l,d=-1;for(;l=p.exec(s.buffer);)u.push(l.index),f.push(l.index+l[0].length),s.position<=l.index&&d<0&&(d=f.length-2);d<0&&(d=f.length-1);let g="",h=Math.min(s.line+c.linesAfter,u.length).toString().length,v=c.maxLength-(c.indent+h+3);for(let _=1;_<=c.linesBefore&&!(d-_<0);_++){let y=r(s.buffer,f[d-_],u[d-_],s.position-(f[d]-f[d-_]),v);g=n.repeat(" ",c.indent)+i((s.line-_+1).toString(),h)+" | "+y.str+`
`+g}let b=r(s.buffer,f[d],u[d],s.position,v);g+=n.repeat(" ",c.indent)+i((s.line+1).toString(),h)+" | "+b.str+`
`,g+=n.repeat("-",c.indent+h+3+b.pos)+`^
`;for(let _=1;_<=c.linesAfter&&!(d+_>=u.length);_++){let y=r(s.buffer,f[d+_],u[d+_],s.position-(f[d]-f[d+_]),v);g+=n.repeat(" ",c.indent)+i((s.line+_+1).toString(),h)+" | "+y.str+`
`}return g.replace(/\n$/,"")}e.exports=a})),Fe=Se(((t,e)=>{var n=Jt(),r=["kind","multi","resolve","construct","instanceOf","predicate","represent","representName","defaultStyle","styleAliases"],i=["scalar","sequence","mapping"];function a(c){let p={};return c!==null&&Object.keys(c).forEach(function(f){c[f].forEach(function(u){p[String(u)]=f})}),p}function s(c,p){if(p=p||{},Object.keys(p).forEach(function(f){if(r.indexOf(f)===-1)throw new n('Unknown option "'+f+'" is met in definition of "'+c+'" YAML type.')}),this.options=p,this.tag=c,this.kind=p.kind||null,this.resolve=p.resolve||function(){return!0},this.construct=p.construct||function(f){return f},this.instanceOf=p.instanceOf||null,this.predicate=p.predicate||null,this.represent=p.represent||null,this.representName=p.representName||null,this.defaultStyle=p.defaultStyle||null,this.multi=p.multi||!1,this.styleAliases=a(p.styleAliases||null),i.indexOf(this.kind)===-1)throw new n('Unknown kind "'+this.kind+'" is specified for "'+c+'" YAML type.')}e.exports=s})),ui=Se(((t,e)=>{var n=Jt(),r=Fe();function i(c,p){let f=[];return c[p].forEach(function(u){let l=f.length;f.forEach(function(d,g){d.tag===u.tag&&d.kind===u.kind&&d.multi===u.multi&&(l=g)}),f[l]=u}),f}function a(){let c={scalar:{},sequence:{},mapping:{},fallback:{},multi:{scalar:[],sequence:[],mapping:[],fallback:[]}};function p(f){f.multi?(c.multi[f.kind].push(f),c.multi.fallback.push(f)):c[f.kind][f.tag]=c.fallback[f.tag]=f}for(let f=0,u=arguments.length;f<u;f+=1)arguments[f].forEach(p);return c}function s(c){return this.extend(c)}s.prototype.extend=function(p){let f=[],u=[];if(p instanceof r)u.push(p);else if(Array.isArray(p))u=u.concat(p);else if(p&&(Array.isArray(p.implicit)||Array.isArray(p.explicit)))p.implicit&&(f=f.concat(p.implicit)),p.explicit&&(u=u.concat(p.explicit));else throw new n("Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })");f.forEach(function(d){if(!(d instanceof r))throw new n("Specified list of YAML types (or a single Type object) contains a non-Type object.");if(d.loadKind&&d.loadKind!=="scalar")throw new n("There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.");if(d.multi)throw new n("There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.")}),u.forEach(function(d){if(!(d instanceof r))throw new n("Specified list of YAML types (or a single Type object) contains a non-Type object.")});let l=Object.create(s.prototype);return l.implicit=(this.implicit||[]).concat(f),l.explicit=(this.explicit||[]).concat(u),l.compiledImplicit=i(l,"implicit"),l.compiledExplicit=i(l,"explicit"),l.compiledTypeMap=a(l.compiledImplicit,l.compiledExplicit),l},e.exports=s})),fi=Se(((t,e)=>{e.exports=new(Fe())("tag:yaml.org,2002:str",{kind:"scalar",construct:function(n){return n!==null?n:""}})})),gi=Se(((t,e)=>{e.exports=new(Fe())("tag:yaml.org,2002:seq",{kind:"sequence",construct:function(n){return n!==null?n:[]}})})),mi=Se(((t,e)=>{e.exports=new(Fe())("tag:yaml.org,2002:map",{kind:"mapping",construct:function(n){return n!==null?n:{}}})})),hi=Se(((t,e)=>{e.exports=new(ui())({explicit:[fi(),gi(),mi()]})})),yi=Se(((t,e)=>{var n=Fe();function r(s){if(s===null)return!0;let c=s.length;return c===1&&s==="~"||c===4&&(s==="null"||s==="Null"||s==="NULL")}function i(){return null}function a(s){return s===null}e.exports=new n("tag:yaml.org,2002:null",{kind:"scalar",resolve:r,construct:i,predicate:a,represent:{canonical:function(){return"~"},lowercase:function(){return"null"},uppercase:function(){return"NULL"},camelcase:function(){return"Null"},empty:function(){return""}},defaultStyle:"lowercase"})})),bi=Se(((t,e)=>{var n=Fe();function r(s){if(s===null)return!1;let c=s.length;return c===4&&(s==="true"||s==="True"||s==="TRUE")||c===5&&(s==="false"||s==="False"||s==="FALSE")}function i(s){return s==="true"||s==="True"||s==="TRUE"}function a(s){return Object.prototype.toString.call(s)==="[object Boolean]"}e.exports=new n("tag:yaml.org,2002:bool",{kind:"scalar",resolve:r,construct:i,predicate:a,represent:{lowercase:function(s){return s?"true":"false"},uppercase:function(s){return s?"TRUE":"FALSE"},camelcase:function(s){return s?"True":"False"}},defaultStyle:"lowercase"})})),vi=Se(((t,e)=>{var n=Kt(),r=Fe();function i(l){return l>=48&&l<=57||l>=65&&l<=70||l>=97&&l<=102}function a(l){return l>=48&&l<=55}function s(l){return l>=48&&l<=57}function c(l){if(l===null)return!1;let d=l.length,g=0,h=!1;if(!d)return!1;let v=l[g];if((v==="-"||v==="+")&&(v=l[++g]),v==="0"){if(g+1===d)return!0;if(v=l[++g],v==="b"){for(g++;g<d;g++){if(v=l[g],v!=="0"&&v!=="1")return!1;h=!0}return h&&Number.isFinite(p(l))}if(v==="x"){for(g++;g<d;g++){if(!i(l.charCodeAt(g)))return!1;h=!0}return h&&Number.isFinite(p(l))}if(v==="o"){for(g++;g<d;g++){if(!a(l.charCodeAt(g)))return!1;h=!0}return h&&Number.isFinite(p(l))}}for(;g<d;g++){if(!s(l.charCodeAt(g)))return!1;h=!0}return h?Number.isFinite(p(l)):!1}function p(l){let d=l,g=1,h=d[0];if((h==="-"||h==="+")&&(h==="-"&&(g=-1),d=d.slice(1),h=d[0]),d==="0")return 0;if(h==="0"){if(d[1]==="b")return g*parseInt(d.slice(2),2);if(d[1]==="x")return g*parseInt(d.slice(2),16);if(d[1]==="o")return g*parseInt(d.slice(2),8)}return g*parseInt(d,10)}function f(l){return p(l)}function u(l){return Object.prototype.toString.call(l)==="[object Number]"&&l%1===0&&!n.isNegativeZero(l)}e.exports=new r("tag:yaml.org,2002:int",{kind:"scalar",resolve:c,construct:f,predicate:u,represent:{binary:function(l){return l>=0?"0b"+l.toString(2):"-0b"+l.toString(2).slice(1)},octal:function(l){return l>=0?"0o"+l.toString(8):"-0o"+l.toString(8).slice(1)},decimal:function(l){return l.toString(10)},hexadecimal:function(l){return l>=0?"0x"+l.toString(16).toUpperCase():"-0x"+l.toString(16).toUpperCase().slice(1)}},defaultStyle:"decimal",styleAliases:{binary:[2,"bin"],octal:[8,"oct"],decimal:[10,"dec"],hexadecimal:[16,"hex"]}})})),_i=Se(((t,e)=>{var n=Kt(),r=Fe(),i=new RegExp("^(?:[-+]?(?:[0-9]+)(?:\\.[0-9]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"),a=new RegExp("^(?:[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$");function s(l){return l===null||!i.test(l)?!1:Number.isFinite(parseFloat(l,10))?!0:a.test(l)}function c(l){let d=l.toLowerCase(),g=d[0]==="-"?-1:1;return"+-".indexOf(d[0])>=0&&(d=d.slice(1)),d===".inf"?g===1?Number.POSITIVE_INFINITY:Number.NEGATIVE_INFINITY:d===".nan"?NaN:g*parseFloat(d,10)}var p=/^[-+]?[0-9]+e/;function f(l,d){if(isNaN(l))switch(d){case"lowercase":return".nan";case"uppercase":return".NAN";case"camelcase":return".NaN"}else if(Number.POSITIVE_INFINITY===l)switch(d){case"lowercase":return".inf";case"uppercase":return".INF";case"camelcase":return".Inf"}else if(Number.NEGATIVE_INFINITY===l)switch(d){case"lowercase":return"-.inf";case"uppercase":return"-.INF";case"camelcase":return"-.Inf"}else if(n.isNegativeZero(l))return"-0.0";let g=l.toString(10);return p.test(g)?g.replace("e",".e"):g}function u(l){return Object.prototype.toString.call(l)==="[object Number]"&&(l%1!==0||n.isNegativeZero(l))}e.exports=new r("tag:yaml.org,2002:float",{kind:"scalar",resolve:s,construct:c,predicate:u,represent:f,defaultStyle:"lowercase"})})),wi=Se(((t,e)=>{e.exports=hi().extend({implicit:[yi(),bi(),vi(),_i()]})})),ki=Se(((t,e)=>{e.exports=wi()})),Si=Se(((t,e)=>{var n=Fe(),r=new RegExp("^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$"),i=new RegExp("^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$");function a(p){return p===null?!1:r.exec(p)!==null||i.exec(p)!==null}function s(p){let f=0,u=null,l=r.exec(p);if(l===null&&(l=i.exec(p)),l===null)throw new Error("Date resolve error");let d=+l[1],g=+l[2]-1,h=+l[3];if(!l[4])return new Date(Date.UTC(d,g,h));let v=+l[4],b=+l[5],_=+l[6];if(l[7]){for(f=l[7].slice(0,3);f.length<3;)f+="0";f=+f}if(l[9]){let $=+l[10],S=+(l[11]||0);u=($*60+S)*6e4,l[9]==="-"&&(u=-u)}let y=new Date(Date.UTC(d,g,h,v,b,_,f));return u&&y.setTime(y.getTime()-u),y}function c(p){return p.toISOString()}e.exports=new n("tag:yaml.org,2002:timestamp",{kind:"scalar",resolve:a,construct:s,instanceOf:Date,represent:c})})),Ai=Se(((t,e)=>{var n=Fe();function r(i){return i==="<<"||i===null}e.exports=new n("tag:yaml.org,2002:merge",{kind:"scalar",resolve:r})})),$i=Se(((t,e)=>{var n=Fe(),r=`ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=
\r`;function i(p){if(p===null)return!1;let f=0,u=p.length,l=r;for(let d=0;d<u;d++){let g=l.indexOf(p.charAt(d));if(!(g>64)){if(g<0)return!1;f+=6}}return f%8===0}function a(p){let f=p.replace(/[\r\n=]/g,""),u=f.length,l=r,d=0,g=[];for(let v=0;v<u;v++)v%4===0&&v&&(g.push(d>>16&255),g.push(d>>8&255),g.push(d&255)),d=d<<6|l.indexOf(f.charAt(v));let h=u%4*6;return h===0?(g.push(d>>16&255),g.push(d>>8&255),g.push(d&255)):h===18?(g.push(d>>10&255),g.push(d>>2&255)):h===12&&g.push(d>>4&255),new Uint8Array(g)}function s(p){let f="",u=0,l=p.length,d=r;for(let h=0;h<l;h++)h%3===0&&h&&(f+=d[u>>18&63],f+=d[u>>12&63],f+=d[u>>6&63],f+=d[u&63]),u=(u<<8)+p[h];let g=l%3;return g===0?(f+=d[u>>18&63],f+=d[u>>12&63],f+=d[u>>6&63],f+=d[u&63]):g===2?(f+=d[u>>10&63],f+=d[u>>4&63],f+=d[u<<2&63],f+=d[64]):g===1&&(f+=d[u>>2&63],f+=d[u<<4&63],f+=d[64],f+=d[64]),f}function c(p){return Object.prototype.toString.call(p)==="[object Uint8Array]"}e.exports=new n("tag:yaml.org,2002:binary",{kind:"scalar",resolve:i,construct:a,predicate:c,represent:s})})),Di=Se(((t,e)=>{var n=Fe(),r=Object.prototype.hasOwnProperty,i=Object.prototype.toString;function a(c){if(c===null)return!0;let p=[],f=c;for(let u=0,l=f.length;u<l;u+=1){let d=f[u],g=!1;if(i.call(d)!=="[object Object]")return!1;let h;for(h in d)if(r.call(d,h))if(!g)g=!0;else return!1;if(!g)return!1;if(p.indexOf(h)===-1)p.push(h);else return!1}return!0}function s(c){return c!==null?c:[]}e.exports=new n("tag:yaml.org,2002:omap",{kind:"sequence",resolve:a,construct:s})})),Ci=Se(((t,e)=>{var n=Fe(),r=Object.prototype.toString;function i(s){if(s===null)return!0;let c=s,p=new Array(c.length);for(let f=0,u=c.length;f<u;f+=1){let l=c[f];if(r.call(l)!=="[object Object]")return!1;let d=Object.keys(l);if(d.length!==1)return!1;p[f]=[d[0],l[d[0]]]}return!0}function a(s){if(s===null)return[];let c=s,p=new Array(c.length);for(let f=0,u=c.length;f<u;f+=1){let l=c[f],d=Object.keys(l);p[f]=[d[0],l[d[0]]]}return p}e.exports=new n("tag:yaml.org,2002:pairs",{kind:"sequence",resolve:i,construct:a})})),xi=Se(((t,e)=>{var n=Fe(),r=Object.prototype.hasOwnProperty;function i(s){if(s===null)return!0;let c=s;for(let p in c)if(r.call(c,p)&&c[p]!==null)return!1;return!0}function a(s){return s!==null?s:{}}e.exports=new n("tag:yaml.org,2002:set",{kind:"mapping",resolve:i,construct:a})})),er=Se(((t,e)=>{e.exports=ki().extend({implicit:[Si(),Ai()],explicit:[$i(),Di(),Ci(),xi()]})})),Ns=Se(((t,e)=>{var n=Kt(),r=Jt(),i=Bs(),a=er(),s=Object.prototype.hasOwnProperty,c=1,p=2,f=3,u=4,l=1,d=2,g=3,h=/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/,v=/[\x85\u2028\u2029]/,b=/[,\[\]{}]/,_=/^(?:!|!!|![0-9A-Za-z-]+!)$/,y=/^(?:!|[^,\[\]{}])(?:%[0-9a-f]{2}|[0-9a-z\-#;/?:@&=+$,_.!~*'()\[\]])*$/i;function $(o){return Object.prototype.toString.call(o)}function S(o){return o===10||o===13}function F(o){return o===9||o===32}function M(o){return o===9||o===32||o===10||o===13}function Y(o){return o===44||o===91||o===93||o===123||o===125}function U(o){if(o>=48&&o<=57)return o-48;let w=o|32;return w>=97&&w<=102?w-97+10:-1}function ie(o){return o===120?2:o===117?4:o===85?8:0}function ae(o){return o>=48&&o<=57?o-48:-1}function re(o){switch(o){case 48:return"\0";case 97:return"\x07";case 98:return"\b";case 116:return"	";case 9:return"	";case 110:return`
`;case 118:return"\v";case 102:return"\f";case 114:return"\r";case 101:return"\x1B";case 32:return" ";case 34:return'"';case 47:return"/";case 92:return"\\";case 78:return"\x85";case 95:return"\xA0";case 76:return"\u2028";case 80:return"\u2029";default:return""}}function se(o){return o<=65535?String.fromCharCode(o):String.fromCharCode((o-65536>>10)+55296,(o-65536&1023)+56320)}function de(o,w,C){w==="__proto__"?Object.defineProperty(o,w,{configurable:!0,enumerable:!0,writable:!0,value:C}):o[w]=C}var _e=new Array(256),pe=new Array(256);for(let o=0;o<256;o++)_e[o]=re(o)?1:0,pe[o]=re(o);function ye(o,w){this.input=o,this.filename=w.filename||null,this.schema=w.schema||a,this.onWarning=w.onWarning||null,this.legacy=w.legacy||!1,this.json=w.json||!1,this.listener=w.listener||null,this.maxDepth=typeof w.maxDepth=="number"?w.maxDepth:100,this.maxMergeSeqLength=typeof w.maxMergeSeqLength=="number"?w.maxMergeSeqLength:20,this.implicitTypes=this.schema.compiledImplicit,this.typeMap=this.schema.compiledTypeMap,this.length=o.length,this.position=0,this.line=0,this.lineStart=0,this.lineIndent=0,this.depth=0,this.firstTabInLine=-1,this.documents=[],this.anchorMapTransactions=[]}function j(o,w){let C={name:o.filename,buffer:o.input.slice(0,-1),position:o.position,line:o.line,column:o.position-o.lineStart};return C.snippet=i(C),new r(w,C)}function E(o,w){throw j(o,w)}function le(o,w){o.onWarning&&o.onWarning.call(null,j(o,w))}function De(o,w,C){let P=o.anchorMapTransactions;if(P.length!==0){let D=P[P.length-1];s.call(D,w)||(D[w]={existed:s.call(o.anchorMap,w),value:o.anchorMap[w]})}o.anchorMap[w]=C}function Me(o){o.anchorMapTransactions.push(Object.create(null))}function Ve(o){let w=o.anchorMapTransactions.pop(),C=o.anchorMapTransactions;if(C.length===0)return;let P=C[C.length-1],D=Object.keys(w);for(let O=0,m=D.length;O<m;O+=1){let k=D[O];s.call(P,k)||(P[k]=w[k])}}function Vn(o){let w=o.anchorMapTransactions.pop(),C=Object.keys(w);for(let P=C.length-1;P>=0;P-=1){let D=w[C[P]];D.existed?o.anchorMap[C[P]]=D.value:delete o.anchorMap[C[P]]}}function Vt(o){return{position:o.position,line:o.line,lineStart:o.lineStart,lineIndent:o.lineIndent,firstTabInLine:o.firstTabInLine,tag:o.tag,anchor:o.anchor,kind:o.kind,result:o.result}}function Rt(o,w){o.position=w.position,o.line=w.line,o.lineStart=w.lineStart,o.lineIndent=w.lineIndent,o.firstTabInLine=w.firstTabInLine,o.tag=w.tag,o.anchor=w.anchor,o.kind=w.kind,o.result=w.result}var un={YAML:function(w,C,P){w.version!==null&&E(w,"duplication of %YAML directive"),P.length!==1&&E(w,"YAML directive accepts exactly one argument");let D=/^([0-9]+)\.([0-9]+)$/.exec(P[0]);D===null&&E(w,"ill-formed argument of the YAML directive");let O=parseInt(D[1],10),m=parseInt(D[2],10);O!==1&&E(w,"unacceptable YAML version of the document"),w.version=P[0],w.checkLineBreaks=m<2,m!==1&&m!==2&&le(w,"unsupported YAML version of the document")},TAG:function(w,C,P){let D;P.length!==2&&E(w,"TAG directive accepts exactly two arguments");let O=P[0];D=P[1],_.test(O)||E(w,"ill-formed tag handle (first argument) of the TAG directive"),s.call(w.tagMap,O)&&E(w,'there is a previously declared suffix for "'+O+'" tag handle'),y.test(D)||E(w,"ill-formed tag prefix (second argument) of the TAG directive");try{D=decodeURIComponent(D)}catch{E(w,"tag prefix is malformed: "+D)}w.tagMap[O]=D}};function je(o,w,C,P){if(w<C){let D=o.input.slice(w,C);if(P)for(let O=0,m=D.length;O<m;O+=1){let k=D.charCodeAt(O);k===9||k>=32&&k<=1114111||E(o,"expected valid JSON character")}else h.test(D)&&E(o,"the stream contains non-printable characters");o.result+=D}}function ut(o,w,C,P){n.isObject(C)||E(o,"cannot merge mappings; the provided source object is unacceptable");let D=Object.keys(C);for(let O=0,m=D.length;O<m;O+=1){let k=D[O];s.call(w,k)||(de(w,k,C[k]),P[k]=!0)}}function rt(o,w,C,P,D,O,m,k,N){if(Array.isArray(D)){D=Array.prototype.slice.call(D);for(let x=0,I=D.length;x<I;x+=1)Array.isArray(D[x])&&E(o,"nested arrays are not supported inside keys"),typeof D=="object"&&$(D[x])==="[object Object]"&&(D[x]="[object Object]")}if(typeof D=="object"&&$(D)==="[object Object]"&&(D="[object Object]"),D=String(D),w===null&&(w={}),P==="tag:yaml.org,2002:merge")if(Array.isArray(O)){O.length>o.maxMergeSeqLength&&E(o,"merge sequence length exceeded maxMergeSeqLength ("+o.maxMergeSeqLength+")");let x=new Set;for(let I=0,B=O.length;I<B;I+=1){let T=O[I];x.has(T)||(x.add(T),ut(o,w,T,C))}}else ut(o,w,O,C);else!o.json&&!s.call(C,D)&&s.call(w,D)&&(o.line=m||o.line,o.lineStart=k||o.lineStart,o.position=N||o.position,E(o,"duplicated mapping key")),de(w,D,O),delete C[D];return w}function Et(o){let w=o.input.charCodeAt(o.position);w===10?o.position++:w===13?(o.position++,o.input.charCodeAt(o.position)===10&&o.position++):E(o,"a line break is expected"),o.line+=1,o.lineStart=o.position,o.firstTabInLine=-1}function Ce(o,w,C){let P=0,D=o.input.charCodeAt(o.position);for(;D!==0;){for(;F(D);)D===9&&o.firstTabInLine===-1&&(o.firstTabInLine=o.position),D=o.input.charCodeAt(++o.position);if(w&&D===35)do D=o.input.charCodeAt(++o.position);while(D!==10&&D!==13&&D!==0);if(S(D))for(Et(o),D=o.input.charCodeAt(o.position),P++,o.lineIndent=0;D===32;)o.lineIndent++,D=o.input.charCodeAt(++o.position);else break}return C!==-1&&P!==0&&o.lineIndent<C&&le(o,"deficient indentation"),P}function It(o){let w=o.position,C=o.input.charCodeAt(w);return!!((C===45||C===46)&&C===o.input.charCodeAt(w+1)&&C===o.input.charCodeAt(w+2)&&(w+=3,C=o.input.charCodeAt(w),C===0||M(C)))}function it(o,w){w===1?o.result+=" ":w>1&&(o.result+=n.repeat(`
`,w-1))}function fn(o,w,C){let P,D,O,m,k,N,x=o.kind,I=o.result,B=o.input.charCodeAt(o.position);if(M(B)||Y(B)||B===35||B===38||B===42||B===33||B===124||B===62||B===39||B===34||B===37||B===64||B===96)return!1;if(B===63||B===45){let T=o.input.charCodeAt(o.position+1);if(M(T)||C&&Y(T))return!1}for(o.kind="scalar",o.result="",P=D=o.position,O=!1;B!==0;){if(B===58){let T=o.input.charCodeAt(o.position+1);if(M(T)||C&&Y(T))break}else if(B===35){if(M(o.input.charCodeAt(o.position-1)))break}else{if(o.position===o.lineStart&&It(o)||C&&Y(B))break;if(S(B))if(m=o.line,k=o.lineStart,N=o.lineIndent,Ce(o,!1,-1),o.lineIndent>=w){O=!0,B=o.input.charCodeAt(o.position);continue}else{o.position=D,o.line=m,o.lineStart=k,o.lineIndent=N;break}}O&&(je(o,P,D,!1),it(o,o.line-m),P=D=o.position,O=!1),F(B)||(D=o.position+1),B=o.input.charCodeAt(++o.position)}return je(o,P,D,!1),o.result?!0:(o.kind=x,o.result=I,!1)}function gn(o,w){let C,P,D=o.input.charCodeAt(o.position);if(D!==39)return!1;for(o.kind="scalar",o.result="",o.position++,C=P=o.position;(D=o.input.charCodeAt(o.position))!==0;)if(D===39)if(je(o,C,o.position,!0),D=o.input.charCodeAt(++o.position),D===39)C=o.position,o.position++,P=o.position;else return!0;else S(D)?(je(o,C,P,!0),it(o,Ce(o,!1,w)),C=P=o.position):o.position===o.lineStart&&It(o)?E(o,"unexpected end of the document within a single quoted scalar"):(o.position++,F(D)||(P=o.position));E(o,"unexpected end of the stream within a single quoted scalar")}function Gt(o,w){let C,P,D,O=o.input.charCodeAt(o.position);if(O!==34)return!1;for(o.kind="scalar",o.result="",o.position++,C=P=o.position;(O=o.input.charCodeAt(o.position))!==0;){if(O===34)return je(o,C,o.position,!0),o.position++,!0;if(O===92){if(je(o,C,o.position,!0),O=o.input.charCodeAt(++o.position),S(O))Ce(o,!1,w);else if(O<256&&_e[O])o.result+=pe[O],o.position++;else if((D=ie(O))>0){let m=D,k=0;for(;m>0;m--)O=o.input.charCodeAt(++o.position),(D=U(O))>=0?k=(k<<4)+D:E(o,"expected hexadecimal character");o.result+=se(k),o.position++}else E(o,"unknown escape sequence");C=P=o.position}else S(O)?(je(o,C,P,!0),it(o,Ce(o,!1,w)),C=P=o.position):o.position===o.lineStart&&It(o)?E(o,"unexpected end of the document within a double quoted scalar"):(o.position++,F(O)||(P=o.position))}E(o,"unexpected end of the stream within a double quoted scalar")}function mn(o,w){let C=!0,P,D,O,m=o.tag,k,N=o.anchor,x,I,B,T,H=Object.create(null),G,Z,ee,fe=o.input.charCodeAt(o.position);if(fe===91)x=93,T=!1,k=[];else if(fe===123)x=125,T=!0,k={};else return!1;for(o.anchor!==null&&De(o,o.anchor,k),fe=o.input.charCodeAt(++o.position);fe!==0;){if(Ce(o,!0,w),fe=o.input.charCodeAt(o.position),fe===x)return o.position++,o.tag=m,o.anchor=N,o.kind=T?"mapping":"sequence",o.result=k,!0;C?fe===44&&E(o,"expected the node content, but found ','"):E(o,"missed comma between flow collection entries"),Z=G=ee=null,I=B=!1,fe===63&&M(o.input.charCodeAt(o.position+1))&&(I=B=!0,o.position++,Ce(o,!0,w)),P=o.line,D=o.lineStart,O=o.position,st(o,w,c,!1,!0),Z=o.tag,G=o.result,Ce(o,!0,w),fe=o.input.charCodeAt(o.position),(B||o.line===P)&&fe===58&&(I=!0,fe=o.input.charCodeAt(++o.position),Ce(o,!0,w),st(o,w,c,!1,!0),ee=o.result),T?rt(o,k,H,Z,G,ee,P,D,O):I?k.push(rt(o,null,H,Z,G,ee,P,D,O)):k.push(G),Ce(o,!0,w),fe=o.input.charCodeAt(o.position),fe===44?(C=!0,fe=o.input.charCodeAt(++o.position)):C=!1}E(o,"unexpected end of the stream within a flow collection")}function hn(o,w){let C,P=l,D=!1,O=!1,m=w,k=0,N=!1,x,I=o.input.charCodeAt(o.position);if(I===124)C=!1;else if(I===62)C=!0;else return!1;for(o.kind="scalar",o.result="";I!==0;)if(I=o.input.charCodeAt(++o.position),I===43||I===45)l===P?P=I===43?g:d:E(o,"repeat of a chomping mode identifier");else if((x=ae(I))>=0)x===0?E(o,"bad explicit indentation width of a block scalar; it cannot be less than one"):O?E(o,"repeat of an indentation width identifier"):(m=w+x-1,O=!0);else break;if(F(I)){do I=o.input.charCodeAt(++o.position);while(F(I));if(I===35)do I=o.input.charCodeAt(++o.position);while(!S(I)&&I!==0)}for(;I!==0;){for(Et(o),o.lineIndent=0,I=o.input.charCodeAt(o.position);(!O||o.lineIndent<m)&&I===32;)o.lineIndent++,I=o.input.charCodeAt(++o.position);if(!O&&o.lineIndent>m&&(m=o.lineIndent),S(I)){k++;continue}if(!O&&m===0&&E(o,"missing indentation for block scalar"),o.lineIndent<m){P===g?o.result+=n.repeat(`
`,D?1+k:k):P===l&&D&&(o.result+=`
`);break}C?F(I)?(N=!0,o.result+=n.repeat(`
`,D?1+k:k)):N?(N=!1,o.result+=n.repeat(`
`,k+1)):k===0?D&&(o.result+=" "):o.result+=n.repeat(`
`,k):o.result+=n.repeat(`
`,D?1+k:k),D=!0,O=!0,k=0;let B=o.position;for(;!S(I)&&I!==0;)I=o.input.charCodeAt(++o.position);je(o,B,o.position,!1)}return!0}function ot(o,w){let C=o.tag,P=o.anchor,D=[],O=!1;if(o.firstTabInLine!==-1)return!1;o.anchor!==null&&De(o,o.anchor,D);let m=o.input.charCodeAt(o.position);for(;m!==0&&(o.firstTabInLine!==-1&&(o.position=o.firstTabInLine,E(o,"tab characters must not be used in indentation")),!(m!==45||!M(o.input.charCodeAt(o.position+1))));){if(O=!0,o.position++,Ce(o,!0,-1)&&o.lineIndent<=w){D.push(null),m=o.input.charCodeAt(o.position);continue}let k=o.line;if(st(o,w,f,!1,!0),D.push(o.result),Ce(o,!0,-1),m=o.input.charCodeAt(o.position),(o.line===k||o.lineIndent>w)&&m!==0)E(o,"bad indentation of a sequence entry");else if(o.lineIndent<w)break}return O?(o.tag=C,o.anchor=P,o.kind="sequence",o.result=D,!0):!1}function yn(o,w,C){let P,D,O,m,k=o.tag,N=o.anchor,x={},I=Object.create(null),B=null,T=null,H=null,G=!1,Z=!1;if(o.firstTabInLine!==-1)return!1;o.anchor!==null&&De(o,o.anchor,x);let ee=o.input.charCodeAt(o.position);for(;ee!==0;){!G&&o.firstTabInLine!==-1&&(o.position=o.firstTabInLine,E(o,"tab characters must not be used in indentation"));let fe=o.input.charCodeAt(o.position+1),$e=o.line;if((ee===63||ee===58)&&M(fe))ee===63?(G&&(rt(o,x,I,B,T,null,D,O,m),B=T=H=null),Z=!0,G=!0,P=!0):G?(G=!1,P=!0):E(o,"incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line"),o.position+=1,ee=fe;else{if(D=o.line,O=o.lineStart,m=o.position,!st(o,C,p,!1,!0))break;if(o.line===$e){for(ee=o.input.charCodeAt(o.position);F(ee);)ee=o.input.charCodeAt(++o.position);if(ee===58)ee=o.input.charCodeAt(++o.position),M(ee)||E(o,"a whitespace character is expected after the key-value separator within a block mapping"),G&&(rt(o,x,I,B,T,null,D,O,m),B=T=H=null),Z=!0,G=!1,P=!1,B=o.tag,T=o.result;else if(Z)E(o,"can not read an implicit mapping pair; a colon is missed");else return o.tag=k,o.anchor=N,!0}else if(Z)E(o,"can not read a block mapping entry; a multiline key may not be an implicit key");else return o.tag=k,o.anchor=N,!0}if((o.line===$e||o.lineIndent>w)&&(G&&(D=o.line,O=o.lineStart,m=o.position),st(o,w,u,!0,P)&&(G?T=o.result:H=o.result),G||(rt(o,x,I,B,T,H,D,O,m),B=T=H=null),Ce(o,!0,-1),ee=o.input.charCodeAt(o.position)),(o.line===$e||o.lineIndent>w)&&ee!==0)E(o,"bad indentation of a mapping entry");else if(o.lineIndent<w)break}return G&&rt(o,x,I,B,T,null,D,O,m),Z&&(o.tag=k,o.anchor=N,o.kind="mapping",o.result=x),Z}function Gn(o){let w=!1,C=!1,P,D,O=o.input.charCodeAt(o.position);if(O!==33)return!1;o.tag!==null&&E(o,"duplication of a tag property"),O=o.input.charCodeAt(++o.position),O===60?(w=!0,O=o.input.charCodeAt(++o.position)):O===33?(C=!0,P="!!",O=o.input.charCodeAt(++o.position)):P="!";let m=o.position;if(w){do O=o.input.charCodeAt(++o.position);while(O!==0&&O!==62);o.position<o.length?(D=o.input.slice(m,o.position),O=o.input.charCodeAt(++o.position)):E(o,"unexpected end of the stream within a verbatim tag")}else{for(;O!==0&&!M(O);)O===33&&(C?E(o,"tag suffix cannot contain exclamation marks"):(P=o.input.slice(m-1,o.position+1),_.test(P)||E(o,"named tag handle cannot contain such characters"),C=!0,m=o.position+1)),O=o.input.charCodeAt(++o.position);D=o.input.slice(m,o.position),b.test(D)&&E(o,"tag suffix cannot contain flow indicator characters")}D&&!y.test(D)&&E(o,"tag name cannot contain such characters: "+D);try{D=decodeURIComponent(D)}catch{E(o,"tag name is malformed: "+D)}return w?o.tag=D:s.call(o.tagMap,P)?o.tag=o.tagMap[P]+D:P==="!"?o.tag="!"+D:P==="!!"?o.tag="tag:yaml.org,2002:"+D:E(o,'undeclared tag handle "'+P+'"'),!0}function bn(o){let w=o.input.charCodeAt(o.position);if(w!==38)return!1;o.anchor!==null&&E(o,"duplication of an anchor property"),w=o.input.charCodeAt(++o.position);let C=o.position;for(;w!==0&&!M(w)&&!Y(w);)w=o.input.charCodeAt(++o.position);return o.position===C&&E(o,"name of an anchor node must contain at least one character"),o.anchor=o.input.slice(C,o.position),!0}function vn(o){let w=o.input.charCodeAt(o.position);if(w!==42)return!1;w=o.input.charCodeAt(++o.position);let C=o.position;for(;w!==0&&!M(w)&&!Y(w);)w=o.input.charCodeAt(++o.position);o.position===C&&E(o,"name of an alias node must contain at least one character");let P=o.input.slice(C,o.position);return s.call(o.anchorMap,P)||E(o,'unidentified alias "'+P+'"'),o.result=o.anchorMap[P],Ce(o,!0,-1),!0}function Un(o,w,C,P){let D=Vt(o);return Me(o),Rt(o,w),o.tag=null,o.anchor=null,o.kind=null,o.result=null,yn(o,C,P)&&o.kind==="mapping"?(Ve(o),!0):(Vn(o),Rt(o,D),!1)}function st(o,w,C,P,D){let O,m,k=1,N=!1,x=!1,I=null,B,T,H;o.depth>=o.maxDepth&&E(o,"nesting exceeded maxDepth ("+o.maxDepth+")"),o.depth+=1,o.listener!==null&&o.listener("open",o),o.tag=null,o.anchor=null,o.kind=null,o.result=null;let G=O=m=u===C||f===C;if(P&&Ce(o,!0,-1)&&(N=!0,o.lineIndent>w?k=1:o.lineIndent===w?k=0:o.lineIndent<w&&(k=-1)),k===1)for(;;){let Z=o.input.charCodeAt(o.position),ee=Vt(o);if(N&&(Z===33&&o.tag!==null||Z===38&&o.anchor!==null)||!Gn(o)&&!bn(o))break;I===null&&(I=ee),Ce(o,!0,-1)?(N=!0,m=G,o.lineIndent>w?k=1:o.lineIndent===w?k=0:o.lineIndent<w&&(k=-1)):m=!1}if(m&&(m=N||D),k===1||u===C)if(c===C||p===C?T=w:T=w+1,H=o.position-o.lineStart,k===1)if(m&&(ot(o,H)||yn(o,H,T))||mn(o,T))x=!0;else{let Z=o.input.charCodeAt(o.position);I!==null&&G&&!m&&Z!==124&&Z!==62&&Un(o,I,I.position-I.lineStart,T)||O&&hn(o,T)||gn(o,T)||Gt(o,T)?x=!0:vn(o)?(x=!0,(o.tag!==null||o.anchor!==null)&&E(o,"alias node should not have any properties")):fn(o,T,c===C)&&(x=!0,o.tag===null&&(o.tag="?")),o.anchor!==null&&De(o,o.anchor,o.result)}else k===0&&(x=m&&ot(o,H));if(o.tag===null)o.anchor!==null&&De(o,o.anchor,o.result);else if(o.tag==="?"){o.result!==null&&o.kind!=="scalar"&&E(o,'unacceptable node kind for !<?> tag; it should be "scalar", not "'+o.kind+'"');for(let Z=0,ee=o.implicitTypes.length;Z<ee;Z+=1)if(B=o.implicitTypes[Z],B.resolve(o.result)){o.result=B.construct(o.result),o.tag=B.tag,o.anchor!==null&&De(o,o.anchor,o.result);break}}else if(o.tag!=="!"){if(s.call(o.typeMap[o.kind||"fallback"],o.tag))B=o.typeMap[o.kind||"fallback"][o.tag];else{B=null;let Z=o.typeMap.multi[o.kind||"fallback"];for(let ee=0,fe=Z.length;ee<fe;ee+=1)if(o.tag.slice(0,Z[ee].tag.length)===Z[ee].tag){B=Z[ee];break}}B||E(o,"unknown tag !<"+o.tag+">"),o.result!==null&&B.kind!==o.kind&&E(o,"unacceptable node kind for !<"+o.tag+'> tag; it should be "'+B.kind+'", not "'+o.kind+'"'),B.resolve(o.result,o.tag)?(o.result=B.construct(o.result,o.tag),o.anchor!==null&&De(o,o.anchor,o.result)):E(o,"cannot resolve a node with !<"+o.tag+"> explicit tag")}return o.listener!==null&&o.listener("close",o),o.depth-=1,o.tag!==null||o.anchor!==null||x}function Hn(o){let w=o.position,C=!1,P;for(o.version=null,o.checkLineBreaks=o.legacy,o.tagMap=Object.create(null),o.anchorMap=Object.create(null);(P=o.input.charCodeAt(o.position))!==0&&(Ce(o,!0,-1),P=o.input.charCodeAt(o.position),!(o.lineIndent>0||P!==37));){C=!0,P=o.input.charCodeAt(++o.position);let D=o.position;for(;P!==0&&!M(P);)P=o.input.charCodeAt(++o.position);let O=o.input.slice(D,o.position),m=[];for(O.length<1&&E(o,"directive name must not be less than one character in length");P!==0;){for(;F(P);)P=o.input.charCodeAt(++o.position);if(P===35){do P=o.input.charCodeAt(++o.position);while(P!==0&&!S(P));break}if(S(P))break;for(D=o.position;P!==0&&!M(P);)P=o.input.charCodeAt(++o.position);m.push(o.input.slice(D,o.position))}P!==0&&Et(o),s.call(un,O)?un[O](o,O,m):le(o,'unknown document directive "'+O+'"')}if(Ce(o,!0,-1),o.lineIndent===0&&o.input.charCodeAt(o.position)===45&&o.input.charCodeAt(o.position+1)===45&&o.input.charCodeAt(o.position+2)===45?(o.position+=3,Ce(o,!0,-1)):C&&E(o,"directives end mark is expected"),st(o,o.lineIndent-1,u,!1,!0),Ce(o,!0,-1),o.checkLineBreaks&&v.test(o.input.slice(w,o.position))&&le(o,"non-ASCII line breaks are interpreted as content"),o.documents.push(o.result),o.position===o.lineStart&&It(o)){o.input.charCodeAt(o.position)===46&&(o.position+=3,Ce(o,!0,-1));return}o.position<o.length-1&&E(o,"end of the stream or a document separator is expected")}function _n(o,w){o=String(o),w=w||{},o.length!==0&&(o.charCodeAt(o.length-1)!==10&&o.charCodeAt(o.length-1)!==13&&(o+=`
`),o.charCodeAt(0)===65279&&(o=o.slice(1)));let C=new ye(o,w),P=o.indexOf("\0");for(P!==-1&&(C.position=P,E(C,"null byte is not allowed in input")),C.input+="\0";C.input.charCodeAt(C.position)===32;)C.lineIndent+=1,C.position+=1;for(;C.position<C.length-1;)Hn(C);return C.documents}function wn(o,w,C){w!==null&&typeof w=="object"&&typeof C>"u"&&(C=w,w=null);let P=_n(o,C);if(typeof w!="function")return P;for(let D=0,O=P.length;D<O;D+=1)w(P[D])}function Wn(o,w){let C=_n(o,w);if(C.length!==0){if(C.length===1)return C[0];throw new r("expected a single document in the stream, but found more")}}e.exports.loadAll=wn,e.exports.load=Wn})),Os=Se(((t,e)=>{var n=Kt(),r=Jt(),i=er(),a=Object.prototype.toString,s=Object.prototype.hasOwnProperty,c=65279,p=9,f=10,u=13,l=32,d=33,g=34,h=35,v=37,b=38,_=39,y=42,$=44,S=45,F=58,M=61,Y=62,U=63,ie=64,ae=91,re=93,se=96,de=123,_e=124,pe=125,ye={};ye[0]="\\0",ye[7]="\\a",ye[8]="\\b",ye[9]="\\t",ye[10]="\\n",ye[11]="\\v",ye[12]="\\f",ye[13]="\\r",ye[27]="\\e",ye[34]='\\"',ye[92]="\\\\",ye[133]="\\N",ye[160]="\\_",ye[8232]="\\L",ye[8233]="\\P";var j=["y","Y","yes","Yes","YES","on","On","ON","n","N","no","No","NO","off","Off","OFF"],E=/^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;function le(m,k){if(k===null)return{};let N={},x=Object.keys(k);for(let I=0,B=x.length;I<B;I+=1){let T=x[I],H=String(k[T]);T.slice(0,2)==="!!"&&(T="tag:yaml.org,2002:"+T.slice(2));let G=m.compiledTypeMap.fallback[T];G&&s.call(G.styleAliases,H)&&(H=G.styleAliases[H]),N[T]=H}return N}function De(m){let k,N,x=m.toString(16).toUpperCase();if(m<=255)k="x",N=2;else if(m<=65535)k="u",N=4;else if(m<=4294967295)k="U",N=8;else throw new r("code point within a string may not be greater than 0xFFFFFFFF");return"\\"+k+n.repeat("0",N-x.length)+x}var Me=1,Ve=2;function Vn(m){this.schema=m.schema||i,this.indent=Math.max(1,m.indent||2),this.noArrayIndent=m.noArrayIndent||!1,this.skipInvalid=m.skipInvalid||!1,this.flowLevel=n.isNothing(m.flowLevel)?-1:m.flowLevel,this.styleMap=le(this.schema,m.styles||null),this.sortKeys=m.sortKeys||!1,this.lineWidth=m.lineWidth||80,this.noRefs=m.noRefs||!1,this.noCompatMode=m.noCompatMode||!1,this.condenseFlow=m.condenseFlow||!1,this.quotingType=m.quotingType==='"'?Ve:Me,this.forceQuotes=m.forceQuotes||!1,this.replacer=typeof m.replacer=="function"?m.replacer:null,this.implicitTypes=this.schema.compiledImplicit,this.explicitTypes=this.schema.compiledExplicit,this.tag=null,this.result="",this.duplicates=[],this.usedDuplicates=null}function Vt(m,k){let N=n.repeat(" ",k),x=0,I="",B=m.length;for(;x<B;){let T,H=m.indexOf(`
`,x);H===-1?(T=m.slice(x),x=B):(T=m.slice(x,H+1),x=H+1),T.length&&T!==`
`&&(I+=N),I+=T}return I}function Rt(m,k){return`
`+n.repeat(" ",m.indent*k)}function un(m,k){for(let N=0,x=m.implicitTypes.length;N<x;N+=1)if(m.implicitTypes[N].resolve(k))return!0;return!1}function je(m){return m===l||m===p}function ut(m){return m>=32&&m<=126||m>=161&&m<=55295&&m!==8232&&m!==8233||m>=57344&&m<=65533&&m!==c||m>=65536&&m<=1114111}function rt(m){return ut(m)&&m!==c&&m!==u&&m!==f}function Et(m,k,N){let x=rt(m),I=x&&!je(m);return(N?x:x&&m!==$&&m!==ae&&m!==re&&m!==de&&m!==pe)&&m!==h&&!(k===F&&!I)||rt(k)&&!je(k)&&m===h||k===F&&I}function Ce(m){return ut(m)&&m!==c&&!je(m)&&m!==S&&m!==U&&m!==F&&m!==$&&m!==ae&&m!==re&&m!==de&&m!==pe&&m!==h&&m!==b&&m!==y&&m!==d&&m!==_e&&m!==M&&m!==Y&&m!==_&&m!==g&&m!==v&&m!==ie&&m!==se}function It(m){return!je(m)&&m!==F}function it(m,k){let N=m.charCodeAt(k),x;return N>=55296&&N<=56319&&k+1<m.length&&(x=m.charCodeAt(k+1),x>=56320&&x<=57343)?(N-55296)*1024+x-56320+65536:N}function fn(m){return/^\n* /.test(m)}var gn=1,Gt=2,mn=3,hn=4,ot=5;function yn(m,k,N,x,I,B,T,H){let G,Z=0,ee=null,fe=!1,$e=!1,Vr=x!==-1,Ut=-1,Ht=Ce(it(m,0))&&It(it(m,m.length-1));if(k||T)for(G=0;G<m.length;Z>=65536?G+=2:G++){if(Z=it(m,G),!ut(Z))return ot;Ht=Ht&&Et(Z,ee,H),ee=Z}else{for(G=0;G<m.length;Z>=65536?G+=2:G++){if(Z=it(m,G),Z===f)fe=!0,Vr&&($e=$e||G-Ut-1>x&&m[Ut+1]!==" ",Ut=G);else if(!ut(Z))return ot;Ht=Ht&&Et(Z,ee,H),ee=Z}$e=$e||Vr&&G-Ut-1>x&&m[Ut+1]!==" "}return!fe&&!$e?Ht&&!T&&!I(m)?gn:B===Ve?ot:Gt:N>9&&fn(m)?ot:T?B===Ve?ot:Gt:$e?hn:mn}function Gn(m,k,N,x,I){m.dump=(function(){if(k.length===0)return m.quotingType===Ve?'""':"''";if(!m.noCompatMode&&(j.indexOf(k)!==-1||E.test(k)))return m.quotingType===Ve?'"'+k+'"':"'"+k+"'";let B=m.indent*Math.max(1,N),T=m.lineWidth===-1?-1:Math.max(Math.min(m.lineWidth,40),m.lineWidth-B),H=x||m.flowLevel>-1&&N>=m.flowLevel;function G(Z){return un(m,Z)}switch(yn(k,H,m.indent,T,G,m.quotingType,m.forceQuotes&&!x,I)){case gn:return k;case Gt:return"'"+k.replace(/'/g,"''")+"'";case mn:return"|"+bn(k,m.indent)+vn(Vt(k,B));case hn:return">"+bn(k,m.indent)+vn(Vt(Un(k,T),B));case ot:return'"'+Hn(k,T)+'"';default:throw new r("impossible error: invalid scalar style")}})()}function bn(m,k){let N=fn(m)?String(k):"",x=m[m.length-1]===`
`;return N+(x&&(m[m.length-2]===`
`||m===`
`)?"+":x?"":"-")+`
`}function vn(m){return m[m.length-1]===`
`?m.slice(0,-1):m}function Un(m,k){let N=/(\n+)([^\n]*)/g,x=(function(){let H=m.indexOf(`
`);return H=H!==-1?H:m.length,N.lastIndex=H,st(m.slice(0,H),k)})(),I=m[0]===`
`||m[0]===" ",B,T;for(;T=N.exec(m);){let H=T[1],G=T[2];B=G[0]===" ",x+=H+(!I&&!B&&G!==""?`
`:"")+st(G,k),I=B}return x}function st(m,k){if(m===""||m[0]===" ")return m;let N=/ [^ ]/g,x,I=0,B,T=0,H=0,G="";for(;x=N.exec(m);)H=x.index,H-I>k&&(B=T>I?T:H,G+=`
`+m.slice(I,B),I=B+1),T=H;return G+=`
`,m.length-I>k&&T>I?G+=m.slice(I,T)+`
`+m.slice(T+1):G+=m.slice(I),G.slice(1)}function Hn(m){let k="",N=0;for(let x=0;x<m.length;N>=65536?x+=2:x++){N=it(m,x);let I=ye[N];!I&&ut(N)?(k+=m[x],N>=65536&&(k+=m[x+1])):k+=I||De(N)}return k}function _n(m,k,N){let x="",I=m.tag;for(let B=0,T=N.length;B<T;B+=1){let H=N[B];m.replacer&&(H=m.replacer.call(N,String(B),H)),(C(m,k,H,!1,!1)||typeof H>"u"&&C(m,k,null,!1,!1))&&(x!==""&&(x+=","+(m.condenseFlow?"":" ")),x+=m.dump)}m.tag=I,m.dump="["+x+"]"}function wn(m,k,N,x){let I="",B=m.tag;for(let T=0,H=N.length;T<H;T+=1){let G=N[T];m.replacer&&(G=m.replacer.call(N,String(T),G)),(C(m,k+1,G,!0,!0,!1,!0)||typeof G>"u"&&C(m,k+1,null,!0,!0,!1,!0))&&((!x||I!=="")&&(I+=Rt(m,k)),m.dump&&f===m.dump.charCodeAt(0)?I+="-":I+="- ",I+=m.dump)}m.tag=B,m.dump=I||"[]"}function Wn(m,k,N){let x="",I=m.tag,B=Object.keys(N);for(let T=0,H=B.length;T<H;T+=1){let G="";x!==""&&(G+=", "),m.condenseFlow&&(G+='"');let Z=B[T],ee=N[Z];m.replacer&&(ee=m.replacer.call(N,Z,ee)),C(m,k,Z,!1,!1)&&(m.dump.length>1024&&(G+="? "),G+=m.dump+(m.condenseFlow?'"':"")+":"+(m.condenseFlow?"":" "),C(m,k,ee,!1,!1)&&(G+=m.dump,x+=G))}m.tag=I,m.dump="{"+x+"}"}function o(m,k,N,x){let I="",B=m.tag,T=Object.keys(N);if(m.sortKeys===!0)T.sort();else if(typeof m.sortKeys=="function")T.sort(m.sortKeys);else if(m.sortKeys)throw new r("sortKeys must be a boolean or a function");for(let H=0,G=T.length;H<G;H+=1){let Z="";(!x||I!=="")&&(Z+=Rt(m,k));let ee=T[H],fe=N[ee];if(m.replacer&&(fe=m.replacer.call(N,ee,fe)),!C(m,k+1,ee,!0,!0,!0))continue;let $e=m.tag!==null&&m.tag!=="?"||m.dump&&m.dump.length>1024;$e&&(m.dump&&f===m.dump.charCodeAt(0)?Z+="?":Z+="? "),Z+=m.dump,$e&&(Z+=Rt(m,k)),C(m,k+1,fe,!0,$e)&&(m.dump&&f===m.dump.charCodeAt(0)?Z+=":":Z+=": ",Z+=m.dump,I+=Z)}m.tag=B,m.dump=I||"{}"}function w(m,k,N){let x=N?m.explicitTypes:m.implicitTypes;for(let I=0,B=x.length;I<B;I+=1){let T=x[I];if((T.instanceOf||T.predicate)&&(!T.instanceOf||typeof k=="object"&&k instanceof T.instanceOf)&&(!T.predicate||T.predicate(k))){if(N?T.multi&&T.representName?m.tag=T.representName(k):m.tag=T.tag:m.tag="?",T.represent){let H=m.styleMap[T.tag]||T.defaultStyle,G;if(a.call(T.represent)==="[object Function]")G=T.represent(k,H);else if(s.call(T.represent,H))G=T.represent[H](k,H);else throw new r("!<"+T.tag+'> tag resolver accepts not "'+H+'" style');m.dump=G}return!0}}return!1}function C(m,k,N,x,I,B,T){m.tag=null,m.dump=N,w(m,N,!1)||w(m,N,!0);let H=a.call(m.dump),G=x;x&&(x=m.flowLevel<0||m.flowLevel>k);let Z=H==="[object Object]"||H==="[object Array]",ee,fe;if(Z&&(ee=m.duplicates.indexOf(N),fe=ee!==-1),(m.tag!==null&&m.tag!=="?"||fe||m.indent!==2&&k>0)&&(I=!1),fe&&m.usedDuplicates[ee])m.dump="*ref_"+ee;else{if(Z&&fe&&!m.usedDuplicates[ee]&&(m.usedDuplicates[ee]=!0),H==="[object Object]")x&&Object.keys(m.dump).length!==0?(o(m,k,m.dump,I),fe&&(m.dump="&ref_"+ee+m.dump)):(Wn(m,k,m.dump),fe&&(m.dump="&ref_"+ee+" "+m.dump));else if(H==="[object Array]")x&&m.dump.length!==0?(m.noArrayIndent&&!T&&k>0?wn(m,k-1,m.dump,I):wn(m,k,m.dump,I),fe&&(m.dump="&ref_"+ee+m.dump)):(_n(m,k,m.dump),fe&&(m.dump="&ref_"+ee+" "+m.dump));else if(H==="[object String]")m.tag!=="?"&&Gn(m,m.dump,k,B,G);else{if(H==="[object Undefined]")return!1;if(m.skipInvalid)return!1;throw new r("unacceptable kind of an object to dump "+H)}if(m.tag!==null&&m.tag!=="?"){let $e=encodeURI(m.tag[0]==="!"?m.tag.slice(1):m.tag).replace(/!/g,"%21");m.tag[0]==="!"?$e="!"+$e:$e.slice(0,18)==="tag:yaml.org,2002:"?$e="!!"+$e.slice(18):$e="!<"+$e+">",m.dump=$e+" "+m.dump}}return!0}function P(m,k){let N=[],x=[];D(m,N,x);let I=x.length;for(let B=0;B<I;B+=1)k.duplicates.push(N[x[B]]);k.usedDuplicates=new Array(I)}function D(m,k,N){if(m!==null&&typeof m=="object"){let x=k.indexOf(m);if(x!==-1)N.indexOf(x)===-1&&N.push(x);else if(k.push(m),Array.isArray(m))for(let I=0,B=m.length;I<B;I+=1)D(m[I],k,N);else{let I=Object.keys(m);for(let B=0,T=I.length;B<T;B+=1)D(m[I[B]],k,N)}}}function O(m,k){k=k||{};let N=new Vn(k);N.noRefs||P(m,N);let x=m;return N.replacer&&(x=N.replacer.call({"":x},"",x)),C(N,0,x,!0,!0)?N.dump+`
`:""}e.exports.dump=O})),Ri=Fs(Se(((t,e)=>{var n=Ns(),r=Os();function i(a,s){return function(){throw new Error("Function yaml."+a+" is removed in js-yaml 4. Use yaml."+s+" instead, which is now safe by default.")}}e.exports.Type=Fe(),e.exports.Schema=ui(),e.exports.FAILSAFE_SCHEMA=hi(),e.exports.JSON_SCHEMA=wi(),e.exports.CORE_SCHEMA=ki(),e.exports.DEFAULT_SCHEMA=er(),e.exports.load=n.load,e.exports.loadAll=n.loadAll,e.exports.dump=r.dump,e.exports.YAMLException=Jt(),e.exports.types={binary:$i(),float:_i(),map:mi(),null:yi(),pairs:Ci(),set:xi(),timestamp:Si(),bool:bi(),int:vi(),merge:Ai(),omap:Di(),seq:gi(),str:fi()},e.exports.safeLoad=i("safeLoad","load"),e.exports.safeLoadAll=i("safeLoadAll","loadAll"),e.exports.safeDump=i("safeDump","dump")}))(),1),{Type:Ml,Schema:jl,FAILSAFE_SCHEMA:ql,JSON_SCHEMA:zl,CORE_SCHEMA:Yl,DEFAULT_SCHEMA:Vl,load:$n,loadAll:Gl,dump:Ei,YAMLException:Ul,types:Hl,safeLoad:Wl,safeLoadAll:Zl,safeDump:Kl}=Ri.default,Jl=Ri.default;function oe(t){if(!t||!t.trim())throw new A("INVALID_YAML","empty yaml document");try{let e=$n(t);if(!e||typeof e!="object"||Array.isArray(e))throw new A("INVALID_YAML","yaml root must be an object");return e}catch(e){throw new A("INVALID_YAML",e?.message||String(e))}}function ve(t){try{return Ei(t,{indent:2,skipInvalid:!0})}catch(e){throw new A("INVALID_YAML",e?.message||String(e))}}var nr=/^[a-z0-9-]+$/,Ii=new Set(["api","mq","cron","rpc","cache","search","other"]),Ms=new Set(["insert","update","delete","upsert","read"]),js=new Set(["high","medium","low"]),qs=new Set(["fact","inference","unknown"]),Pi=new Set(["invariant","constraint","authorization","sla","compensation"]);function Li(t,e){if(!t||typeof t!="object"||Array.isArray(t))throw new A("INVALID_ARTIFACT",`${e} must be an object`);return t}function tr(t,e){if(typeof t!="string"||!t.trim())throw new A("INVALID_ARTIFACT",`${e} must be a non-empty string`);return t.trim()}function ke(t){return typeof t=="string"&&t.trim()?t.trim():void 0}function Dn(t,e){if(t===void 0)return[];if(!Array.isArray(t))throw new A("INVALID_ARTIFACT",`${e} must be an array`);return t.map((n,r)=>{let i=Li(n,`${e}[${r}]`),a=tr(i.file,`${e}[${r}].file`),s=typeof i.line=="number"?i.line:void 0,c=ke(i.symbol_handle),p=ke(i.repo);return{file:a,line:s,symbol_handle:c,repo:p}})}function Lt(t,e="confidence"){let n=Li(t,e),r=tr(n.level,`${e}.level`),i=tr(n.kind,`${e}.kind`);if(!js.has(r))throw new A("INVALID_ARTIFACT",`${e}.level must be high|medium|low`);if(!qs.has(i))throw new A("INVALID_ARTIFACT",`${e}.kind must be fact|inference|unknown`);let a=ke(n.evidence_type);return{level:r,kind:i,evidence_type:a}}function Cn(t,e){let n=[],{confidence:r,sources:i=[],derived_from:a=[],reason:s}=t;return r?(r.kind==="fact"?i.length||n.push(`${e}: kind=fact requires sources[]`):r.kind==="inference"?a.length||n.push(`${e}: kind=inference requires derived_from[]`):r.kind==="unknown"&&(s||n.push(`${e}: kind=unknown requires reason`)),n):(n.push(`${e}: missing confidence block`),n)}function zs(t){let e=[],n=ke(t.id);n?nr.test(n)||e.push("behavior: id must match ^[a-z0-9-]+$"):e.push("behavior: missing id");let r=t.entry;if(!r||typeof r!="object"||Array.isArray(r))e.push("behavior: missing entry object");else{let a=ke(r.type);a?Ii.has(a)||e.push(`behavior: entry.type must be one of ${[...Ii].join("|")}`):e.push("behavior: entry.type is required")}if(Array.isArray(t.writes))for(let[i,a]of t.writes.entries()){if(!a||typeof a!="object"||Array.isArray(a)){e.push(`behavior: writes[${i}] must be an object`);continue}let c=ke(a.operation);c&&!Ms.has(c)&&e.push(`behavior: writes[${i}].operation invalid`)}if(t.events!==void 0&&!Array.isArray(t.events)&&e.push("behavior: events must be an array"),t.calls!==void 0&&!Array.isArray(t.calls))e.push("behavior: calls must be an array");else if(Array.isArray(t.calls)){let i=new Set(["http","grpc","mq","event","rpc","other"]);for(let[a,s]of t.calls.entries()){if(typeof s=="string")continue;if(!s||typeof s!="object"||Array.isArray(s)){e.push(`behavior: calls[${a}] must be a string or an object`);continue}let c=s;ke(c.target)||e.push(`behavior: calls[${a}].target is required for structured calls`);let p=ke(c.protocol);if(p&&!i.has(p)&&e.push(`behavior: calls[${a}].protocol must be one of ${[...i].join("|")}`),c.evidence!==void 0)if(!c.evidence||typeof c.evidence!="object"||Array.isArray(c.evidence))e.push(`behavior: calls[${a}].evidence must be a single SourceRef object`);else{let f=c.evidence;ke(f.file)||e.push(`behavior: calls[${a}].evidence.file is required`)}}}t.risks!==void 0&&!Array.isArray(t.risks)&&e.push("behavior: risks must be an array");try{let i=Lt(t.confidence),a=Dn(t.sources,"sources"),s=Array.isArray(t.derived_from)?t.derived_from.map(p=>String(p)):[],c=ke(t.reason);e.push(...Cn({confidence:i,sources:a,derived_from:s,reason:c,investigation_hint:ke(t.investigation_hint)},`behavior:${n||"?"}`))}catch(i){i instanceof A?e.push(i.message):e.push("behavior: invalid confidence block")}return e}function Ys(t){let e=[],n=ke(t.entity);if(n||e.push("state-machine: missing entity"),(!Array.isArray(t.states)||t.states.length===0)&&e.push("state-machine: states must be a non-empty array"),!Array.isArray(t.transitions))e.push("state-machine: transitions must be an array");else for(let[r,i]of t.transitions.entries()){if(!i||typeof i!="object"||Array.isArray(i)){e.push(`state-machine: transitions[${r}] must be an object`);continue}let a=i;!ke(a.trigger)&&a.trigger!==null&&e.push(`state-machine: transitions[${r}].trigger is required`),(a.to===void 0||a.to==="")&&e.push(`state-machine: transitions[${r}].to is required`)}try{let r=Lt(t.confidence),i=Dn(t.sources,"sources"),a=Array.isArray(t.derived_from)?t.derived_from.map(c=>String(c)):[],s=ke(t.reason);e.push(...Cn({confidence:r,sources:i,derived_from:a,reason:s,investigation_hint:ke(t.investigation_hint)},`state-machine:${n||"?"}`))}catch(r){r instanceof A?e.push(r.message):e.push("state-machine: invalid confidence block")}return e}function Vs(t){let e=[],n=ke(t.domain);if(n?nr.test(n.toLowerCase().replace(/[^a-z0-9-]/g,"-"))||e.push("domain: name must match ID pattern"):e.push("domain: missing domain name"),t.description!==void 0&&typeof t.description!="string"&&e.push("domain: description must be a string"),Array.isArray(t.modules))for(let[r,i]of t.modules.entries()){if(!i||typeof i!="object"||Array.isArray(i)){e.push(`domain: modules[${r}] must be an object`);continue}ke(i.name)||e.push(`domain: modules[${r}].name is required`)}try{let r=Lt(t.confidence||{level:"medium",kind:"inference"}),i=Dn(t.sources,"sources"),a=Array.isArray(t.derived_from)?t.derived_from.map(c=>String(c)):[],s=ke(t.reason);a.length||e.push(`domain:${n||"?"}: domain artifacts must specify derived_from referring to behavior IDs`),e.push(...Cn({confidence:r,sources:i,derived_from:a,reason:s,investigation_hint:ke(t.investigation_hint)},`domain:${n||"?"}`))}catch(r){r instanceof A?e.push(r.message):e.push("domain: invalid confidence block")}return e}function Gs(t){let e=[];if(ke(t.product)||e.push("capability-map: missing product name"),!Array.isArray(t.capabilities)||t.capabilities.length===0)e.push("capability-map: capabilities must be a non-empty array");else for(let[r,i]of t.capabilities.entries()){if(!i||typeof i!="object"||Array.isArray(i)){e.push(`capability-map: capabilities[${r}] must be an object`);continue}let a=i;ke(a.id)||e.push(`capability-map: capabilities[${r}].id is required`),ke(a.name)||e.push(`capability-map: capabilities[${r}].name is required`),a.domains!==void 0&&!Array.isArray(a.domains)&&e.push(`capability-map: capabilities[${r}].domains must be an array`)}return e}function Us(t){let e=[],n=ke(t.id);n?nr.test(n)||e.push("business-rule: id must match ^[a-z0-9-]+$"):e.push("business-rule: missing id");let r=ke(t.kind);r?Pi.has(r)||e.push(`business-rule: kind must be one of ${[...Pi].join("|")}`):e.push("business-rule: missing kind"),t.applies_to!==void 0&&!Array.isArray(t.applies_to)&&e.push("business-rule: applies_to must be an array"),t.expr!==void 0&&typeof t.expr!="string"&&e.push("business-rule: expr must be a string"),t.description!==void 0&&typeof t.description!="string"&&e.push("business-rule: description must be a string");try{let i=Lt(t.confidence),a=Dn(t.sources,"sources"),s=Array.isArray(t.derived_from)?t.derived_from.map(p=>String(p)):[],c=ke(t.reason);e.push(...Cn({confidence:i,sources:a,derived_from:s,reason:c,investigation_hint:ke(t.investigation_hint)},`business-rule:${n||"?"}`))}catch(i){i instanceof A?e.push(i.message):e.push("business-rule: invalid confidence block")}return e}function Ye(t,e){return t==="behavior"?zs(e):t==="state-machine"?Ys(e):t==="domain"?Vs(e):t==="capability-map"?Gs(e):t==="business-rule"?Us(e):[`unknown artifact type: ${t}`]}function Ti(t,e){let n=Ye(t,e);if(n.length)throw new A("INVALID_ARTIFACT",n.join("; "))}function be(t){let e=V(t);return{...e,behaviorDir:Je(e.docsDir,"as-is","behavior"),stateMachineDir:Je(e.docsDir,"as-is","state-machines"),domainDir:Je(e.docsDir,"as-is","domains"),capabilityDir:Je(e.docsDir,"as-is","capabilities"),profilesDir:Je(e.docsDir,"as-is","profiles"),entriesDir:Je(e.docsDir,"as-is","entries"),businessRulesDir:Je(e.docsDir,"as-is","business-rules"),cognitiveDir:Je(e.dapeiDir,"cognitive"),indexFile:Je(e.dapeiDir,"cognitive","index.yaml"),candidatesFile:Je(e.docsDir,"as-is","behavior","_candidates.yaml")}}function mt(t,e){let n=typeof e.repo=="string"&&e.repo.trim()?e.repo.trim():void 0;if(t==="behavior"){let i=String(e.id||"unknown");return n?`docs/as-is/behavior/${n}/${i}.yaml`:`docs/as-is/behavior/${i}.yaml`}if(t==="domain"){let i=String(e.domain||"unknown").toLowerCase().replace(/[^a-z0-9-]+/g,"-");return n?`docs/as-is/domains/${n}/${i}.yaml`:`docs/as-is/domains/${i}.yaml`}if(t==="capability-map")return"docs/as-is/capabilities/product-map.yaml";if(t==="business-rule"){let i=String(e.id||"unknown").toLowerCase().replace(/[^a-z0-9-]+/g,"-");return n?`docs/as-is/business-rules/${n}/${i}.yaml`:`docs/as-is/business-rules/${i}.yaml`}let r=String(e.entity||"unknown").toLowerCase().replace(/[^a-z0-9-]+/g,"-");return n?`docs/as-is/state-machines/${n}/${r}.yaml`:`docs/as-is/state-machines/${r}.yaml`}function ce(t){let{indexFile:e}=be(t);if(!Hs(e))return{version:"1.0",updated_at:new Date(0).toISOString(),behaviors:[],state_machines:[],domains:[],capability_maps:[],business_rules:[],unknowns:[],repo_snapshots:[],stale_assets:[]};let n=oe(L(e));return{version:String(n.version||"1.0"),updated_at:String(n.updated_at||new Date(0).toISOString()),behaviors:Array.isArray(n.behaviors)?n.behaviors:[],state_machines:Array.isArray(n.state_machines)?n.state_machines:[],domains:Array.isArray(n.domains)?n.domains:[],capability_maps:Array.isArray(n.capability_maps)?n.capability_maps:[],business_rules:Array.isArray(n.business_rules)?n.business_rules:[],unknowns:Array.isArray(n.unknowns)?n.unknowns:[],repo_snapshots:Array.isArray(n.repo_snapshots)?n.repo_snapshots:[],stale_assets:Array.isArray(n.stale_assets)?n.stale_assets:[]}}function Ne(t,e){let{indexFile:n}=be(t);e.updated_at=new Date().toISOString(),R(n,ve(e))}function ct(t,e,n,r){let i=e==="capability-map"?{level:"unknown",kind:"unknown"}:Lt(r.confidence),a=r.repo?String(r.repo):void 0,s=typeof r.created_by_feature=="string"&&r.created_by_feature.trim()?r.created_by_feature.trim():void 0,c=typeof r.updated_by_feature=="string"&&r.updated_by_feature.trim()?r.updated_by_feature.trim():void 0,p=typeof r.created_at=="string"&&r.created_at.trim()?r.created_at.trim():void 0,f=typeof r.updated_at=="string"&&r.updated_at.trim()?r.updated_at.trim():void 0;if(e==="behavior"){let u=String(r.id);t.behaviors=t.behaviors.filter(v=>!(v.id===u&&(v.repo||"")===(a||"")));let l;if(Array.isArray(r.calls)){let v=new Set;for(let b of r.calls)if(b&&typeof b=="object"&&!Array.isArray(b)){let _=b,y=typeof _.target_repo=="string"?_.target_repo.trim():"";y&&v.add(y)}v.size>0&&(l=[...v].sort())}let d;if(Array.isArray(r.events)){let v=r.events.map(b=>typeof b=="string"?b.trim():"").filter(b=>b.length>0);v.length>0&&(d=[...new Set(v)].sort())}let g;if(Array.isArray(r.writes)){let v=r.writes.map(b=>{if(typeof b=="string")return b.trim();if(b&&typeof b=="object"){let _=b,y=typeof _.table=="string"?_.table.trim():"",$=typeof _.target=="string"?_.target.trim():"";return y||$}return""}).filter(b=>b.length>0);v.length>0&&(g=[...new Set(v)].sort())}let h={id:u,path:n,repo:a,kind:i.kind,level:i.level};l&&(h.target_repos=l),d&&(h.events=d),g&&(h.writes=g),s&&(h.created_by_feature=s),c&&(h.updated_by_feature=c),p&&(h.created_at=p),f&&(h.updated_at=f),t.behaviors.push(h),i.kind==="unknown"&&r.reason&&(t.unknowns=t.unknowns.filter(v=>v.id!==u),t.unknowns.push({id:u,artifact_type:"behavior",reason:String(r.reason),investigation_hint:r.investigation_hint?String(r.investigation_hint):void 0}))}else if(e==="state-machine"){let u=String(r.entity);t.state_machines=t.state_machines.filter(d=>!(d.entity===u&&(d.repo||"")===(a||"")));let l={entity:u,path:n,repo:a,kind:i.kind,level:i.level};s&&(l.created_by_feature=s),c&&(l.updated_by_feature=c),p&&(l.created_at=p),f&&(l.updated_at=f),t.state_machines.push(l),i.kind==="unknown"&&r.reason&&(t.unknowns=t.unknowns.filter(d=>d.id!==u),t.unknowns.push({id:u,artifact_type:"state-machine",reason:String(r.reason),investigation_hint:r.investigation_hint?String(r.investigation_hint):void 0}))}else if(e==="domain"){let u=String(r.domain);t.domains=t.domains.filter(g=>!(g.domain===u&&(g.repo||"")===(a||"")));let l=Array.isArray(r.derived_from)?r.derived_from.map(g=>String(g)):[],d={domain:u,path:n,repo:a,derived_from:l};s&&(d.created_by_feature=s),c&&(d.updated_by_feature=c),p&&(d.created_at=p),f&&(d.updated_at=f),t.domains.push(d)}else if(e==="capability-map"){let u=String(r.product),l=Array.isArray(r.capabilities)?r.capabilities.length:0;t.capability_maps=t.capability_maps.filter(g=>g.product!==u);let d={product:u,path:n,capability_count:l};s&&(d.created_by_feature=s),c&&(d.updated_by_feature=c),p&&(d.created_at=p),f&&(d.updated_at=f),t.capability_maps.push(d)}else if(e==="business-rule"){let u=String(r.id),l=Ws(r.kind)||"unknown";t.business_rules=t.business_rules.filter(g=>!(g.id===u&&(g.repo||"")===(a||"")));let d={id:u,kind:l,path:n,repo:a,evidence_kind:i.kind,evidence_level:i.level};s&&(d.created_by_feature=s),c&&(d.updated_by_feature=c),p&&(d.created_at=p),f&&(d.updated_at=f),t.business_rules.push(d)}return t}function Ws(t){return typeof t=="string"&&t.trim()?t.trim():void 0}function Fi(t,e){return t.repo_snapshots.find(n=>n.repo===e)}function Bi(t,e){return t.repo_snapshots=t.repo_snapshots.filter(n=>n.repo!==e.repo),t.repo_snapshots.push(e),t}function Ni(t,e){return t.stale_assets=t.stale_assets.filter(n=>!(n.id===e.id&&(n.repo||"")===(e.repo||""))),t.stale_assets.push(e),t}function Oi(t,e){return t.stale_assets=t.stale_assets.filter(n=>n.id!==e),t}function Qs(t){try{let e=$n(t);if(e&&typeof e=="object"&&"rules"in e&&Array.isArray(e.rules))return e.rules}catch{}return[]}var Mi={"file-required":(t,e)=>{let n=Array.isArray(t.files)?t.files.map(r=>String(r)):[];for(let r of n)if(!Ge(Be(e.rootDir,r.replace("<feature>",e.feature))))return{failed:!0};return{failed:!1}},"folder-name-regex":(t,e)=>{let n=typeof t.regex=="string"?t.regex:"";return{failed:!!n&&!new RegExp(n).test(e.feature)}},"path-deny":(t,e)=>{let n=Array.isArray(t.patterns)?t.patterns.map(r=>String(r)):[];for(let r of n){let i=new RegExp("^"+r.replace(/\*\*\//g,".*").replace(/\*\*/g,".*").replace(/\*/g,"[^/]*")+"$");if(e.filesChanged.some(a=>i.test(a)))return{failed:!0}}return{failed:!1}},"evidence-required":(t,e)=>{let n=typeof t.evidence_file=="string"?t.evidence_file.replace("<feature>",e.feature):"",r=Be(e.rootDir,n);if(!Ge(r))return{failed:!0};let i=typeof t.condition=="string"?t.condition:"";return i&&!xn(r,"utf8").includes(i)?{failed:!0}:{failed:!1}},"cognitive-artifact-required":(t,e)=>{let n=Number(t.min_facts||1),r=Be(e.rootDir,".dapei","cognitive","index.yaml");if(!Ge(r))return{failed:!0};try{return{failed:ce(e.rootDir).behaviors.filter(s=>s.kind==="fact").length<n}}catch{return{failed:!0}}}},bp=Object.keys(Mi);function Xs(t,e){if(!Ge(Be(t,".git")))return[];let n=["status","--porcelain"];e?.ignoreSubmodules&&n.push("--ignore-submodules=all");let r=ne("git",n,t);return r?r.split(`
`).map(i=>i.trim()).filter(Boolean).map(i=>i.split(/\s+/,2)[1]).filter(Boolean):[]}function ea(t){let e=Be(t,".dapei","workspace.yaml"),n="report",r="ignore";if(!Ge(e))return{guardrailMode:n,submodulePointerPolicy:r};let i=xn(e,"utf8"),a=i.match(/guardrail_mode:\s*["']?([a-z]+)["']?/);a&&(n=a[1]);let s=i.match(/submodule_pointer_policy:\s*["']?([a-z]+)["']?/);return s&&(s[1]==="ignore"||s[1]==="commit")&&(r=s[1]),{guardrailMode:n,submodulePointerPolicy:r}}function ta(t,e){let n=[],r=[],i="PASS",a=Be(t,"features",e,"feature.yaml");if(!Ge(a))return{findings:n,status:i,failedChecks:r};let s=Ze(xn(a,"utf8"));for(let c of s){let p=Be(t,"repos",c);if(!Ge(Be(p,".git"))){n.push(`BASE-001 base repo missing: repos/${c} (Severity: high)`),r.push("BASE-001"),i="FAIL";continue}ne("git",["-C",p,"status","--porcelain"],t)&&(n.push(`BASE-002 base repo dirty (\u7981\u6B62\u5728\u57FA\u5EA7\u4ED3\u5E93\u5F00\u53D1): repos/${c} (Severity: high)`),r.push("BASE-002"),i="FAIL");let u=Ke(p),l=ne("git",["-C",p,"rev-parse","--abbrev-ref","HEAD"],t)||"HEAD";l!==u&&(n.push(`BASE-003 base repo not on default branch (expected '${u}', got '${l}'): repos/${c} (Severity: high)`),r.push("BASE-003"),i="FAIL")}return{findings:n,status:i,failedChecks:r}}function Qt(t,e){let n=Be(t,"features",e);if(!Ge(n))throw new Error(`feature not found: ${e}`);let{guardrailMode:r,submodulePointerPolicy:i}=ea(t),a=i==="ignore",s=[],c=[],p="PASS",f=Xs(t,{ignoreSubmodules:a}),u=ta(t,e);s.push(...u.findings),c.push(...u.failedChecks),u.status==="FAIL"&&(p="FAIL"),Ge(Be(n,"feature.yaml"))||(s.push("LAYER-002 missing feature.yaml (Severity: high)"),c.push("LAYER-002"),p="FAIL");let l=Be(t,".dapei","rules"),d=Ge(l)?Zs(l).filter(b=>b.endsWith(".yaml")):[];for(let b of d){let _=Qs(xn(Be(l,b),"utf8"));for(let y of _){let $=y.id||"UNKNOWN",S=y.title||"",F=y.severity||"medium",M=y.message||"failed rule check",Y=y.check||{},U=typeof Y.type=="string"?Y.type:"",ie=null,ae=Mi[U],re;ae?re=ae(Y,{rootDir:t,feature:e,filesChanged:f}).failed:(ie=U||"(missing)",re=!0),re&&(s.push(`${$} ${S} - ${M} (Severity: ${F})`),c.push($),ie!==null&&s.push(`${$}: unsupported check.type '${ie}' - rule treated as failing`),["high","blocker"].includes(F)?p="FAIL":p!=="FAIL"&&(p="WARN"))}}let g=Be(n,"reports","guardrail-report.md");Js(Be(n,"reports"),{recursive:!0});let h=new Date().toISOString(),v=["# Guardrail Report","",`- Feature: ${e}`,`- Mode: ${r}`,`- Status: ${p}`,`- Generated At: ${h}`,"","## Findings",...s.length?s.map(b=>`- ${b}`):["- none"],""].join(`
`);return Ks(g,v,"utf8"),{status:p,findings:s,failedChecks:c,mode:r,reportPath:g}}function Xt(t,e){if(!Ge(Be(t,"features",e)))return[];let n=Qt(t,e),r=n.findings.length>0?`${n.findings.length} finding(s)`:"no findings",i=`guardrail: ${n.status} (mode=${n.mode}, ${r})`;if(n.status==="FAIL"&&n.mode!=="report"){let a=n.failedChecks.length>0?n.failedChecks.join(", "):"(unattributed)";throw new A("GUARDRAIL_FAILED",`guardrail FAIL (guardrail_mode=${n.mode}) blocks stage advance; failing rules: ${a}`)}return[i]}function Yi(t,e,n,r){let i=q(t,"features",e);if(!me(q(i,"feature.yaml")))throw new A("FEATURE_MISSING",`feature.yaml not found for ${e}`);let a=q(t,".dapei","workflows","feature-lifecycle.yaml");if(!me(a))throw new A("WORKFLOW_MISSING",`workflow file not found: ${a}`);let s=L(a);if(!Zt(s).includes(n))throw new A("INVALID_STAGE",`stage '${n}' not declared in workflow`);return kn(s,n,r),Sn(s,i,n),{featureDir:i,marker:q(i,"reports",`stage-${n}.completed`)}}function ia(t,e){return!!ne("git",["-C",t,"status","--porcelain"],e)}function oa(t,e){return ne("git",["-C",t,"rev-parse","--abbrev-ref","HEAD"],e)||"HEAD"}function sa(t,e,n){let r=ne("git",["-C",t,"worktree","list","--porcelain"],e);if(!r)return"";let i=r.split(`
`),a="";for(let s of i){let c=s.match(/^worktree\s+(.+)$/);if(c){a=c[1];continue}let p=s.match(/^branch\s+(.+)$/);if(p&&p[1]===`refs/heads/${n}`)return a}return""}var Vi={id:"feature.create",version:"1.0.0",inputSchema:{required:["name","repos"],properties:{name:{type:"string",minLength:1},repos:{type:"string",minLength:1},objective:{type:"string"}},additionalProperties:!1},async execute(t,e){X(e,["name","repos"]);let n=String(e.name),r=String(e.repos),i=String(e.objective||"TBD");if(!/^[a-z0-9-]+$/.test(n))throw new A("INVALID_FEATURE","feature name must match ^[a-z0-9-]+$");let a=V(t.rootDir),s=q(a.featuresDir,n);if(me(s))throw new A("FEATURE_EXISTS",`feature already exists: ${n}`);J(q(s,"repos"));let c=r.split(",").map(g=>g.trim()).filter(Boolean);for(let g of c){let h=q(a.reposDir,g);if(!me(q(h,".git")))throw new A("REPO_MISSING",`repo '${g}' not found in repos. run 'dapei repos add ${g} <url>' first`);let v=Ke(h),b=`feature/${n}`;if(ia(h,a.rootDir))throw new A("REPO_DIRTY",`repos/${g} is dirty. base repos are read-only; discard changes before creating feature worktree.`);oa(h,a.rootDir)!==v&&Le("git",["-C",h,"checkout",v],a.rootDir),Le("git",["-C",h,"fetch","origin"],a.rootDir),Le("git",["-C",h,"merge","--ff-only",`origin/${v}`],a.rootDir);let y=ne("git",["-C",h,"rev-parse","--verify",`origin/${b}`],a.rootDir);ne("git",["-C",h,"show-ref",`refs/heads/${b}`],a.rootDir)||(y?Le("git",["-C",h,"branch","--track",b,`origin/${b}`],a.rootDir):Le("git",["-C",h,"branch",b],a.rootDir));let S=sa(h,a.rootDir,b);if(S)throw new A("WORKTREE_CONFLICT",`branch '${b}' is already checked out by worktree: ${S}`);let F=q(s,"repos",g);if(me(F))throw new A("WORKTREE_EXISTS",`worktree path already exists: features/${n}/repos/${g}`);Le("git",["-C",h,"worktree","add",F,b],a.rootDir)}["docs","context","memory","tests/regression","reports","tasks","artifacts"].forEach(g=>J(q(s,g))),R(q(s,"context","business-context.md"),`# Business Context
`),R(q(s,"context","architecture-context.md"),`# Architecture Context
`),R(q(s,"context","repo-context.md"),`# Repo Context

See also: [related-cognitive-context.md](related-cognitive-context.md) for matching behavior models.
`),R(q(s,"context","feature-context.md"),`# Feature Context

- Feature: ${n}
- Objective: ${i}
- Repos: ${c.join(", ")}
`),R(q(s,"context","constraints.md"),`# Constraints

- Keep changes scoped to this feature workspace.
`),R(q(s,"reports","feature-progress.md"),`# Feature Progress

- Status: initialized
`),R(q(s,"reports","daily-report.md"),`# Daily Report
`),R(q(s,"reports","architecture-review.md"),`# Architecture Review
`),R(q(s,"tests","test-plan.md"),`# Test Plan
`),R(q(s,"memory","decision-log.md"),`# Decision Log
`),R(q(s,"memory","risk.md"),`# Risk Log
`),R(q(s,"memory","open-questions.md"),`# Open Questions
`),R(q(s,"tasks","backlog.md"),`# Backlog
`),R(q(s,"tasks","plan.md"),`# Plan

## Current Stage

TBD
`);let p=`# Related Cognitive Context

`;try{let g=ce(t.rootDir),h=[],v=[],b=i.toLowerCase().split(/[^a-zA-Z0-9\u4e00-\u9fa5]+/).filter(_=>_.length>2||_.length>0&&/[\u4e00-\u9fa5]/.test(_));for(let _ of g.behaviors){let y=_.repo&&c.includes(_.repo),$=b.some(S=>_.id.toLowerCase().includes(S));(y||$)&&h.push(_)}for(let _ of g.state_machines){let y=_.repo&&c.includes(_.repo),$=b.some(S=>_.entity.toLowerCase().includes(S));(y||$)&&v.push(_)}if(h.length>0||v.length>0){if(p+=`Detected the following related cognitive artifacts from the global workspace based on repos [${c.join(", ")}] and objective keywords:

`,h.length>0){p+=`### Related Behaviors

`;for(let _ of h)p+=`- **[${_.id}](file:///${q(a.rootDir,_.path)})** (Confidence: ${_.kind}, Level: ${_.level})
`;p+=`
`}if(v.length>0){p+=`### Related State Machines

`;for(let _ of v)p+=`- **[${_.entity}](file:///${q(a.rootDir,_.path)})** (Confidence: ${_.kind}, Level: ${_.level})
`;p+=`
`}}else p+=`No matching behaviors or state machines found in the global index.
`}catch{p+=`Failed to load global cognitive index.
`}R(q(s,"context","related-cognitive-context.md"),p);let f=q(a.runtimeDir,"templates"),u=new Date().toISOString().slice(0,10),l=c.join(", ");for(let g of["01-current-state","02-gap-analysis","03-business-design","04-technical-design","05-task-breakdown","06-acceptance"]){let h=q(f,`${g}.md.template`),v=q(s,"docs",`${g}.md`),b=me(h)?L(h):`# ${g}
`;if(b=b.replaceAll("{{date}}",u).replaceAll("{{objective}}",i).replaceAll("{{repos}}",l),g==="01-current-state"){let _=`## Related Global Cognitive Context

See [related-cognitive-context.md](../context/related-cognitive-context.md) for matching behaviors and state machines loaded from the workspace.
`;b.includes("## Current Module Structure")?b=b.replace("## Current Module Structure",`${_}
## Current Module Structure`):b+=`
${_}`}R(v,b)}let d=['version: "0.2"',"feature:",`  name: "${n}"`,`  objective: "${i}"`,'  owner: "unassigned"','  isolation: "worktree"',"  repos:"];for(let g of c){let h=q(a.reposDir,g);d.push(`    - name: "${g}"`,`      branch: "feature/${n}"`,`      base-ref: "${ne("git",["-C",h,"rev-parse","HEAD"],a.rootDir)||"unknown"}"`,`      base-time: "${new Date().toISOString()}"`,`      path: "repos/${g}"`)}return d.push("  scope:","    in: []","    out: []","  acceptance:",'    - "define acceptance criteria"','  risk_level: "medium"',"  dependencies: []","  last-review-at: null"),R(q(s,"feature.yaml"),d.join(`
`)+`
`),{ok:!0,data:{feature:n},sideEffects:["worktree mapping","feature files"],reportFragments:["feature created"]}}},Gi={id:"feature.status",version:"1.0.0",inputSchema:{},async execute(t){let e=V(t.rootDir);if(!me(e.featuresDir))return{ok:!0,data:{text:"No features found."},sideEffects:[],reportFragments:[]};let n=zi(e.featuresDir).filter(r=>me(q(e.featuresDir,r,"feature.yaml")));return{ok:!0,data:{text:[`Features (${n.length}):`,...n.map(r=>`  - ${r}`)].join(`
`)},sideEffects:[],reportFragments:[]}}},Ui={id:"feature.stage",version:"1.0.0",inputSchema:{required:["feature","action"],properties:{feature:{type:"string",minLength:1},action:{type:"string",enum:["get","set"]},stage:{type:"string"},confirmed:{type:"boolean"}},additionalProperties:!1},async execute(t,e){X(e,["feature","action"]);let n=String(e.feature),r=String(e.action),i=V(t.rootDir),a=q(i.featuresDir,n),s=q(a,"reports","feature-progress.md");if(r==="get"){if(!me(s))return{ok:!0,data:{stage:null},sideEffects:[],reportFragments:[]};let p=L(s).match(/## Stage: (\S+)/);return{ok:!0,data:{stage:p?p[1]:null},sideEffects:[],reportFragments:[]}}if(r==="set"){X(e,["stage"]);let c=String(e.stage),p=Yi(i.rootDir,n,c,e.confirmed===!0),f=Xt(i.rootDir,n);J(q(a,"reports")),R(p.marker,`stage: ${c}
set-at: ${new Date().toISOString()}
`);let u=me(s)?L(s):`# Feature Progress
`,d=/## Stage: /.test(u)?u.replace(/## Stage: .+$/m,`## Stage: ${c}`):(u.endsWith(`
`)?u:u+`
`)+`## Stage: ${c}
`;return R(s,d),{ok:!0,data:{stage:c},sideEffects:["stage marker","progress updated"],reportFragments:[`stage set to ${c}`,...f]}}throw new A("INVALID_ACTION",`unknown action: ${r}`)}},Hi={id:"feature.tasks",version:"1.0.0",inputSchema:{required:["feature","action"],properties:{feature:{type:"string",minLength:1},action:{type:"string",enum:["list","append"]},content:{type:"string"}},additionalProperties:!1},async execute(t,e){X(e,["feature","action"]);let n=String(e.feature),r=String(e.action),i=V(t.rootDir),a=q(i.featuresDir,n),s=q(a,"tasks");if(J(s),r==="list"){let c=q(s,"backlog.md");return me(c)?{ok:!0,data:{text:L(c)},sideEffects:[],reportFragments:[]}:{ok:!0,data:{text:""},sideEffects:[],reportFragments:[]}}if(r==="append"){X(e,["content"]);let c=String(e.content),p=q(s,"backlog.md"),f=new Date().toISOString(),u=c.includes(`
`)?c:`- ${c} (${f})`,l=me(p)?L(p)+`
`+u:`# Backlog

${u}
`;return R(p,l),{ok:!0,data:{appended:!0},sideEffects:["backlog updated"],reportFragments:["task appended"]}}throw new A("INVALID_ACTION",`unknown action: ${r}`)}},Wi={id:"feature.review",version:"1.0.0",inputSchema:{required:["feature"],properties:{feature:{type:"string",minLength:1}},additionalProperties:!1},async execute(t,e){X(e,["feature"]);let n=String(e.feature),r=V(t.rootDir),i=q(r.featuresDir,n,"reports","daily-report.md");return R(i,`# Daily Review: ${n}

- Date: ${new Date().toISOString()}
`),{ok:!0,data:{report:St(r.rootDir,i)},sideEffects:["review report"],reportFragments:["review generated"]}}},aa={type:"object",properties:{decisions:{type:"object",properties:{skip:{type:"boolean"},target_path:{type:"string"}},additionalProperties:!1},architecture:{type:"object",properties:{entries:{type:"array",items:{type:"object",required:["source_path","target_path"],properties:{source_path:{type:"string"},target_path:{type:"string"}},additionalProperties:!1}}},additionalProperties:!1},cognitive:{type:"object",properties:{unlink:{type:"array",items:{type:"object",required:["kind","id"],properties:{kind:{enum:["behavior","state-machine","domain","business-rule","capability-map"]},id:{type:"string",minLength:1},repo:{type:"string"}},additionalProperties:!1}}},additionalProperties:!1},reports:{type:"object",properties:{copy_paths:{type:"array",items:{type:"string",minLength:1}}},additionalProperties:!1}},additionalProperties:!1};function qi(t,e){if(me(t)){let n=L(t),r=ji("sha256").update(n).digest("hex"),i=ji("sha256").update(e).digest("hex");if(r===i)return!1}return at(t,e),!0}function ca(t){for(let{path:e,existedBefore:n}of t)if(!n&&me(e))try{ra(e)}catch{}}var Zi={id:"feature.close",version:"3.0.0",inputSchema:{required:["feature"],properties:{feature:{type:"string",minLength:1},confirmed:{type:"boolean"},force:{type:"boolean"},promote_artifacts:aa},additionalProperties:!1},confirmGate:"acceptance",async execute(t,e){X(e,["feature"]);let n=String(e.feature),r=V(t.rootDir),i=q(r.featuresDir,n),a=q(i,"feature.yaml");if(!me(a))throw new A("FEATURE_MISSING",`feature.yaml not found for ${n}`);let s=e.promote_artifacts??{},c=[],p=u=>{c.push({path:u,existedBefore:me(u)})},f={decisions:{written:!1,skipped:!1,target_path:""},architecture:{written_count:0,entries:[]},cognitive:{unlinked_count:0,ids:[]},reports:{copied_count:0,paths:[]}};try{J(q(r.docsDir,"decisions")),J(q(r.docsDir,"feature-impact"));let u=q(i,"memory","decision-log.md"),l=q(r.docsDir,"decisions",`${n}-decisions.md`),d=s.decisions?.target_path&&s.decisions.target_path.length>0?wt(r.rootDir,s.decisions.target_path):l;if(f.decisions.target_path=St(r.rootDir,d),s.decisions?.skip===!0)f.decisions.skipped=!0;else if(me(u)){let v=L(u),b=`# Decisions for Feature: ${n}

${v}`;p(d);let _=qi(d,b);f.decisions.written=_}if(R(q(r.docsDir,"feature-impact",`${n}.md`),`# Feature Impact: ${n}

- Archive Date: ${new Date().toISOString().slice(0,10)}
`),s.architecture?.entries)for(let v of s.architecture.entries){let b=wt(i,v.source_path),_=wt(r.rootDir,v.target_path);if(!me(b))throw new A("PROMOTE_SOURCE_MISSING",`promote_artifacts.architecture: source_path not found: ${v.source_path}`);let y=L(b);p(_);let $=qi(_,y);$&&f.architecture.written_count++,f.architecture.entries.push({source_path:v.source_path,target_path:v.target_path,written:$})}if(s.reports?.copy_paths){let v=q(r.docsDir,"feature-impact",n);J(v);for(let b of s.reports.copy_paths){let _=wt(i,b);if(!me(_))throw new A("PROMOTE_SOURCE_MISSING",`promote_artifacts.reports: copy_path not found: ${b}`);let y=_.split("/").pop()??b,$=q(v,y),S={source:b,target:St(r.rootDir,$),copied:!1};me($)||(p($),na(_,$),S.copied=!0,f.reports.copied_count++),f.reports.paths.push(S)}}for(let v of Ze(L(a))){let b=q(r.reposDir,v),_=q(i,"repos",v);if(me(q(_,".git"))){if(ne("git",["-C",_,"status","--porcelain"],r.rootDir)&&e.force!==!0)throw new A("WORKTREE_DIRTY",`worktree for '${v}' has unmerged changes. re-run with --force if you confirmed removal`);let $=["-C",b,"worktree","remove",_];e.force===!0&&$.push("--force"),ne("git",$,r.rootDir),ne("git",["-C",b,"worktree","prune"],r.rootDir)}}if(!t.dispatch)throw new A("DISPATCH_UNAVAILABLE","feature.close requires ctx.dispatch to run 'cdr.feature.link'");let h=(await t.dispatch("cdr.feature.link",{feature:n})).result.data;if(s.cognitive?.unlink)for(let v of s.cognitive.unlink)la(t,v.kind,v.id,v.repo,n)&&f.cognitive.unlinked_count++,f.cognitive.ids.push(v);return R(q(i,"reports","stage-acceptance.completed"),`stage: acceptance
completed-at: ${new Date().toISOString()}
note: archived and closed
`),{ok:!0,data:{feature:n,cdr_assets_tagged:h.assets_tagged,promoted_artifacts:f},sideEffects:["archive docs","worktree remove","cdr.feature.link","promote_artifacts"],reportFragments:["feature closed",`linked ${h.assets_tagged} CDR asset(s) to feature ${n}`,`promoted: ${f.architecture.written_count} architecture + ${f.reports.copied_count} reports + ${f.cognitive.unlinked_count} cognitive unlink(s); decisions ${f.decisions.skipped?"skipped":f.decisions.written?"written":"unchanged"}`]}}catch(u){throw ca(c),u}}};function la(t,e,n,r,i){try{let a=ce(t.rootDir),c={behavior:a.behaviors,"state-machine":a.state_machines,domain:a.domains,"business-rule":a.business_rules,"capability-map":a.capability_maps}[e];if(!c)return!1;let p=!1;for(let u of c)u.id===n&&(r!==void 0&&u.repo!==r||u.created_by_feature===i&&(delete u.created_by_feature,p=!0));if(!p)return!1;let f=q(V(t.rootDir).dapeiDir,"cognitive","index.yaml");return at(f,JSON.stringify(a,null,2)+`
`),!0}catch{return!1}}function Ki(t){let e={};for(let n of t.split(`
`)){let r=n.match(/^(\s*)([a-z_]+):\s*(.*)$/);if(r){let i=r[2].trim(),a=r[3].trim().replace(/^["']|["']$/g,"");e[i]=a}}return e}function Ji(t,e,n){let r=t.split(`
`),i=!1,a=r.map(s=>{let c=s.match(/^(\s*)(owner|assignees|last-review-at):\s*(.*)$/);return c&&c[2]===e?(i=!0,s.replace(/^(\s*)owner:\s*.*$/m,`$1owner: "${n}"`)):s});if(!i){let s=`  owner: "${n}"`,c=a.findIndex(p=>p.includes("repos:"));c>=0&&a.splice(c,0,s)}return a.join(`
`)}var Qi={id:"feature.assign",version:"1.0.0",inputSchema:{required:["feature","owner"],properties:{feature:{type:"string",minLength:1},owner:{type:"string",minLength:1},assignees:{type:"string"}},additionalProperties:!1},async execute(t,e){X(e,["feature","owner"]);let n=String(e.feature),r=String(e.owner),i=e.assignees?String(e.assignees):"",a=V(t.rootDir),s=q(a.featuresDir,n),c=q(s,"feature.yaml");if(!me(c))throw new A("FEATURE_MISSING",`feature.yaml not found for ${n}`);let p=L(c);if(p=Ji(p,"owner",r),i){let f=i.split(",").map(u=>u.trim()).filter(Boolean);if(p.includes("assignees:"))p=p.replace(/assignees:\s*\n/,`assignees: [${f.join(", ")}]
`);else{let u=p.split(`
`).findIndex(l=>l.includes("owner:"));u>=0&&(p=p.split(`
`).splice(u+1,0,`  assignees: [${f.join(", ")}]`).join(`
`))}}return R(c,p),{ok:!0,data:{feature:n,owner:r,assignees:i||""},sideEffects:["feature.yaml updated"],reportFragments:[`${n} assigned to ${r}`]}}},Xi={id:"feature.handoff",version:"1.0.0",inputSchema:{required:["feature","to"],properties:{feature:{type:"string",minLength:1},to:{type:"string",minLength:1},note:{type:"string"}},additionalProperties:!1},async execute(t,e){X(e,["feature","to"]);let n=String(e.feature),r=String(e.to),i=e.note?String(e.note):"",a=V(t.rootDir),s=q(a.featuresDir,n),c=q(s,"feature.yaml");if(!me(c))throw new A("FEATURE_MISSING",`feature.yaml not found for ${n}`);let p=L(c),f=Ki(p),u=String(f.owner||"unknown"),l=q(s,"reports","feature-progress.md"),d=me(l)&&L(l).match(/## Stage: (\S+)/)?.[1]||"unknown",g=[`# Handoff: ${n}`,`**From**: ${u}`,`**To**: ${r}`,`**Date**: ${t.now.toISOString()}`,`**Current Stage**: ${d}`,"","## Context Summary",i||"(no context note provided \u2014 AI should generate from feature docs)","","## Open Items","- Memory: see memory/decision-log.md and memory/risk.md","- Current State: see docs/01-current-state.md","- Latest Progress: see reports/daily-report.md"].join(`
`);R(q(s,"context","handoff.md"),g);let h=Ji(p,"owner",r);return R(c,h),{ok:!0,data:{feature:n,from:u,to:r,handoff_note:"context/handoff.md"},sideEffects:["handoff note created","owner updated"],reportFragments:[`${n} handed off from ${u} to ${r}`]}}},eo={id:"feature.teamstatus",version:"1.0.0",inputSchema:{},async execute(t){let e=V(t.rootDir);if(!me(e.featuresDir))return{ok:!0,data:{text:"No features found."},sideEffects:[],reportFragments:[]};let n=zi(e.featuresDir).filter(s=>me(q(e.featuresDir,s,"feature.yaml"))),r=[];for(let s of n){let c=q(e.featuresDir,s,"feature.yaml"),p=L(c),f=Ki(p),u=q(e.featuresDir,s,"reports","feature-progress.md"),l=me(u)&&L(u).match(/## Stage: (\S+)/)?.[1]||"unknown";r.push({name:s,owner:String(f.owner||"unassigned"),stage:l,status:String(f.status||"active")})}let i={};for(let s of r)i[s.owner]||(i[s.owner]=[]),i[s.owner].push(s);let a=["# Team Status"];for(let[s,c]of Object.entries(i)){a.push(`
## ${s} (${c.length})`);for(let p of c)a.push(`- **${p.name}** [${p.stage}] ${p.status!=="active"?`(${p.status})`:""}`)}return{ok:!0,data:{text:a.join(`
`),features:r},sideEffects:[],reportFragments:[`team status: ${r.length} features across ${Object.keys(i).length} owners`]}}},to={id:"feature.gap.analysis",version:"1.0.0",inputSchema:{required:["feature"],properties:{feature:{type:"string",minLength:1},max_envelopes:{type:"number"}},additionalProperties:!1},async execute(t,e){X(e,["feature"]);let n=String(e.feature),r=Math.max(0,Math.min(10,Number(e.max_envelopes??3))),i=V(t.rootDir),a=q(i.featuresDir,n);if(!me(q(a,"feature.yaml")))throw new A("FEATURE_MISSING",`feature.yaml not found for ${n}`);if(!me(q(a,"reports","stage-analyze-current-state.completed")))throw new A("STAGE_PREREQ_MISSING","gap-analysis requires 'analyze-current-state' to be completed first");let s="TBD";try{let d=L(q(a,"feature.yaml")).match(/objective:\s*"?([^"\n]+)"?/);d&&(s=d[1].trim())}catch{}let c=s.toLowerCase().split(/[^a-zA-Z0-9一-龥]+/).filter(l=>l.length>2||l.length>0&&/[一-龥]/.test(l)),p="";if(r>0&&c.length>0){if(!t.dispatch)throw new A("DISPATCH_UNAVAILABLE","feature.gap.analysis requires ctx.dispatch to run 'cdr.context.envelope'");let l=t.dispatch;try{let g=ce(t.rootDir).behaviors.filter(h=>typeof h?.id=="string").map(h=>{let v=`${h.id} ${h.repo??""} ${h.path??""}`.toLowerCase(),b=c.reduce((_,y)=>_+(v.includes(y)?1:0),0);return{b:h,score:b}}).filter(h=>h.score>0).sort((h,v)=>v.score-h.score).slice(0,r);if(g.length>0){let h=["> Auto-injected by `feature.gap.analysis`. Each envelope is bounded to ~8KB by `cdr.context.envelope`.\n"];for(let{b:v}of g)try{let b={target:"behavior",id:String(v.id),include_evidence:!0,include_related:0};v.repo&&(b.repo=String(v.repo));let{result:_}=await l("cdr.context.envelope",b);if(_?.ok&&_.data&&typeof _.data=="object"&&!Array.isArray(_.data)){let y=_.data.envelope;if(y&&typeof y=="object"&&!Array.isArray(y)){let $=typeof y.summary=="string"?String(y.summary):"";h.push(`- **${v.id}**${v.repo?` (${String(v.repo)})`:""}: ${$.slice(0,280)}`)}}}catch{}p=h.join(`
`)+`
`}}catch{}}let f=q(a,"docs","02-gap-analysis.md");J(q(a,"docs"));let u=[`# Gap Analysis \u2014 ${n}`,"",`- Generated: ${new Date().toISOString()}`,"- Prereq satisfied: analyze-current-state \u2713","","## Objective","",s,"","## Current State (from analyze-current-state)","","_Reference: `docs/01-current-state.md`._","","## Gaps","","_AI fills in: what is missing between current state and the objective. Use fact-level entries with `sources[]` for any factual claim._","","## Related Cognitive Context","",p||"_No related behaviors matched objective keywords. Run `cdr.entries.candidate` + `cdr.entries.propose` to surface entry points first._",""].join(`
`);return at(f,u),{ok:!0,data:{gapAnalysis:St(i.rootDir,f),injectedEnvelopes:p?p.split(`
`).filter(l=>l.startsWith("- **")).length:0},sideEffects:["docs/02-gap-analysis.md scaffolded"],reportFragments:["gap-analysis scaffolded"]}}},no={id:"feature.stage.transition",version:"1.0.0",inputSchema:{required:["feature","stage"],properties:{feature:{type:"string",minLength:1},stage:{type:"string",minLength:1},confirmed:{type:"boolean"}},additionalProperties:!1},async execute(t,e){X(e,["feature","stage"]);let n=String(e.feature),r=String(e.stage),i=V(t.rootDir),a=Yi(i.rootDir,n,r,e.confirmed===!0),s=a.featureDir,c=Xt(i.rootDir,n);J(q(s,"reports"));let p=a.marker;at(p,`stage: ${r}
completed-at: ${new Date().toISOString()}
`);let f=q(s,"reports","feature-progress.md"),u=me(f)?L(f):`# Feature Progress

`,d=/## Stage: /.test(u)?u.replace(/## Stage: .+$/m,`## Stage: ${r}`):(u.endsWith(`
`)?u:u+`
`)+`## Stage: ${r}
- Status: completed
`;return at(f,d),{ok:!0,data:{stage:r,marker:St(i.rootDir,p)},sideEffects:["stage marker","progress updated"],reportFragments:[`transitioned to ${r}`,...c]}}},ro={id:"feature.accept",version:"1.0.0",inputSchema:{required:["feature"],properties:{feature:{type:"string",minLength:1},notes:{type:"string"},confirmed:{type:"boolean"}},additionalProperties:!1},confirmGate:"acceptance",async execute(t,e){X(e,["feature"]);let n=String(e.feature),r=e.notes?String(e.notes):"",i=V(t.rootDir),a=q(i.featuresDir,n);if(!me(q(a,"feature.yaml")))throw new A("FEATURE_MISSING",`feature.yaml not found for ${n}`);if(e.confirmed!==!0)throw new A("CONFIRMATION_REQUIRED","feature.accept is the acceptance confirmation gate. Re-run with --yes to record acceptance.");let s=q(a,"reports","stage-architecture-review.completed");if(!me(s))throw new A("STAGE_PREREQ_MISSING","acceptance requires 'architecture-review' to be completed first");J(q(a,"reports"));let c=q(a,"reports","acceptance-report.md"),p=[`# Acceptance Report \u2014 ${n}`,"",`- Accepted at: ${new Date().toISOString()}`,"- Confirmed by: engine (feature.accept)",""];r.length>0&&p.push("## Notes","",r,""),p.push("## Reports Referenced","","- reports/validation-report.md","- reports/architecture-review.md",""),at(c,p.join(`
`));let f=q(a,"reports","stage-acceptance.completed");at(f,`stage: acceptance
completed-at: ${new Date().toISOString()}
`);let u=q(a,"reports","feature-progress.md");if(me(u)){let l=L(u),d=/## Stage: /.test(l)?l.replace(/## Stage: .+$/m,"## Stage: acceptance"):l+`
## Stage: acceptance
- Status: accepted
`;at(u,d)}return{ok:!0,data:{report:St(i.rootDir,c),marker:St(i.rootDir,f)},sideEffects:["acceptance report","stage marker","progress updated"],reportFragments:[`feature ${n} accepted`]}}};import{existsSync as Qe,readdirSync as io}from"node:fs";import{join as Ie,relative as rr}from"node:path";function pa(t,e=40){return L(t).split(`
`).slice(0,e).join(`
`)}function da(t,e){let n=Ie(t,"docs","as-is","behavior");if(!Qe(n))return`- No behavior artifacts yet.
`;let r=ce(t),i=["| ID | Kind | Level | Repo | Entry |","|---|---|---|---|---|"],a=0;for(let s of r.behaviors){if(e.length&&s.repo&&!e.includes(s.repo))continue;let c=Ie(t,s.path),p="TBD";if(Qe(c)){let f=L(c),u=f.match(/method:\s*(\S+)/)?.[1],l=f.match(/path:\s*(\S+)/)?.[1];(u||l)&&(p=`${u||""} ${l||""}`.trim())}if(i.push(`| ${s.id} | ${s.kind} | ${s.level} | ${s.repo||"-"} | ${p} |`),a++,a>=30)break}return a===0?`- No behavior artifacts for mapped repos.
`:i.join(`
`)+`
`}function ua(t,e){let n=ce(t),r=["| Entity | Kind | Level | States |","|---|---|---|---|"],i=0;for(let a of n.state_machines){if(e.length&&a.repo&&!e.includes(a.repo))continue;let s=Ie(t,a.path),c="?";if(Qe(s)){let p=L(s).match(/^\s*-\s+(\S+)/gm);c=p?String(p.length):"?"}if(r.push(`| ${a.entity} | ${a.kind} | ${a.level} | ${c} |`),i++,i>=20)break}return i===0?`- No state machine artifacts for mapped repos.
`:r.join(`
`)+`
`}var fa={"analyze-current-state":"discover","gap-analysis":"discover","solution-design":"design","task-breakdown":"design",implementation:"design","local-validation":"ship","architecture-review":"ship",acceptance:"ship"};function ga(t,e){let n=fa[t];if(!n)return"";let r=ce(e),i=Ie(e,"docs","as-is","profiles"),a=Ie(e,"docs","as-is","entries"),s=Qe(i)?io(i).filter(b=>b.endsWith(".yaml")).length:0,c=0,p=0;if(Qe(a))for(let b of io(a)){if(!b.endsWith(".yaml"))continue;let _=L(Ie(a,b));/^\s*status:\s*confirmed/m.test(_)?c++:p++}let f=r.behaviors?.length??0,u=r.state_machines?.length??0,l=r.domains?.length??0,d=r.business_rules?.length??0,g=Qe(Ie(e,"docs","as-is","capabilities","product-map.yaml")),h=Qe(Ie(e,".dapei","docs-portal","index.md"));if(s===0&&c===0&&p===0&&f===0&&u===0&&l===0&&d===0&&!g)return[`## Cognitive Assets Available

`,"- No cognitive assets yet. Run `@dapei cdr bootstrap <repo>` to start, or `@dapei profile repo <repo>` for a single repo.\n\n"].join("");let v=[`## Cognitive Assets Available

`];return n==="discover"?(v.push(`- profiles: ${s}`),v.push(`- confirmed entries: ${c}`),v.push(`- candidate entries: ${p}`)):n==="design"?(v.push(`- behaviors: ${f}`),v.push(`- state machines: ${u}`),v.push(`- business rules: ${d}`)):(v.push(`- domains: ${l}`),v.push(`- capability map: ${g?"docs/as-is/capabilities/product-map.yaml":"not generated"}`),v.push(`- docs portal: ${h?"generated":"not generated"}`)),v.join(`
`)+`

`}var Rn={id:"context.build",version:"2.1.0",inputSchema:{required:["feature","stage"],properties:{feature:{type:"string",minLength:1},stage:{type:"string",minLength:1}},additionalProperties:!1},async execute(t,e){X(e,["feature","stage"]);let n=String(e.feature),r=String(e.stage||"general"),i=V(t.rootDir),a=Ie(i.featuresDir,n);if(!Qe(a))throw new A("FEATURE_MISSING",`feature not found: ${n}`);let s=Ie(a,"context","runtime-context.md"),c=Ie(a,"context","context-index.yaml"),p=L(Ie(a,"feature.yaml")),f=Ze(p),u=`# Runtime Context

## Workspace & Boundary Guidelines

- **Current Workspace**: ${i.workspaceName} (Path: ${i.rootDir})
- **Current Feature**: ${n} (Stage: ${r})
- **Active Dimension**: Feature Dimension

> [!IMPORTANT]
> **KNOWLEDGE BOUNDARY RULES**:
> 1. You are operating in the **Feature Dimension** for \`${n}\`.
> 2. All your designs, task lists, code changes, decisions, and risks MUST be saved under the feature directory \`features/${n}/\`.
> 3. Do **NOT** modify global files under the workspace root \`docs/\` (e.g. \`docs/as-is/\`, \`docs/architecture/\`) or \`.dapei/\` directly.
> 4. Syncing local designs and behaviors back to the workspace root is performed automatically during the **Feature Close** workflow stage.

---

- Generated At: ${new Date().toISOString()}

`;u+=ga(r,i.rootDir);let l=[Ie(i.docsDir,"standards"),Ie(i.runtimeDir,"ai-rules"),Ie(a,"context"),Ie(a,"docs"),Ie(a,"tasks")];for(let d of l)if(Qe(d))for(let g of Ae(d,[".md",".yaml",".yml"],30))g.endsWith("runtime-context.md")||g.endsWith("context-index.yaml")||(u+=`## Source: ${rr(i.rootDir,g)}

\`\`\`md
${L(g)}
\`\`\`

`);u+=`# Cognitive Behavior Summary

`,u+=da(i.rootDir,f),u+=`
# State Machine Summary

`,u+=ua(i.rootDir,f),u+=`
# Repo Runtime Evidence

`;for(let d of f){u+=`## Repo: ${d}

- Path: repos/${d}
- Stack: ${Pt(Ie(i.reposDir,d))}

`;let g=Ie(i.docsDir,"as-is","behavior");if(Qe(g))for(let h of Ae(g,[".yaml"],5)){if(h.endsWith("_candidates.yaml"))continue;let v=L(h);f.length&&v.includes(`repo: ${d}`)&&(u+=`### Behavior: ${rr(i.rootDir,h)}

\`\`\`yaml
${pa(h)}
\`\`\`

`)}}return R(s,u),R(c,`feature: ${n}
stage: ${r}
generated_at: "${new Date().toISOString()}"
total_sources: ${l.length}
cognitive_layer: true
`),{ok:!0,data:{runtimeContext:rr(i.rootDir,s)},sideEffects:["context rebuilt"],reportFragments:["context build done"]}}};import{existsSync as lt}from"node:fs";import{join as Xe,relative as ma}from"node:path";var ha=["analyze-current-state","gap-analysis","solution-design","task-breakdown","implementation","local-validation","architecture-review","acceptance"],oo={id:"workflow.runStage",version:"1.0.0",inputSchema:{required:["feature","stage"],properties:{feature:{type:"string",minLength:1},stage:{type:"string",minLength:1},confirmed:{type:"boolean"}},additionalProperties:!1},async execute(t,e){X(e,["feature","stage"]);let n=String(e.feature),r=String(e.stage),i=V(t.rootDir),a=Xe(i.featuresDir,n),s=Xe(i.dapeiDir,"workflows","feature-lifecycle.yaml"),c=lt(s)?L(s):"";if(kn(c,r,e.confirmed===!0),await Rn.execute(t,{feature:n,stage:r}),!lt(s))throw new A("WORKFLOW_MISSING",`workflow file not found: ${s}`);let p=L(s);if(!Zt(p).includes(r))throw new A("INVALID_STAGE",`stage '${r}' not found in workflow`);Sn(p,a,r);let f=Xt(i.rootDir,n);J(Xe(a,"reports"));for(let d of Zr(p,r)){if(!d||["code changes","all reports","layered context","feature manifest","repos/"].includes(d))continue;let g=Xe(a,d);if(d.startsWith("reports/")&&!lt(g)?R(g,`# ${d.split("/").pop()?.replace(/\.md$/,"").replace(/-/g," ")||"report"}

- Stage: ${r}
- Status: pending content
`):d==="release-notes.md"&&!lt(g)&&R(g,`# Release Notes

- Feature: ${n}
- Status: pending content
`),!lt(g))throw new A("STAGE_OUTPUT_MISSING",`stage '${r}' missing declared output: ${d}`)}let u=Xe(a,"reports",`stage-${r}.completed`);R(u,`stage: ${r}
completed-at: ${new Date().toISOString()}
`);let l=Xe(a,"reports","feature-progress.md");return R(l,`${lt(l)?L(l):`# Feature Progress
`}
## Stage: ${r}
- Status: completed
`),{ok:!0,data:{stage:r,marker:ma(i.rootDir,u)},sideEffects:["stage marker"],reportFragments:["workflow stage completed",...f]}}},so={id:"workflow.status",version:"1.0.0",inputSchema:{required:["feature"],properties:{feature:{type:"string",minLength:1}},additionalProperties:!1},async execute(t,e){X(e,["feature"]);let n=String(e.feature),r=V(t.rootDir),i=Xe(r.featuresDir,n),a=Xe(i,"reports","feature-progress.md");if(!lt(a))return{ok:!0,data:{feature:n,stage:null,completed:[]},sideEffects:[],reportFragments:[]};let c=L(a).match(/## Stage: (\S+)/),p=c?c[1]:null,f=Xe(r.dapeiDir,"workflows","feature-lifecycle.yaml"),u=lt(f)?Zt(L(f)):[],l=u.length>0?u:ha,d=[];for(let g of l)lt(Xe(i,"reports",`stage-${g}.completed`))&&d.push(g);return{ok:!0,data:{feature:n,currentStage:p,completed:d},sideEffects:[],reportFragments:[]}}};import{existsSync as Tt}from"node:fs";import{join as qe,relative as En}from"node:path";var ao={id:"feature.guardrail",version:"1.0.0",inputSchema:{required:["feature"]},async execute(t,e){X(e,["feature"]);let n=Qt(V(t.rootDir).rootDir,String(e.feature));return{ok:!0,data:{status:n.status,mode:n.mode,report:n.reportPath},sideEffects:["guardrail report"],reportFragments:["guardrail run"]}}},co={id:"validation.run",version:"1.0.0",inputSchema:{required:["feature"],properties:{feature:{type:"string",minLength:1}},additionalProperties:!1},async execute(t,e){X(e,["feature"]);let n=String(e.feature),r=V(t.rootDir),i=qe(r.featuresDir,n),a=qe(i,"reports","validation-report.md"),s=qe(i,"reports","test-report.md"),c="PASS",p="PASS",f=[],u=Ze(L(qe(i,"feature.yaml"))),l=`# Test Report

- Feature: ${n}

`;for(let h of u){let v=qe(r.reposDir,h);l+=`## Repo: ${h}

`;let b=kt(v);b.length===0&&(p="FAIL",c="FAIL",l+=`- Status: SKIPPED
- Reason: no candidate test command detected

`);for(let _ of b){let[y,...$]=_.split(" "),S=0,F="";try{F=Le(y,$,v)}catch(M){S=M.status||1,F=M.stdout?.toString?.()||M.message}S!==0&&(p="FAIL",c="FAIL"),l+=`### Command: \`${_}\`

- Exit Code: ${S}

\`\`\`text
${F.split(`
`).slice(-120).join(`
`)}
\`\`\`

`}}R(s,l);let d="PASS";try{let h=Qt(r.rootDir,n);d=h.status,h.status==="FAIL"&&(c="FAIL")}catch(h){f.push(`guardrail error: ${h?.message||String(h)}`),c="FAIL",d="ERROR"}let g=qe(i,"reports","guardrail-report.md");return R(a,`# Validation Report

- Feature: ${n}
- Status: ${c}
- Test Status: ${p}
- Guardrail Status: ${d}
- Errors: ${f.length?f.join("; "):"none"}
- Test Report: reports/test-report.md
- Guardrail Report: reports/guardrail-report.md
`),{ok:!0,data:{status:c,errors:f},sideEffects:["validation reports"],reportFragments:["validation done"]}}},lo={id:"validation.detect",version:"1.0.0",inputSchema:{required:["repo"],properties:{repo:{type:"string",minLength:1}},additionalProperties:!1},async execute(t,e){X(e,["repo"]);let n=String(e.repo),r=V(t.rootDir),i=qe(r.reposDir,n),a=kt(i);return{ok:!0,data:{repo:n,commands:a},sideEffects:[],reportFragments:["test commands detected"]}}},po={id:"validation.execute",version:"1.0.0",inputSchema:{required:["repo","command"],properties:{repo:{type:"string",minLength:1},command:{type:"string",minLength:1}},additionalProperties:!1},async execute(t,e){X(e,["repo","command"]);let n=String(e.repo),r=String(e.command),i=V(t.rootDir),a=qe(i.reposDir,n),[s,...c]=r.split(" "),p=0,f="";try{f=Le(s,c,a)}catch(u){p=u.status||1,f=u.stdout?.toString?.()||u.message||String(u)}return{ok:!0,data:{repo:n,command:r,exitCode:p,output:f},sideEffects:[],reportFragments:["validation executed"]}}},uo={id:"validation.report",version:"1.0.0",inputSchema:{required:["feature"],properties:{feature:{type:"string",minLength:1}},additionalProperties:!1},async execute(t,e){X(e,["feature"]);let n=String(e.feature),r=V(t.rootDir),i=qe(r.featuresDir,n,"reports","validation-report.md"),a=qe(r.featuresDir,n,"reports","test-report.md"),s=qe(r.featuresDir,n,"reports","guardrail-report.md"),c={"validation-report.md":{exists:Tt(i),path:Tt(i)?En(r.rootDir,i):void 0},"test-report.md":{exists:Tt(a),path:Tt(a)?En(r.rootDir,a):void 0},"guardrail-report.md":{exists:Tt(s),path:Tt(s)?En(r.rootDir,s):void 0}};return{ok:!0,data:{feature:n,reports:c},sideEffects:[],reportFragments:["validation report accessed"]}}},fo={id:"feature.report",version:"1.0.0",inputSchema:{required:["feature"],properties:{feature:{type:"string",minLength:1}},additionalProperties:!1},async execute(t,e){X(e,["feature"]);let n=String(e.feature),r=V(t.rootDir);Qt(r.rootDir,n);let i=qe(r.featuresDir,n,"reports","daily-report.md"),a=qe(r.featuresDir,n,"reports","architecture-review.md");return R(i,`# Daily Report

- Feature: ${n}
- Generated At: ${new Date().toISOString()}

## \u7ED3\u8BBA

- \u81EA\u52A8\u62A5\u544A\u5DF2\u751F\u6210\u3002
`),R(a,`# Architecture Review

- Feature: ${n}
- Generated At: ${new Date().toISOString()}
`),{ok:!0,data:{daily:En(r.rootDir,i)},sideEffects:["report files"],reportFragments:["report generated"]}}};import{existsSync as Ft}from"node:fs";import{join as et,relative as ya}from"node:path";function mo(t,e){X(e,["type"]);let n=String(e.type);if(n!=="behavior"&&n!=="state-machine")throw new A("INVALID_INPUT","type must be behavior or state-machine");if(e.content)return{type:n,content:String(e.content)};if(e.file){let r=et(t,String(e.file));if(!Ft(r))throw new A("FILE_MISSING",`artifact file not found: ${e.file}`);return{type:n,content:L(r)}}throw new A("INVALID_INPUT","content or file is required")}function ho(t,e){return oe(e)}var ba=["package.json","pnpm-lock.yaml","yarn.lock","pom.xml","build.gradle","build.gradle.kts","pyproject.toml","requirements.txt","setup.py","go.mod","Cargo.toml","Gemfile","composer.json","mix.exs","pubspec.yaml","Package.swift","CMakeLists.txt"],go=[{step:1,phase:"orient",goal:"Inspect directory tree and stack manifest files; infer language and layout"},{step:2,phase:"strategy",goal:"Agent chooses how to locate behavior entry points for this stack \u2014 platform does not prescribe keywords or patterns"},{step:3,phase:"candidates",goal:"Read code semantically; write candidates[] to _candidates.yaml"},{step:4,phase:"deep_dive",goal:"Trace each candidate; upsert behavior artifacts with evidence via cognitive.artifact.upsert"}];function va(t,e){let n=ne("tree",["-L","3","-I","node_modules|dist|build|target|.git|vendor|__pycache__|.next",t],e);if(n)return n.replace(`${t}`,".").replace(`${t}/`,"./");let r=ne("find",[t,"-maxdepth","3","-type","d"],e);return r?r.split(`
`).filter(Boolean).slice(0,80).map(i=>i.replace(`${t}`,".").replace(`${t}/`,"./")).join(`
`):"(empty or inaccessible)"}function _a(t){return ba.filter(e=>Ft(et(t,e)))}var yo={id:"cognitive.discover",version:"2.1.0",inputSchema:{required:["target"],properties:{target:{type:"string",minLength:1}},additionalProperties:!1},async execute(t,e){X(e,["target"]);let n=V(t.rootDir),r=be(t.rootDir);J(r.behaviorDir);let i=String(e.target),a=i==="--all"&&Ft(et(n.dapeiDir,"repos.yaml"))?We(L(et(n.dapeiDir,"repos.yaml"))):[i],s=[],c=[];for(let f of a){let u=et(n.reposDir,f);if(!Ft(u))continue;let l=_a(u),d=va(u,n.rootDir),g={name:f,path:`repos/${f}`,directory_tree:d,manifest_files:l};s.push(g),c.push(g)}let p={generated_at:new Date().toISOString(),status:"awaiting_agent_analysis",workflow:go,repo_context:c,candidates:[]};return R(r.candidatesFile,ve(p)),{ok:!0,data:{candidatesFile:ya(n.rootDir,r.candidatesFile),candidateCount:0,repos:s,workflow:go,nextStep:"Agent orients via directory_tree + manifest_files, chooses entry-finding strategy, then fills candidates[]"},sideEffects:["cognitive discover workspace prepared"],reportFragments:[`prepared discover scaffold for ${s.length} repo(s)`]}}},bo={id:"cognitive.artifact.validate",version:"1.0.0",inputSchema:{required:["type"],properties:{type:{type:"string",enum:["behavior","state-machine"]},content:{type:"string"},file:{type:"string"}},additionalProperties:!1},async execute(t,e){let{type:n,content:r}=mo(t.rootDir,e),i=ho(n,r),a=Ye(n,i);return{ok:a.length===0,data:{valid:a.length===0,errors:a,type:n,id:i.id||i.entity},sideEffects:[],reportFragments:a.length?["validation failed"]:["validation passed"]}}},vo={id:"cognitive.artifact.upsert",version:"1.0.0",inputSchema:{required:["type"],properties:{type:{type:"string",enum:["behavior","state-machine"]},content:{type:"string"},file:{type:"string"}},additionalProperties:!1},async execute(t,e){let{type:n,content:r}=mo(t.rootDir,e),i=ho(n,r);Ti(n,i);let a=be(t.rootDir);J(a.behaviorDir),J(a.stateMachineDir),J(a.cognitiveDir);let s=mt(n,i),c=et(t.rootDir,s);R(c,r.endsWith(`
`)?r:`${r}
`);let p=ce(t.rootDir);return ct(p,n,s,i),Ne(t.rootDir,p),{ok:!0,data:{type:n,path:s,id:i.id||i.entity,kind:i.confidence?.kind},sideEffects:["cognitive artifact upserted","index updated"],reportFragments:[`upserted ${n} ${i.id||i.entity}`]}}},_o={id:"cognitive.artifact.list",version:"1.0.0",inputSchema:{properties:{repo:{type:"string"},kind:{type:"string",enum:["fact","inference","unknown"]}},additionalProperties:!1},async execute(t,e){let n=ce(t.rootDir),r=e.repo?String(e.repo):void 0,i=e.kind?String(e.kind):void 0,a=n.behaviors.filter(l=>!(r&&l.repo!==r||i&&l.kind!==i)),s=n.state_machines.filter(l=>!(r&&l.repo!==r||i&&l.kind!==i)),c=n.domains.filter(l=>!(r&&l.repo!==r)),p=n.capability_maps,f=n.unknowns;return{ok:!0,data:{text:["# Cognitive Artifacts","",`- Updated: ${n.updated_at}`,`- Behaviors: ${a.length}`,`- State Machines: ${s.length}`,`- Domains: ${c.length}`,`- Capability Maps: ${p.length}`,`- Unknowns: ${f.length}`,"","## Behaviors",...a.length?a.map(l=>`- ${l.id} [${l.kind}/${l.level}] ${l.path}${l.repo?` (${l.repo})`:""}`):["- none"],"","## State Machines",...s.length?s.map(l=>`- ${l.entity} [${l.kind}/${l.level}] ${l.path}${l.repo?` (${l.repo})`:""}`):["- none"],"","## Domains",...c.length?c.map(l=>`- ${l.domain} ${l.path} derived_from: [${l.derived_from.join(", ")}]${l.repo?` (${l.repo})`:""}`):["- none"],"","## Capability Maps",...p.length?p.map(l=>`- ${l.product} ${l.path} (${l.capability_count} capabilities)`):["- none"],"","## Unknowns",...f.length?f.map(l=>`- ${l.id}: ${l.reason}`):["- none"]].join(`
`),behaviors:a,state_machines:s,domains:c,capability_maps:p,unknowns:f,updated_at:n.updated_at},sideEffects:[],reportFragments:["cognitive list"]}}},wo={id:"cognitive.state.suggest",version:"1.0.0",inputSchema:{required:["entity"],properties:{entity:{type:"string",minLength:1},repo:{type:"string"}},additionalProperties:!1},async execute(t,e){X(e,["entity"]);let n=String(e.entity),r=e.repo?String(e.repo):void 0,i=be(t.rootDir);J(i.stateMachineDir);let a=ce(t.rootDir),s=a.behaviors.filter(g=>!r||g.repo===r).map(g=>g.id),c=new Set,p=[],f=[];for(let g of s){let h=a.behaviors.find(S=>S.id===g),v=h?et(t.rootDir,h.path):et(t.rootDir,"docs/as-is/behavior",`${g}.yaml`);if(!Ft(v))continue;let b=oe(L(v)),_=String(b.id||"");if(!_.toLowerCase().includes(n.toLowerCase())&&n.toLowerCase()!=="all")continue;f.push(_);let y=b.entry,$=y?.type==="api"?`${y.method||"POST"} ${y.path||""}`.trim():y?.type==="mq"?String(y.topic||y.handler||"mq.event"):String(y?.handler||_);if(Array.isArray(b.events))for(let S of b.events){let F=String(S),M=F.split("."),Y=M[M.length-1]?.toUpperCase().replace(/[^A-Z0-9_]/g,"_");Y&&c.add(Y),p.push({trigger:F,from:"TBD",to:Y||"TBD",behavior_id:_})}if(Array.isArray(b.writes))for(let S of b.writes){let F=S;F.operation==="insert"&&c.add("CREATED"),F.operation==="update"&&c.add("UPDATED")}}c.size||(c.add("CREATED"),c.add("ACTIVE"),c.add("CLOSED"));let u={entity:n,states:[...c],transitions:p,confidence:{level:"medium",kind:"inference",evidence_type:"inferred_from_behavior"},derived_from:f.length?f:["cognitive.state.suggest"]};r&&(u.repo=r),f.length||(u.reason="no matching behaviors found; placeholder states generated");let l=mt("state-machine",u),d=et(t.rootDir,l);return R(d,ve(u)),{ok:!0,data:{draft:!0,path:l,entity:n,states:u.states,transitions:u.transitions,note:"draft only \u2014 Agent must confirm before upsert with kind=fact"},sideEffects:["state machine draft written"],reportFragments:[`state draft for ${n}`]}}},ko={id:"cognitive.explore",version:"1.0.0",inputSchema:{properties:{intent:{type:"string",minLength:1},repo:{type:"string"}},additionalProperties:!1},async execute(t,e){let n=String(e.intent||""),r=e.repo?String(e.repo):void 0,i=V(t.rootDir),a=ce(t.rootDir),s=n.toLowerCase().split(/[^a-zA-Z0-9]+/).filter(g=>g.length>2),c=a.behaviors.filter(g=>r&&g.repo!==r?!1:s.length?s.some(h=>g.id.toLowerCase().includes(h)):!0).slice(0,10),p=a.state_machines.filter(g=>r&&g.repo!==r?!1:s.length?s.some(h=>g.entity.toLowerCase().includes(h)):!0).slice(0,10),f=a.domains.filter(g=>r&&g.repo!==r?!1:s.length?s.some(h=>g.domain.toLowerCase().includes(h)):!0).slice(0,5),u=(a.business_rules||[]).filter(g=>r&&g.repo!==r?!1:s.length?s.some(h=>g.id.toLowerCase().includes(h)):!0).slice(0,10),l=c.length>0||p.length>0||f.length>0,d=[];if(d.push(`# Exploration: ${n||"(general)"}`),r&&d.push(`**Repo**: ${r}`),d.push(`**Timestamp**: ${t.now.toISOString()}`),d.push(""),!l)d.push("## No cognitive assets found"),d.push(""),d.push("No behaviors, state machines, or domains match your query. Suggestions:"),d.push("- Run `@dapei repos analyze <repo>` to bootstrap repo analysis"),d.push("- Run `@dapei discover entries for <repo>` to identify entry points"),d.push("- Run `@dapei discover behaviors for <repo>` to document behavior chains");else{if(c.length>0){d.push(`## Behaviors (${c.length})`);for(let g of c){let h=et(t.rootDir,g.path),v=Ft(h)?wa(L(h)):"(summary unavailable)";d.push(`- **[${g.id}](file:///${h})** [${g.kind}/${g.level}] ${v}`)}d.push("")}if(p.length>0){d.push(`## State Machines (${p.length})`);for(let g of p)d.push(`- **${g.entity}** [${g.kind}/${g.level}] \u2192 ${g.path}`);d.push("")}if(f.length>0){d.push(`## Domains (${f.length})`);for(let g of f)d.push(`- **${g.domain}** (derived from ${g.derived_from.length} behaviors) \u2192 ${g.path}`);d.push("")}if(u.length>0){d.push(`## Business Rules (${u.length})`);for(let g of u)d.push(`- **${g.id}** [${g.kind}] \u2192 ${g.path}`);d.push("")}d.push("## Next Steps"),d.push("- Ready to create a feature? Run `@dapei create feature ...`"),d.push("- Need deeper analysis? Run `@dapei discover behaviors for <repo>`"),d.push("- Check for stale assets? Run `@dapei check stale`")}return{ok:!0,data:{intent:n,repo:r||null,behavior_count:c.length,state_machine_count:p.length,domain_count:f.length,business_rule_count:u.length,has_assets:l,text:d.join(`
`)},sideEffects:[],reportFragments:[`explored: ${c.length} behaviors, ${p.length} state machines, ${f.length} domains`]}}};function wa(t){try{let e=oe(t),n=String(e.summary||e.description||"");if(n)return n.slice(0,120)+(n.length>120?"...":"");let r=e.entry;if(r){let i=String(r.type||""),a=String(r.path||r.topic||"");return`${i}: ${a}`}}catch{return"(parse error)"}return"(no summary)"}import{existsSync as So}from"node:fs";import{join as ir}from"node:path";var ka={decision:"decision-log.md",risk:"risk.md",question:"open-questions.md",note:"notes.md"},Ao={id:"memory.append",version:"1.0.0",inputSchema:{required:["feature","type","content"],properties:{feature:{type:"string",minLength:1},type:{type:"string",enum:["decision","risk","question","note"]},content:{type:"string",minLength:1}},additionalProperties:!1},async execute(t,e){X(e,["feature","type","content"]);let n=String(e.feature),r=String(e.type),i=String(e.content),a=V(t.rootDir),s=ir(a.featuresDir,n);if(!So(s))throw new A("FEATURE_MISSING",`feature directory not found: ${n}`);let c=ka[r]||`${r}.md`,p=ir(s,"memory"),f=ir(p,c);J(p);let u=new Date().toISOString(),l=i.includes("##")?i:`## ${r} ${u}

${i}`,d=So(f)?L(f)+`
`+l:l;return R(f,d),{ok:!0,data:{feature:n,type:r,file:c},sideEffects:["memory file updated"],reportFragments:[`memory ${r} appended`]}}};import{existsSync as Sa,openSync as Aa,readSync as $a,closeSync as Da,statSync as Ca}from"node:fs";import{join as xa}from"node:path";function*Ra(t){let e=Ca(t).size;if(e===0)return;let n=Aa(t,"r");try{let i=e,a=Buffer.alloc(0);for(;i>0;){let s=Math.max(0,i-65536),c=Buffer.allocUnsafe(i-s),p=$a(n,c,0,c.length,s);i=s;let f=Buffer.concat([c.subarray(0,p),a]),u=f.length;for(let l=f.length-1;l>=0;l--)if(f[l]===10){let d=f.subarray(l+1,u);u=l,d.length>0&&(yield d.toString("utf8"))}a=f.subarray(0,u)}a.length>0&&(yield a.toString("utf8"))}finally{Da(n)}}var $o={id:"audit.query",version:"1.1.0",inputSchema:{properties:{since:{type:"string"},until:{type:"string"},capability:{type:"string"},feature:{type:"string"},artifact_path:{type:"string"},limit:{type:"number"}},additionalProperties:!1},async execute(t,e){let n=V(t.rootDir),r=xa(n.dapeiDir,"audit","capability.log");if(!Sa(r))return{ok:!0,data:{entries:[],text:"No audit log found."},sideEffects:[],reportFragments:[]};let i=e.since?new Date(String(e.since)).getTime():0,a=e.until?new Date(String(e.until)).getTime():Date.now(),s=e.capability?String(e.capability):null,c=e.feature?String(e.feature):null,p=e.artifact_path?String(e.artifact_path):null,f=e.limit?Number(e.limit):100,u=[];for(let l of Ra(r)){if(u.length>=f)break;try{let d=JSON.parse(l),g=new Date(d.timestamp).getTime();if(g<i||g>a||s&&d.capability!==s||c&&d.feature!==c||p&&!(d.artifactPaths||[]).some(v=>v===p||v.includes(p)))continue;u.push(d)}catch{}}return{ok:!0,data:{entries:u.reverse()},sideEffects:[],reportFragments:[]}}};var or=[Qr,Xr,ti,ei,oi,si,ci,ai,li,pi,Vi,Rn,oo,so,co,lo,po,uo,ao,fo,Gi,Ui,Hi,Wi,Zi,Qi,Xi,eo,to,no,ro,Ao,$o,yo,bo,vo,_o,wo,ko];var In=class{map=new Map;register(e){if(this.map.has(e.id))throw new Error(`duplicate capability id: ${e.id}`);this.map.set(e.id,e)}registerMany(e){for(let n of e)this.register(n)}get(e){return this.map.get(e)}all(){return Object.fromEntries(this.map.entries())}};function Ea(t){return t===null?"null":Array.isArray(t)?"array":typeof t}function sr(t,e,n){if(e.type&&Ea(t)!==e.type)throw new A("INVALID_INPUT",`field '${n}' must be ${e.type}`);if(e.minLength!==void 0&&typeof t=="string"&&t.length<e.minLength)throw new A("INVALID_INPUT",`field '${n}' must have minLength ${e.minLength}`);if(e.enum&&!e.enum.includes(t))throw new A("INVALID_INPUT",`field '${n}' must be one of: ${e.enum.join(", ")}`);if(e.type==="array"&&Array.isArray(t)&&e.items)for(let r=0;r<t.length;r++)sr(t[r],e.items,`${n}[${r}]`);if(e.type==="object"&&t&&typeof t=="object"&&!Array.isArray(t)){let r=t;if(e.required){for(let i of e.required)if(r[i]===void 0||r[i]===null||r[i]==="")throw new A("INVALID_INPUT",`missing field: ${n}.${i}`)}if(e.properties)for(let[i,a]of Object.entries(e.properties))r[i]!==void 0&&sr(r[i],a,`${n}.${i}`);if(e.additionalProperties===!1){let i=new Set(Object.keys(e.properties||{}));if(e.required)for(let a of e.required)i.add(a);for(let a of Object.keys(r))if(!i.has(a))throw new A("INVALID_INPUT",`unexpected field: ${n}.${a}`)}}}function Do(t,e){if(e.required){for(let r of e.required)if(t[r]===void 0||t[r]===null||t[r]==="")throw new A("INVALID_INPUT",`missing field: ${r}`)}let n=e.properties||{};for(let[r,i]of Object.entries(n)){let a=t[r];a!==void 0&&sr(a,i,r)}if(e.additionalProperties===!1){let r=new Set(Object.keys(n));if(e.required)for(let i of e.required)r.add(i);for(let i of Object.keys(t))if(!r.has(i)&&i!=="confirmed"&&i!=="__confirmed"&&i!=="force"&&i!=="feature")throw new A("INVALID_INPUT",`unexpected field: ${i}`)}}function Oa(t){let e=ar(t,".dapei","audit");return cr(e)||Pa(e,{recursive:!0}),e}function Ma(t){try{if(!cr(t))return;let e=La(t);return Ba("sha256").update(e).digest("hex").slice(0,16)}catch{return}}var ja=5*1024*1024;async function lr(t,e,n,r){let i=new In;i.registerMany(t);let a=i.get(e);if(!a)throw new A("CAPABILITY_NOT_FOUND",`unknown capability: ${e}`);if(Do(n,a.inputSchema),a.confirmGate&&!(n.confirmed===!0||n.__confirmed===!0))throw new A("CONFIRMATION_REQUIRED",`stage confirmation required before '${a.confirmGate}'. Re-run with input.confirmed=true`);let s=typeof n.feature=="string"&&n.feature.trim()?n.feature.trim():void 0,p={...r.feature?r:s?{...r,feature:s}:r,dispatch:(g,h)=>lr(t,g,h,r)},f=Date.now(),u=await a.execute(p,n),l=Date.now()-f,d={schema_version:"2.0",timestamp:new Date().toISOString(),capability:e,version:a.version,ok:u.ok,duration:l,input:za(n),...p.feature?{feature:p.feature}:{},sideEffects:u.sideEffects,reportFragments:u.reportFragments,...u.artifactPaths&&u.artifactPaths.length>0?{artifactPaths:u.artifactPaths}:{}};if(u.artifactPaths&&u.artifactPaths.length>0){let g={};for(let h of u.artifactPaths){let v=Na(h)?h:ar(p.rootDir,h),b=Ma(v);b&&(g[h]=b)}Object.keys(g).length>0&&(d.afterHashes=g)}try{let g=ar(Oa(p.rootDir),"capability.log");qa(g),Ia(g,`${JSON.stringify(d)}
`,"utf8")}catch(g){let h=g instanceof Error?g.message:String(g);u.reportFragments.push(`audit log write failed: ${h}`),console.error(`[dapei] audit log write failed: ${h}`)}return{spec:a,result:u,ctx:p}}function qa(t){try{if(!cr(t)||Fa(t).size<=ja)return;Ta(t,`${t}.1`)}catch{}}function za(t){if(!("feature"in t))return t;let{feature:e,...n}=t;return n}import{existsSync as on}from"node:fs";import{join as Bt,relative as ht}from"node:path";import{execFileSync as en}from"node:child_process";import{existsSync as Ln,writeFileSync as Ya,mkdirSync as Va}from"node:fs";import{dirname as Ga,join as Ua}from"node:path";var xo="DAPEI_CODEGRAPH_BIN";function Ha(){let t=process.env[xo];if(t&&Ln(t))return{available:!0,binary:t,reason:null};try{let e=en("which",["codegraph"],{encoding:"utf8"}).trim();if(e)return{available:!0,binary:e,reason:null}}catch{}return{available:!1,binary:null,reason:"codegraph CLI not in PATH and DAPEI_CODEGRAPH_BIN unset"}}function Wa(t){try{return en(t,["--version"],{encoding:"utf8"}).trim()||null}catch{return null}}function Co(t,e){try{let n=en(t,["status","--json",e],{encoding:"utf8"});return JSON.parse(n)}catch{return{}}}function Pn(t,e,n){try{let r=en(t,e,{cwd:n,encoding:"utf8"});return JSON.parse(r)}catch{return null}}function Za(t,e,n){try{return en("git",["diff","--name-only",`${e}..${n}`,"--"],{cwd:t,encoding:"utf8"}).split(`
`).map(i=>i.trim()).filter(Boolean)}catch{return[]}}var pt=class{doctor;workspaceRoot;noCliMarkerPath;constructor(e){this.workspaceRoot=e,this.noCliMarkerPath=Ua(e,".dapei","graph",".no-codegraph");let i=!process.env[xo]&&Ln(this.noCliMarkerPath)?{available:!1,binary:null,reason:"codegraph marked unavailable for this workspace (.dapei/graph/.no-codegraph); set DAPEI_CODEGRAPH_BIN to override"}:Ha(),a=null,s,c,p;if(i.available&&i.binary){a=Wa(i.binary);let f=Co(i.binary,e);s=typeof f.pending=="number"?f.pending:void 0,c=typeof f.files_total=="number"?f.files_total:void 0,p=f.languages}this.doctor={available:i.available,binary:i.binary,version:a,reason:i.reason,pending_sync:s,files_total:c,languages:p}}isAvailable(){return this.doctor.available}getDoctor(){return this.doctor}markUnavailable(){if(!Ln(this.noCliMarkerPath))try{Va(Ga(this.noCliMarkerPath),{recursive:!0}),Ya(this.noCliMarkerPath,`codegraph CLI not in PATH. Capabilities in this workspace take the fallback path.
probed_at: ${new Date().toISOString()}
`,"utf8")}catch{}}isMarkedUnavailable(){return Ln(this.noCliMarkerPath)}orient(e,n={}){if(!this.doctor.available||!this.doctor.binary)return this.markUnavailable(),{available:!1,backend:"fallback",reason:this.doctor.reason||"codegraph CLI not available",repo_path:e,indexed_at:new Date().toISOString(),files:[]};let r=["files","--format=json"];typeof n.maxFiles=="number"&&r.push("--limit",String(n.maxFiles)),r.push(e);let i=Pn(this.doctor.binary,r,e);if(!i||typeof i!="object")return{available:!1,backend:"fallback",reason:"codegraph files returned non-JSON or empty output",repo_path:e,indexed_at:new Date().toISOString(),files:[]};let a=i,s=Array.isArray(a.files)?a.files:[],c=typeof n.maxBytes=="number"&&n.maxBytes>0?n.maxBytes:2e5,p=Pn(this.doctor.binary,["query","--kind=function","--json"," ",e],e),f=new Map;if(p&&typeof p=="object"){let d=Array.isArray(p.results)?p.results:[];for(let g of d)g.file&&g.route&&f.set(g.file,g)}let u=0,l=s.map(d=>{let g=d.relpath,h=d.content||"",v=d.truncated===!0,b=f.get(g),_;b&&b.route&&(u++,_={type:"api",method:b.route.method,path:b.route.path});let y={relpath:g,language:d.language||"text",size_bytes:typeof d.size_bytes=="number"?d.size_bytes:h.length,truncated:v,content:h};return _&&(y.apisurface_hint=_),y});return{available:!0,backend:"native",repo_path:e,indexed_at:new Date().toISOString(),files_total:typeof a.files_total=="number"?a.files_total:l.length,apisurface_count:u,files:l}}refs(e,n){if(!this.doctor.available||!this.doctor.binary)return{available:!1,reason:this.doctor.reason||"codegraph CLI not available",from:n,callees:[]};let r=n.symbol;if(!r&&typeof n.line=="number"){let c=Pn(this.doctor.binary,["node","--json",`${n.file}:${n.line}`],e);if(c&&typeof c=="object"){let p=c;r=p.symbol||p.name}}if(!r)return{available:!0,from:n,callees:[]};let i=Pn(this.doctor.binary,["callees","--json",r],e);if(!i||typeof i!="object")return{available:!1,reason:"codegraph callees returned non-JSON or empty output",from:n,callees:[]};let a=i,s=(Array.isArray(a.callees)?a.callees:[]).map(c=>{let p={name:c.name,kind:c.kind||"call"};return c.file&&(p.file=c.file),typeof c.line=="number"&&(p.line=c.line),p});return{available:!0,from:n,callees:s}}impact(e,n,r){if(!this.doctor.available||!this.doctor.binary)return{available:!1,reason:this.doctor.reason||"codegraph CLI not available",base:n,head:r,changed_files:[],affected_behavior_ids:[]};let i=Za(e,n,r);return{available:!0,base:n,head:r,changed_files:i,affected_behavior_ids:[]}}fullDoctor(){if(!this.doctor.available||!this.doctor.binary)return this.doctor;let e=Co(this.doctor.binary,this.workspaceRoot);return{...this.doctor,pending_sync:typeof e.pending=="number"?e.pending:this.doctor.pending_sync,files_total:typeof e.files_total=="number"?e.files_total:this.doctor.files_total,languages:e.languages||this.doctor.languages}}};function Ue(t,e){if(!e.feature)return t;let n={...t},r=e.feature,i=e.now;return e.mode==="create"?(n.created_by_feature=r,n.updated_by_feature=r,n.created_at=i,n.updated_at=i):(n.updated_by_feature=r,n.updated_at=i,n.created_by_feature||(n.created_by_feature=r),n.created_at||(n.created_at=i)),n}function He(t,e){return{feature:t.feature,now:t.now.toISOString(),mode:e}}import{existsSync as pr}from"node:fs";import{join as tn}from"node:path";var Ka=["package.json","pnpm-lock.yaml","yarn.lock","pom.xml","build.gradle","build.gradle.kts","pyproject.toml","requirements.txt","setup.py","go.mod","Cargo.toml","Gemfile","composer.json","mix.exs","pubspec.yaml","Package.swift","CMakeLists.txt"],Ro=[".ts",".tsx",".js",".jsx",".mjs",".cjs",".java",".kt",".scala",".py",".rb",".go",".rs",".php",".cs",".swift",".m",".mm",".dart"],Eo=2e5,Io=200,Ja={".ts":"typescript",".tsx":"typescript",".js":"javascript",".jsx":"javascript",".mjs":"javascript",".cjs":"javascript",".java":"java",".kt":"kotlin",".scala":"scala",".py":"python",".rb":"ruby",".go":"go",".rs":"rust",".php":"php",".cs":"csharp",".swift":"swift",".dart":"dart",".m":"objc",".mm":"objcpp"},Po=new Set(["api","mq","cron","rpc","cache","search","other"]);function nn(t){return t.replace(/\.[^.]+$/,"").replace(/([a-z])([A-Z])/g,"$1-$2").replace(/[_\s]+/g,"-").replace(/[^a-z0-9-]/gi,"-").replace(/-+/g,"-").replace(/^-|-$/g,"").toLowerCase()}function Lo(t){let e=t.lastIndexOf(".");return e<0?"unknown":Ja[t.slice(e).toLowerCase()]||"unknown"}function To(t,e){let n=ne("tree",["-L","3","-I","node_modules|dist|build|target|.git|vendor|__pycache__|.next",t],e);if(n)return n.replace(`${t}`,".").replace(`${t}/`,"./");let r=ne("find",[t,"-maxdepth","3","-type","d"],e);return r?r.split(`
`).filter(Boolean).slice(0,80).map(i=>i.replace(`${t}`,".").replace(`${t}/`,"./")).join(`
`):"(empty or inaccessible)"}function Fo(t){return Ka.filter(e=>pr(tn(t,e)))}function Bo(t){return tn(V(t).docsDir,"as-is","profiles")}function dr(t){return tn(V(t).docsDir,"as-is","entries")}function rn(t){return tn(V(t).docsDir,"as-is","capabilities")}function dt(t,e,n={}){let r=[],i=Array.isArray(e.sources)?e.sources:[];if(!i.length)return r;let s=e.confidence?.kind==="fact",c=i.filter(u=>u&&typeof u=="object"&&!Array.isArray(u)&&typeof u.repo=="string"&&u.repo);if(!s&&!n.strictRepo&&!c.length)return r;let p=e.repo?String(e.repo):void 0,f=new Map;for(let[u,l]of i.entries()){if(!l||typeof l!="object"||Array.isArray(l)){r.push(`sources[${u}] must be an object`);continue}let d=l,g=typeof d.repo=="string"&&d.repo.trim();if(!s&&!n.strictRepo&&!g)continue;let h=typeof d.file=="string"&&d.file.trim()?d.file.trim():"";if(!h){r.push(`sources[${u}].file is required`);continue}let v=g?d.repo.trim():p;if(!v){s&&r.push(`sources[${u}].repo is required (no default repo on artifact)`);continue}let b=`repos/${v}/${h}`,_;try{_=wt(t.rootDir,b)}catch(y){r.push(`sources[${u}].file escapes workspace: ${h} (${y.message})`);continue}if(!pr(_)){r.push(`sources[${u}].file not found in repo '${v}': ${h}`);continue}if(typeof d.line=="number"){let y=f.get(b);if(!y){let $=L(_);y={size:$.length,lineCount:$.split(`
`).length},f.set(b,y)}(d.line<1||d.line>y.lineCount)&&r.push(`sources[${u}].line ${d.line} out of range (file repos/${v}/${h} has ${y.lineCount} lines)`)}}return r}function No(t){try{return oe(t)}catch{return null}}function Oo(t,e){let n=tn(t,e);if(!pr(n))return{};try{return oe(L(n))}catch{return{}}}var sn={id:"cdr.profile",version:"2.0.0",inputSchema:{required:["repo"],properties:{repo:{type:"string",minLength:1}},additionalProperties:!1},async execute(t,e){X(e,["repo"]);let n=V(t.rootDir),r=String(e.repo),i=Bt(n.reposDir,r);if(!on(i))throw new A("REPO_MISSING",`repos/${r} not found`);let a=Pt(i),s=Fo(i),c=To(i,n.rootDir),p=kt(i),f=new pt(t.rootDir),u={available:f.isAvailable()};if(f.isAvailable()){let h=f.orient(i,{maxFiles:1,maxBytes:0});u.version=f.getDoctor().version||"",u.backend=h.backend,u.files_total=h.files_total||0,h.apisurface_count!==void 0&&(u.apisurface_count=h.apisurface_count)}else u.reason=f.getDoctor().reason||"codegraph CLI not in PATH";let l=Ue({repo:r,generated_at:t.now.toISOString(),language:a,manifest_files:s,directory_tree:c,test_commands:p,codegraph:u},He(t,"create")),d=Bo(t.rootDir);J(d);let g=Bt(d,`${r}.yaml`);return R(g,ve(l)),{ok:!0,data:{repo:r,path:ht(n.rootDir,g),language:a,manifest_files:s,test_commands:p,codegraph:u},sideEffects:[`profile written: ${ht(n.rootDir,g)}`],reportFragments:[`generated profile for ${r}`],artifactPaths:[ht(n.rootDir,g)]}}},Nt={id:"cdr.entries.candidate",version:"1.0.0",inputSchema:{required:["repo"],properties:{repo:{type:"string",minLength:1},max_files:{type:"number"},max_bytes:{type:"number"}},additionalProperties:!1},async execute(t,e){X(e,["repo"]);let n=V(t.rootDir),r=String(e.repo),i=Bt(n.reposDir,r);if(!on(i))throw new A("REPO_MISSING",`repos/${r} not found`);let a=typeof e.max_files=="number"&&e.max_files>0?Math.min(e.max_files,1e3):Io,s=typeof e.max_bytes=="number"&&e.max_bytes>0?Math.min(e.max_bytes,2e6):Eo,c=new pt(t.rootDir),p=c.orient(i,{maxFiles:a,maxBytes:s}),f="fallback",u;p.available||(u=p.reason||c.getDoctor().reason||"codegraph CLI not available");let l,d=[];if(p.available&&p.files.length>0)f="native",l=p.files.map(g=>{let h={relpath:g.relpath,language:g.language,size_bytes:g.size_bytes,truncated:g.truncated,content:g.content};return g.apisurface_hint&&(h.apisurface_hint=g.apisurface_hint),h});else{let g=Ae(i,Ro,a);l=[];for(let h of g){let v=ht(i,h),b="",_=!1;try{let y=L(h);y.length>s?(b=y.slice(0,s),_=!0,d.push({relpath:v,reason:`exceeds ${s} bytes`})):b=y}catch{d.push({relpath:v,reason:"unreadable"});continue}l.push({relpath:v,language:Lo(v),size_bytes:b.length,truncated:_,content:b})}}return{ok:!0,data:{repo:r,backend:f,...u?{backend_reason:u}:{},file_count:l.length,files:l,skipped:d,max_bytes:s,workflow:{step:1,phase:"candidate",goal:"AI reads file content and decides which files are entry points",next:"For each entry point: runCapability('cdr.entries.propose', {id, file, line, type, sources: [...]})"}},sideEffects:[],reportFragments:[`listed ${l.length} code file(s) in ${r} for AI triage (backend=${f})`]}}},ur={id:"cdr.entries.propose",version:"1.0.0",inputSchema:{required:["repo","id","file","line","type"],properties:{repo:{type:"string",minLength:1},id:{type:"string",minLength:1},type:{type:"string",enum:[...Po]},file:{type:"string",minLength:1},line:{type:"number"},method:{type:"string"},path:{type:"string"},summary:{type:"string"},sources:{type:"array"}},additionalProperties:!1},async execute(t,e){X(e,["repo","id","file","line","type"]);let n=String(e.repo),r=String(e.id),i=String(e.type),a=String(e.file),s=typeof e.line=="number"?e.line:void 0,c=e.method?String(e.method):void 0,p=e.path?String(e.path):void 0,f=e.summary?String(e.summary):void 0,u=Array.isArray(e.sources)?e.sources:[];if(!/^[a-z0-9-]+$/.test(r))throw new A("INVALID_INPUT","id must match ^[a-z0-9-]+$");if(!u.length)throw new A("INVALID_INPUT","sources[] is required \u2014 every entry proposal must cite at least one source location");let l=V(t.rootDir),d=Bt(l.reposDir,n);if(!on(d))throw new A("REPO_MISSING",`repos/${n} not found`);let g=Ue({id:r,type:i,status:"candidate",discovered_by:"ai",anchor:a,line:s,sources:u},He(t,"create"));c&&(g.method=c),p&&(g.path=p),f&&(g.summary=f);let h=dt(t,g);if(h.length)throw new A("INVALID_EVIDENCE",h.join("; "));let v=dr(t.rootDir);J(v);let b=Bt(v,`${n}.yaml`),_;on(b)?_=oe(L(b)):_={repo:n,generated_at:t.now.toISOString(),entry_count:0,entries:[]};let $=(Array.isArray(_.entries)?_.entries:[]).filter(S=>S&&S.id!==r);return $.push(g),_.entries=$,_.entry_count=$.length,_.generated_at=t.now.toISOString(),R(b,ve(_)),{ok:!0,data:{repo:n,path:ht(l.rootDir,b),id:r,type:i,status:"candidate",file:a,line:s??null,method:c||null,entry_path:p||null},sideEffects:[`entry proposed: ${r} in ${n}`],reportFragments:[`AI proposed entry ${r} (${i}) at ${a}:${s}`],artifactPaths:[ht(l.rootDir,b)]}}},fr={id:"cdr.entries.prepare",version:"2.0.0",inputSchema:{required:["repo"],properties:{repo:{type:"string",minLength:1}},additionalProperties:!1},async execute(t,e){let n=await Nt.execute(t,e);return n.ok?{ok:!0,data:{...n.data,workflow:{step:1,phase:"orient",goal:"AI reads code files and identifies entry points (HTTP routes, MQ consumers, cron jobs, RPC handlers, etc.)",next:"For each entry point: runCapability('cdr.entries.propose', {repo, id, type, file, line, sources:[{file, line, repo}]})",deprecated:!0,prefer:"cdr.entries.candidate"}},sideEffects:n.sideEffects,reportFragments:n.reportFragments}:n}},gr={id:"cdr.entries.confirm",version:"2.0.0",inputSchema:{required:["repo","entry_id","summary"],properties:{repo:{type:"string",minLength:1},entry_id:{type:"string",minLength:1},summary:{type:"string",minLength:1},priority:{type:"string"},sources:{type:"array"}},additionalProperties:!1},async execute(t,e){X(e,["repo","entry_id","summary"]);let n=String(e.repo),r=String(e.entry_id),i=String(e.summary),a=e.priority?String(e.priority):void 0,s=Array.isArray(e.sources)?e.sources:[];if(!s.length)throw new A("INVALID_INPUT","sources[] is required \u2014 confirming an entry without evidence is a P1 violation");let c=dr(t.rootDir),p=Bt(c,`${n}.yaml`);if(!on(p))throw new A("FILE_MISSING",`entries file not found: ${ht(t.rootDir,p)}. Run cdr.entries.candidate + cdr.entries.propose first.`);let f=oe(L(p)),u=f.entries;if(!Array.isArray(u))throw new A("INVALID_ARTIFACT","entries file has no entries array");let l=!1;for(let d of u)if(d&&typeof d=="object"&&!Array.isArray(d)){let g=d;if(String(g.id)===r){let h=Ue({...g,status:"confirmed",summary:i,sources:s},He(t,"update")),v=dt(t,h);if(v.length)throw new A("INVALID_EVIDENCE",v.join("; "));let b=h;g.status=h.status,g.summary=h.summary,g.sources=h.sources,b.created_by_feature&&(g.created_by_feature=b.created_by_feature),b.updated_by_feature&&(g.updated_by_feature=b.updated_by_feature),b.created_at&&(g.created_at=b.created_at),b.updated_at&&(g.updated_at=b.updated_at),a&&(g.priority=a),l=!0;break}}if(!l)throw new A("NOT_FOUND",`entry '${r}' not found in ${n} entries`);return R(p,ve(f)),{ok:!0,data:{repo:n,entry_id:r,status:"confirmed",summary:i,priority:a||null,sources:s},sideEffects:[`entry confirmed: ${r}`],reportFragments:[`confirmed entry ${r} in ${n} with ${s.length} source(s)`],artifactPaths:[ht(t.rootDir,p)]}}};import{existsSync as mr}from"node:fs";import{join as Tn,relative as yt}from"node:path";var hr={id:"cdr.domain.compose",version:"1.0.0",inputSchema:{required:["domain","description","behaviors"],properties:{domain:{type:"string",minLength:1},description:{type:"string",minLength:1},behaviors:{type:"array"},repo:{type:"string"},sources:{type:"array"},confidence:{type:"object"}},additionalProperties:!1},async execute(t,e){X(e,["domain","description","behaviors"]);let n=String(e.domain),r=String(e.description),i=Array.isArray(e.behaviors)?e.behaviors.map(b=>String(b)):[],a=e.repo?String(e.repo):void 0;if(!i.length)throw new A("INVALID_INPUT","behaviors[] must contain at least one behavior ID (P1 rule: domain must have derived_from)");let s=be(t.rootDir),c=ce(t.rootDir),p=[],f=[];for(let b of i){let _=c.behaviors.find(y=>y.id===b);if(!_)p.push(b);else{let y=Tn(t.rootDir,_.path);if(mr(y)){let $=oe(L(y));f.push({id:String($.id||b),name:String($.id||b),summary:String($.summary||$.description||""),kind:_.kind,level:_.level})}else f.push({id:b,name:b,summary:"",kind:_.kind,level:_.level})}}if(p.length)throw new A("NOT_FOUND",`behaviors not found in cognitive index: ${p.join(", ")}`);let u=nn(n),l=Ue({domain:u,name:n,description:r,generated_at:t.now.toISOString(),modules:f,derived_from:i,confidence:{level:"medium",kind:"inference",evidence_type:"composed_from_behaviors"}},He(t,"create"));a&&(l.repo=a),Array.isArray(e.sources)&&(l.sources=e.sources);let d=dt(t,l);if(d.length)throw new A("INVALID_EVIDENCE",d.join("; "));let g=Ye("domain",l);if(g.length)throw new A("INVALID_ARTIFACT",g.join("; "));let h=s.domainDir;J(h);let v=Tn(h,`${u}.yaml`);return R(v,ve(l)),{ok:!0,data:{domain:u,path:yt(t.rootDir,v),behavior_count:i.length,derived_from:i},sideEffects:[`domain composed: ${yt(t.rootDir,v)}`],reportFragments:[`composed domain '${n}' from ${i.length} behavior(s)`],artifactPaths:[yt(t.rootDir,v)]}}},yr={id:"cdr.business.compose",version:"1.0.0",inputSchema:{required:["id","kind","confidence"],properties:{id:{type:"string",minLength:1},kind:{type:"string",enum:["invariant","constraint","authorization","sla","compensation"]},description:{type:"string"},expr:{type:"string"},applies_to:{type:"array"},repo:{type:"string"},confidence:{type:"object"},sources:{type:"array"},derived_from:{type:"array"},reason:{type:"string"}},additionalProperties:!1},async execute(t,e){let n=String(e.id),r=String(e.kind),i=Ue({id:n,kind:r},He(t,"create"));e.description&&(i.description=String(e.description)),e.expr&&(i.expr=String(e.expr)),Array.isArray(e.applies_to)&&(i.applies_to=e.applies_to.map(d=>String(d))),e.repo&&(i.repo=String(e.repo)),Array.isArray(e.sources)&&(i.sources=e.sources),Array.isArray(e.derived_from)&&(i.derived_from=e.derived_from.map(d=>String(d))),e.reason&&(i.reason=String(e.reason)),i.confidence=e.confidence;let a=dt(t,i);if(a.length)throw new A("INVALID_EVIDENCE",a.join("; "));let s=Ye("business-rule",i);if(s.length)throw new A("INVALID_ARTIFACT",s.join("; "));let c=be(t.rootDir);J(c.businessRulesDir);let p=mt("business-rule",i),f=Tn(t.rootDir,p),u=ve(i);R(f,u.endsWith(`
`)?u:`${u}
`);let l=ce(t.rootDir);return ct(l,"business-rule",p,i),Ne(t.rootDir,l),{ok:!0,data:{id:n,kind:r,path:p,evidence_kind:e.confidence.kind},sideEffects:["business rule upserted","index updated"],reportFragments:[`upserted business rule ${n} (${r})`],artifactPaths:[p]}}},br={id:"cdr.capability.map.init",version:"1.0.0",inputSchema:{required:["product","capabilities"],properties:{product:{type:"string",minLength:1},capabilities:{type:"array"}},additionalProperties:!1},async execute(t,e){X(e,["product","capabilities"]);let n=String(e.product),r=Array.isArray(e.capabilities)?e.capabilities:[];if(!r.length)throw new A("INVALID_INPUT","capabilities[] must contain at least one capability");let i=r.map(f=>{let u={id:String(f.id||""),name:String(f.name||""),description:String(f.description||"")};return Array.isArray(f.domains)&&(u.domains=f.domains.map(l=>String(l))),u}),a=Ue({product:n,generated_at:t.now.toISOString(),capabilities:i},He(t,"create")),s=Ye("capability-map",a);if(s.length)throw new A("INVALID_ARTIFACT",s.join("; "));let c=rn(t.rootDir);J(c);let p=Tn(c,"product-map.yaml");return R(p,ve(a)),{ok:!0,data:{product:n,path:yt(t.rootDir,p),capability_count:i.length},sideEffects:[`capability map created: ${yt(t.rootDir,p)}`],reportFragments:[`initialized capability map for '${n}' with ${i.length} capabilities`],artifactPaths:[yt(t.rootDir,p)]}}},vr={id:"cdr.index.list",version:"1.1.0",inputSchema:{properties:{repo:{type:"string"},kind:{type:"string",enum:["fact","inference","unknown"]},entity:{type:"string"},id_contains:{type:"string"},created_by_feature:{type:"string"}},additionalProperties:!1},async execute(t,e){let n=ce(t.rootDir),r=be(t.rootDir),i=e.repo?String(e.repo):void 0,a=e.kind?String(e.kind):void 0,s=e.entity?String(e.entity):void 0,c=e.id_contains?String(e.id_contains).toLowerCase():void 0,p=e.created_by_feature?String(e.created_by_feature):void 0;function f(y,$){return!(c&&!`${$(y)??""}`.toLowerCase().includes(c)||p&&y.created_by_feature!==p)}let u=n.behaviors.filter(y=>!(i&&y.repo!==i||a&&y.kind!==a||s&&y.entity!==s||!f(y,()=>y.id))),l=n.state_machines.filter(y=>!(i&&y.repo!==i||a&&y.kind!==a||s&&y.entity!==s||!f(y,()=>y.entity))),d=[];if(mr(r.domainDir)){let y=Ae(r.domainDir,[".yaml",".yml"],50);for(let $ of y)try{let S=oe(L($)),F=String(S.domain||S.name||"");F&&d.push({domain:F,path:yt(t.rootDir,$)})}catch{}}let g=[],h=rn(t.rootDir);if(mr(h)){let y=Ae(h,[".yaml",".yml"],50);for(let $ of y)try{let S=oe(L($)),F=String(S.product||"");F&&g.push({product:F,path:yt(t.rootDir,$)})}catch{}}let v=(n.business_rules||[]).filter(y=>!(i&&y.repo!==i||a&&y.evidence_kind!==a)),b=n.unknowns;return{ok:!0,data:{text:["# Cognitive Assets Index","",`- Updated: ${n.updated_at}`,`- Behaviors: ${u.length}`,`- State Machines: ${l.length}`,`- Domains: ${d.length}`,`- Capability Maps: ${g.length}`,`- Business Rules: ${v.length}`,`- Unknowns: ${b.length}`,"","## Behaviors",...u.length?u.map(y=>`- ${y.id} [${y.kind}/${y.level}] ${y.path}${y.repo?` (${y.repo})`:""}`):["- none"],"","## State Machines",...l.length?l.map(y=>`- ${y.entity} [${y.kind}/${y.level}] ${y.path}${y.repo?` (${y.repo})`:""}`):["- none"],"","## Domains",...d.length?d.map(y=>`- ${y.domain} \u2192 ${y.path}`):["- none"],"","## Capability Maps",...g.length?g.map(y=>`- ${y.product} \u2192 ${y.path}`):["- none"],"","## Business Rules",...v.length?v.map(y=>`- ${y.id} [${y.kind}] [${y.evidence_kind}/${y.evidence_level}] ${y.path}${y.repo?` (${y.repo})`:""}`):["- none"],"","## Unknowns",...b.length?b.map(y=>`- ${y.id}: ${y.reason}`):["- none"]].join(`
`),behaviors:u,state_machines:l,domains:d,capability_maps:g,business_rules:v,unknowns:b,updated_at:n.updated_at},sideEffects:[],reportFragments:["cognitive assets listed"]}}};import{existsSync as Ot,readdirSync as Qa}from"node:fs";import{basename as Mo,join as an,relative as jo}from"node:path";var _r={id:"cdr.query",version:"1.0.0",inputSchema:{properties:{target:{type:"string",enum:["any","behavior","state-machine","business-rule","domain","capability-map"]},entity:{type:"string"},id_contains:{type:"string"},event:{type:"string"},writes_table:{type:"string"},calls_target:{type:"string"},target_repo:{type:"string"},created_by_feature:{type:"string"},repo:{type:"string"},limit:{type:"number"}},additionalProperties:!1},async execute(t,e){let n=ce(t.rootDir),r=be(t.rootDir),i=e.id_contains?String(e.id_contains).toLowerCase():void 0,a=e.event?String(e.event):void 0,s=e.writes_table?String(e.writes_table):void 0,c=e.calls_target?String(e.calls_target):void 0,p=e.target_repo?String(e.target_repo):void 0,f=e.created_by_feature?String(e.created_by_feature):void 0,u=e.repo?String(e.repo):void 0,l=e.entity?String(e.entity):void 0,d=e.target&&e.target!=="any"?String(e.target):void 0,g=Math.min(Math.max(Number(e.limit)||50,1),500),h=[],v=!d||d==="behavior",b=!d||d==="state-machine",_=!d||d==="business-rule",y=!d||d==="domain",$=!d||d==="capability-map";if(v)for(let U of n.behaviors){if(u&&U.repo!==u||i&&!(U.id||"").toLowerCase().includes(i)||f&&U.created_by_feature!==f)continue;if(a||s||c||p){let ae=Oo(t.rootDir,U.path);if(a&&!(ae.events||[]).some(re=>String(re).includes(a))||s&&!(ae.writes||[]).some(re=>String(re.table||"").includes(s))||c&&!(ae.calls||[]).some(re=>{let se=typeof re=="string"?re:re.target;return se?String(se).includes(c):!1})||p&&!(ae.calls||[]).some(re=>typeof re=="string"?!1:re.target_repo===p))continue}let ie=U.description||`Behavior ${U.id} (${U.kind})`;h.push({kind:"behavior",id:U.id,repo:U.repo,path:U.path,summary:String(ie).slice(0,200),sources:[]})}if((!d||d==="state-machine")&&!!!(a||s||c||p))for(let U of n.state_machines)u&&U.repo!==u||l&&U.entity!==l||i&&!(U.entity||"").toLowerCase().includes(i)||f&&U.created_by_feature!==f||h.push({kind:"state-machine",id:U.entity,repo:U.repo,path:U.path,summary:`State machine for ${U.entity} (${U.kind})`,sources:[]});if(_)for(let U of n.business_rules)u&&U.repo!==u||i&&!(U.id||"").toLowerCase().includes(i)||c&&!JSON.stringify(U.applies_to||[]).includes(c)||f&&U.created_by_feature!==f||h.push({kind:"business-rule",id:U.id,repo:U.repo,path:U.path,summary:`Rule ${U.id} (${U.kind})`,sources:[]});if(y){let U=Ae(r.domainDir,[".yaml",".yml"],200);for(let ie of U)try{let ae=oe(L(ie)),re=String(ae.domain||ae.name||"");if(!re||i&&!re.toLowerCase().includes(i)||f&&ae.created_by_feature!==f)continue;h.push({kind:"domain",id:re,path:jo(t.rootDir,ie),summary:String(ae.description||`Domain ${re}`).slice(0,200),sources:[]})}catch{}}if($){let U=Ae(r.capabilityDir,[".yaml",".yml"],50);for(let ie of U)try{let ae=oe(L(ie)),re=String(ae.product||"");if(i&&!re.toLowerCase().includes(i))continue;h.push({kind:"capability-map",id:re||Mo(ie,".yaml"),path:jo(t.rootDir,ie),summary:`Capability map for ${re||Mo(ie,".yaml")}`,sources:[]})}catch{}}let M=h.length;return{ok:!0,data:{results:h.slice(0,g),total:M,next_step:M>g?`narrow filter or increase limit; matched ${M}, returned ${g}`:""},sideEffects:[],reportFragments:[`cdr.query matched ${M} asset(s)`]}}},wr={id:"cdr.pipeline.status",version:"1.0.0",inputSchema:{required:["repo"],properties:{repo:{type:"string",minLength:1},up_to_phase:{type:"string",enum:["profile","entries","behavior","state","domain","rule","capability-map","doc","all"]}},additionalProperties:!1},async execute(t,e){X(e,["repo"]);let n=V(t.rootDir),r=be(t.rootDir),i=String(e.repo),a=an(n.reposDir,i),s=String(e.up_to_phase||"all");if(!Ot(a))throw new A("REPO_MISSING",`repos/${i} not found`);let c=ce(t.rootDir),p=c.behaviors.filter(se=>se.repo===i),f=c.state_machines.filter(se=>se.repo===i),u=c.business_rules.filter(se=>se.repo===i),l=[],d=Ot(an(r.profilesDir,`${i}.yaml`));l.push({id:"profile",status:d?"done":"blocked",artifacts_count:d?1:0,next_action:d?void 0:{capability:"cdr.profile",input_template:{repo:i,required_fields:[{name:"repo",type:"string",description:"the repo name (as registered in repos.yaml)"}]},hint:"start the pipeline by writing the L0 tech profile"}});let g=an(r.entriesDir,`${i}.yaml`),h=Ot(g)?No(L(g)):null,v=h&&Array.isArray(h.entries)?h.entries.length:0,_=(h&&Array.isArray(h.entries)?h.entries.filter(se=>se.status==="confirmed").length:0)>0,y=!d;l.push({id:"entries",status:y?"blocked":_?"done":"blocked",artifacts_count:v,next_action:y||_?void 0:{capability:"cdr.entries.candidate",input_template:{repo:i,required_fields:[{name:"repo",type:"string",description:"the repo name"}]},hint:v>0?"AI: read candidate files, then cdr.entries.propose per entry with sources[]":"no candidate entries yet \u2014 engine will list code files"}}),l.push({id:"behavior",status:y?"blocked":p.length>0?"done":"blocked",artifacts_count:p.length,next_action:y||p.length>0?void 0:{capability:"cdr.behavior.upsert",input_template:{repo:i,required_fields:[{name:"id",type:"string",description:"behavior id, e.g. 'order-create'"},{name:"repo",type:"string",description:"the repo name"},{name:"entry",type:"object",description:"HTTP/method/path or similar"},{name:"confidence",type:"object",description:"kind=fact requires sources[]"}]},hint:"trace each confirmed entry's calls/writes/events; one behavior per logical action"}});let $=f.length;l.push({id:"state",status:p.length===0?"blocked":$>0?"done":"blocked",artifacts_count:$,next_action:p.length===0||$>0?void 0:{capability:"cdr.state.derive",input_template:{repo:i,required_fields:[{name:"entity",type:"string",description:"entity name, e.g. 'Order'"},{name:"behaviors",type:"array",description:"behavior ids for this entity"}]},hint:"pick a central entity (Order / Payment / etc) and derive its lifecycle"}});let S=Ot(r.domainDir)?Qa(r.domainDir).some(se=>se.endsWith(".yaml")||se.endsWith(".yml")):!1;l.push({id:"domain",status:p.length===0?"blocked":S?"done":"blocked",artifacts_count:S?1:0,next_action:p.length===0||S?void 0:{capability:"cdr.domain.compose",input_template:{repo:i,required_fields:[{name:"domain",type:"string",description:"kebab-case name"},{name:"description",type:"string",description:"1-2 sentence summary"},{name:"derived_from",type:"array",description:"behavior ids (P1 red line)"}]},hint:"cluster behaviors by entity / responsibility; derived_from required"}}),l.push({id:"rule",status:u.length>0?"done":"skipped",artifacts_count:u.length,next_action:u.length>0?void 0:{capability:"cdr.business.compose",input_template:{repo:i,required_fields:[{name:"id",type:"string",description:"rule id, kebab-case"},{name:"kind",type:"string",description:"invariant / constraint / authorization / sla / compensation"},{name:"applies_to",type:"array",description:"behavior ids this rule constrains"}]},hint:"optional but valuable when SLA / authorization / compensation patterns exist"}});let F=Ot(an(r.capabilityDir,"product-map.yaml"));l.push({id:"capability-map",status:F?"done":"blocked",artifacts_count:F?1:0,next_action:F?void 0:{capability:"cdr.capability.map.init",input_template:{required_fields:[{name:"product",type:"string",description:"the product this map belongs to"},{name:"capabilities",type:"array",description:"list of {id, name, spans_repos, ...}"}]},hint:"wire domains into the L1 capability map"}});let M=Ot(an(t.rootDir,".dapei","docs-portal","index.md"));l.push({id:"doc",status:F&&M?"done":"blocked",artifacts_count:M?1:0,next_action:!F||M?void 0:{capability:"cdr.doc.generate",input_template:{required_fields:[]},hint:"render the VitePress portal at .dapei/docs-portal/"}});let Y=s==="all"?l:l.filter(se=>{let de=["profile","entries","behavior","state","domain","rule","capability-map","doc"];return de.indexOf(se.id)<=de.indexOf(s)}),U=Y.filter(se=>se.status==="done"||se.status==="skipped").length,ie=Y.filter(se=>se.status==="done").length,ae=U===Y.length?"complete":ie===0?"empty":"partial",re=ae==="complete"?"all phases done; portal generated":ae==="empty"?`start with ${l[0].next_action?.capability||"cdr.profile"}`:Y.find(se=>se.status!=="done"&&se.status!=="skipped")?.next_action?.hint||"continue with the next unfinished phase";return{ok:!0,data:{repo:i,phases:Y,overall_status:ae,next_step:re},sideEffects:[],reportFragments:[`pipeline status for ${i}: ${ae} (${ie}/${Y.length})`]}}};import{existsSync as kr}from"node:fs";import{isAbsolute as Xa,join as zo}from"node:path";function ec(t){let e=zo(t,".dapei","audit","capability.log");if(!kr(e))return[];let n=L(e).split(`
`).filter(Boolean),r=[];for(let i of n)try{let a=JSON.parse(i);r.push(a)}catch{}return r}var Sr={id:"cdr.feature.link",version:"2.0.0",inputSchema:{required:["feature"],properties:{feature:{type:"string",minLength:1},repo:{type:"string"},mode:{type:"string",enum:["audit","backfill"]}},additionalProperties:!1},async execute(t,e){X(e,["feature"]);let n=String(e.feature),r=e.repo?String(e.repo):void 0,i=e.mode?String(e.mode):"audit",a=t.now.toISOString(),s=ce(t.rootDir),c=be(t.rootDir),p=0;if(i==="audit"){let f=ec(t.rootDir),u=new Set,l=!1;for(let d of f)if(d.feature===n&&d.schema_version==="2.0"&&!(!Array.isArray(d.artifactPaths)||d.artifactPaths.length===0)){l=!0;for(let g of d.artifactPaths)typeof g=="string"&&g.length>0&&u.add(g)}if(l)for(let d of u){let g=Xa(d)?d:zo(t.rootDir,d);kr(g)&&tc(g,n,a,r)&&p++}else p=qo(t,s,c,n,r,a)}else p=qo(t,s,c,n,r,a);return Ne(t.rootDir,s),{ok:!0,data:{feature:n,repo:r||"*",mode:i,assets_tagged:p},sideEffects:["cognitive index updated","docs/as-is tagged"],reportFragments:[`linked ${p} asset(s) to feature ${n} (mode=${i})`],artifactPaths:[]}}};function tc(t,e,n,r){try{let i=oe(L(t));if(r){let a=String(i.repo||"");if(a&&a!==r)return!1}return i.created_by_feature===e?!1:(i.created_by_feature=e,i.updated_by_feature=e,i.created_at=n,i.updated_at=n,R(t,ve(i)),!0)}catch{return!1}}function qo(t,e,n,r,i,a){let s=0,c=u=>{let l=0,d=u.map(g=>i&&g.repo&&g.repo!==i||g.created_by_feature&&g.created_by_feature!==r||g.created_by_feature===r?g:(l++,{...g,created_by_feature:r,created_at:a}));return s+=l,d};e.behaviors=c(e.behaviors),e.state_machines=c(e.state_machines),e.business_rules=c(e.business_rules);let p=t.rootDir,f=(u,l)=>{if(kr(u))for(let d of Ae(u,[".yaml",".yml"],200))try{let g=oe(L(d));l(g,d)}catch{}};return f(n.domainDir,(u,l)=>{if(i){let d=String(u.repo||"");if(d&&d!==i)return}u.created_by_feature!==r&&(u.created_by_feature=r,u.created_at=a,R(l,ve(u)),s++)}),f(n.capabilityDir,(u,l)=>{u.created_by_feature!==r&&(u.created_by_feature=r,u.created_at=a,R(l,ve(u)),s++)}),f(n.businessRulesDir,(u,l)=>{if(i){let d=String(u.repo||"");if(d&&d!==i)return}u.created_by_feature!==r&&(u.created_by_feature=r,u.created_at=a,R(l,ve(u)),s++)}),f(n.profilesDir,(u,l)=>{if(i){let d=String(u.repo||"");if(d&&d!==i)return}u.created_by_feature!==r&&(u.created_by_feature=r,u.created_at=a,R(l,ve(u)),s++)}),s}import{existsSync as Yo,readdirSync as nc}from"node:fs";import{join as Mt}from"node:path";var Ar={id:"cdr.behavior.upsert",version:"1.0.0",inputSchema:{required:["id","entry","confidence"],properties:{id:{type:"string",minLength:1},repo:{type:"string"},entry:{type:"object"},steps:{type:"array"},writes:{type:"array"},events:{type:"array"},calls:{type:"array"},risks:{type:"array"},confidence:{type:"object"},sources:{type:"array"},derived_from:{type:"array"},reason:{type:"string"}},additionalProperties:!1},async execute(t,e){let n={id:String(e.id),entry:e.entry};if(e.repo&&(n.repo=String(e.repo)),Array.isArray(e.steps)&&(n.steps=e.steps),Array.isArray(e.writes)&&(n.writes=e.writes),Array.isArray(e.events)&&(n.events=e.events.map(l=>String(l))),Array.isArray(e.calls)&&(n.calls=e.calls.map(l=>{if(typeof l=="string")return l;if(l&&typeof l=="object"&&!Array.isArray(l)){let d=l;if(typeof d.target!="string"||!d.target.trim())throw new A("INVALID_INPUT","calls[0].target is required");if(d.protocol!==void 0&&(typeof d.protocol!="string"||!["http","grpc","mq","sql","function"].includes(d.protocol)))throw new A("INVALID_INPUT",`structured call protocol must be one of http|grpc|mq|sql|function, got: ${String(d.protocol)}`);return d}throw new A("INVALID_INPUT","call entries must be strings or objects")})),Array.isArray(e.risks)&&(n.risks=e.risks.map(l=>String(l))),Array.isArray(e.sources)&&(n.sources=e.sources),Array.isArray(e.derived_from)&&(n.derived_from=e.derived_from.map(l=>String(l))),e.reason&&(n.reason=String(e.reason)),n.confidence=e.confidence,Array.isArray(n.calls)&&e.repo){let l=new pt(t.rootDir);if(l.isAvailable()){let d=Mt(V(t.rootDir).reposDir,String(e.repo));for(let g=0;g<n.calls.length;g++){let h=n.calls[g];if(!h||typeof h!="object")continue;let v=h,b=v.evidence;if(!b||typeof b.file!="string")continue;let _=l.refs(d,{file:String(b.file),line:typeof b.line=="number"?b.line:void 0});if(!_.available)continue;let y=String(v.target);if(!_.callees.some(S=>!!(S.name===y||S.name.endsWith("."+y))))throw new A("INVALID_EVIDENCE",`calls[${g}].target '${y}' not found in codegraph refs at ${b.file}:${b.line||0}`)}}}let r=dt(t,n);if(r.length)throw new A("INVALID_EVIDENCE",r.join("; "));let i=Ye("behavior",n);if(i.length)throw new A("INVALID_ARTIFACT",i.join("; "));let a=be(t.rootDir);J(a.behaviorDir);let s=mt("behavior",n),c=Mt(t.rootDir,s),p=Ue(n,He(t,"create")),f=ve(p);R(c,f.endsWith(`
`)?f:`${f}
`);let u=ce(t.rootDir);return ct(u,"behavior",s,p),Ne(t.rootDir,u),{ok:!0,data:{type:"behavior",path:s,id:n.id,kind:e.confidence.kind},sideEffects:["behavior upserted","index updated"],reportFragments:[`upserted behavior ${n.id}`],artifactPaths:[s]}}};function rc(t){let e=new Set,n=[],r=String(t.id||"unknown");if(Array.isArray(t.writes))for(let i of t.writes)i.operation==="insert"&&e.add("CREATED");if(Array.isArray(t.events))for(let i of t.events){let a=String(i),s=a.split("."),p=(s[s.length-1]||"").toUpperCase().replace(/[^A-Z0-9_]/g,"_");p&&p!=="CREATED"&&e.add(p),n.push({trigger:a,from:"[*]",to:p||"TBD",behavior_id:r})}return{states:e,transitions:n}}var $r={id:"cdr.state.derive",version:"1.0.0",inputSchema:{required:["entity","behaviors"],properties:{entity:{type:"string",minLength:1},behaviors:{type:"array"},repo:{type:"string"},sources:{type:"array"}},additionalProperties:!1},async execute(t,e){X(e,["entity","behaviors"]);let n=String(e.entity),r=Array.isArray(e.behaviors)?e.behaviors.map($=>String($)):[],i=e.repo?String(e.repo):void 0;if(!r.length)throw new A("INVALID_INPUT","behaviors[] must contain at least one behavior ID");let a=be(t.rootDir),s=new Set,c=[],p=[],f=[];for(let $ of r){let S=Mt(a.behaviorDir,`${$}.yaml`),F=null;if(Yo(S))F=S;else{let ie=nc(a.behaviorDir).filter(ae=>{try{return Yo(Mt(a.behaviorDir,ae,`${$}.yaml`))}catch{return!1}});ie.length>0&&(F=Mt(a.behaviorDir,ie[0],`${$}.yaml`))}if(!F){f.push($);continue}let M=oe(L(F));p.push(String(M.id||$));let{states:Y,transitions:U}=rc(M);Y.forEach(ie=>s.add(ie)),U.forEach(ie=>c.push(ie))}if(f.length)throw new A("NOT_FOUND",`behaviors not found on disk: ${f.join(", ")}. Run cdr.behavior.upsert first.`);s.size||(s.add("CREATED"),s.add("ACTIVE"),s.add("CLOSED"));let u=[...s],l=u[0],d={entity:n,states:u,transitions:c,confidence:{level:"medium",kind:"inference",evidence_type:"inferred_from_behaviors"},derived_from:p,initial_state:l};i&&(d.repo=i),Array.isArray(e.sources)&&(d.sources=e.sources);let g=dt(t,d);if(g.length)throw new A("INVALID_EVIDENCE",g.join("; "));let h=Ye("state-machine",d);if(h.length)throw new A("INVALID_ARTIFACT",h.join("; "));let v=mt("state-machine",d),b=Mt(t.rootDir,v),_=Ue(d,He(t,"create"));R(b,ve(_));let y=ce(t.rootDir);return ct(y,"state-machine",v,_),Ne(t.rootDir,y),{ok:!0,data:{type:"state-machine",path:v,entity:n,states:u,transitions:c,derived_from:p,confidence:d.confidence,note:"inference-level draft \u2014 Agent must confirm before kind=fact"},sideEffects:["state machine draft written","index updated"],reportFragments:[`derived state machine for ${n} from ${p.length} behavior(s)`],artifactPaths:[v]}}};import{existsSync as ze,readdirSync as Go}from"node:fs";import{execFileSync as ic}from"node:child_process";import{join as Pe}from"node:path";function Uo(t,e){return ne("git",["-C",t,"rev-parse","HEAD"],e)||""}function Vo(t,e,n){if(!n)return new Set;let r=ne("git",["-C",t,"diff","--name-only",`${n}..HEAD`],e);return r?new Set(r.trim().split(`
`).filter(Boolean)):new Set}var Cr={id:"cdr.asset.stalecheck",version:"1.0.0",inputSchema:{properties:{repo:{type:"string"},clear_stale:{type:"boolean"}},additionalProperties:!1},async execute(t,e){let n=V(t.rootDir),r=e.repo?String(e.repo):void 0,i=e.clear_stale===!0,a=ce(t.rootDir),s=[];if(r){let l=Pe(n.reposDir,r);if(!ze(l))throw new A("REPO_MISSING",`repos/${r} not found`);s.push(r)}else for(let l of Go(n.reposDir)){let d=Pe(n.reposDir,l);ze(Pe(d,".git"))&&s.push(l)}let c=t.now.toISOString(),p=[],f=[];for(let l of s){let d=Pe(n.reposDir,l),g=Uo(d,n.rootDir);if(!g)continue;let h=Fi(a,l),v=h?.commit_hash,b={repo:l,commit_hash:g,committed_at:ne("git",["-C",d,"log","-1","--format=%ci","--","HEAD"],n.rootDir)||c,analyzed_at:c,source_snapshots:h?.source_snapshots||{}};if(v&&v!==g){let y=Vo(d,n.rootDir,v);if(y.size>0){b.source_snapshots={...b.source_snapshots};for(let $ of y)b.source_snapshots[$]=g}}Bi(a,b);let _=[];for(let y of a.behaviors)_.push({id:y.id,path:y.path,repo:y.repo,artifact_type:"behavior"});for(let y of a.state_machines)_.push({id:y.entity,path:y.path,repo:y.repo,artifact_type:"state-machine"});for(let y of a.domains)_.push({id:y.domain,path:y.path,repo:y.repo,artifact_type:"domain"});for(let y of a.business_rules)_.push({id:y.id,path:y.path,repo:y.repo,artifact_type:"business-rule"});for(let y of _){if(r&&y.repo!==r)continue;let $=Pe(t.rootDir,y.path);if(!ze($))continue;let S=oe(L($)),F=Array.isArray(S.sources)?S.sources:[];if(!F.length||(y.repo||S.repo)!==l)continue;let Y=[];for(let U of F){if(!U||typeof U!="object"||Array.isArray(U))continue;let ie=U,ae=typeof ie.file=="string"?ie.file.trim():"";if(!ae)continue;let re=h?.source_snapshots[ae]||v||"";!re||!(v?Vo(d,n.rootDir,re):new Set).has(ae)||Y.push({file:ae,last_valid_commit:re,current_commit:g,reason:"new_commits"})}if(Y.length>0){let U={id:y.id,artifact_type:y.artifact_type==="capability-map"?"domain":y.artifact_type,path:y.path,repo:l,stale_sources:Y,checked_at:c};Ni(a,U),p.push(U)}else i&&(Oi(a,y.id),f.push(y.id))}}Ne(t.rootDir,a);let u=[];if(u.push(`## Stale Asset Check \u2014 ${c}`),u.push(""),p.length===0)u.push("\u2705 No stale assets detected.");else{u.push(`\u26A0\uFE0F  ${p.length} artifact(s) have stale sources:`);for(let l of p){u.push(`
### ${l.id} [${l.artifact_type}]`);for(let d of l.stale_sources)u.push(`  - ${d.file}: changed since ${d.last_valid_commit.slice(0,8)}`)}}return f.length>0&&u.push(`
\u2705 Cleared stale flag for: ${f.join(", ")}`),{ok:!0,data:{checked_at:c,repos_checked:s,stale_count:p.length,stale_assets:p,cleared_count:f.length,cleared:f,report:u.join(`
`)},sideEffects:p.length>0?["index updated with stale assets"]:f.length>0?["stale flags cleared"]:[],reportFragments:[`${p.length} stale asset(s) detected${f.length>0?`, ${f.length} cleared`:""}`]}}},xr={id:"cdr.architecture.driftcheck",version:"1.0.0",inputSchema:{properties:{feature:{type:"string"},repo:{type:"string"}},additionalProperties:!1},async execute(t,e){let n=V(t.rootDir),r=e.feature?String(e.feature):void 0,i=e.repo?String(e.repo):void 0,a=ce(t.rootDir),s=t.now.toISOString(),c=[],p=[];if(i)p.push(i);else if(r){let u=Pe(n.featuresDir,r),l=Pe(u,"feature.yaml");if(ze(l))for(let d of Ze(L(l)))p.push(d)}else for(let u of Go(n.reposDir)){let l=Pe(n.reposDir,u);ze(Pe(l,".git"))&&p.push(u)}for(let u of p){let l=Pe(n.reposDir,u);if(!ze(Pe(l,".git"))||!Uo(l,n.rootDir))continue;let g=a.behaviors.filter(v=>v.repo===u),h=a.state_machines.filter(v=>v.repo===u);for(let v of g){let b=Pe(t.rootDir,v.path);if(!ze(b)){c.push({id:v.id,artifact_type:"behavior",repo:u,path:v.path,drift_type:"file_missing",detail:"artifact references a file that no longer exists"});continue}let _=oe(L(b)),y=Array.isArray(_.sources)?_.sources:[];for(let $ of y){if(!$||typeof $!="object"||Array.isArray($))continue;let S=$,F=typeof S.file=="string"?S.file.trim():"";if(!F)continue;let M=Pe(t.rootDir,"repos",u,F);ze(M)||c.push({id:v.id,artifact_type:"behavior",repo:u,path:v.path,drift_type:"source_file_deleted",detail:`source file ${F} was deleted`})}}for(let v of h){let b=Pe(t.rootDir,v.path);ze(b)||c.push({id:v.entity,artifact_type:"state-machine",repo:u,path:v.path,drift_type:"file_missing",detail:"artifact file no longer exists"})}}let f=[];if(f.push(`## Architecture Drift Check \u2014 ${s}`),f.push(""),c.length===0)f.push("\u2705 No architecture drift detected."),f.push(""),f.push("All behavior and state machine artifacts are consistent with current code.");else{f.push(`\u26A0\uFE0F  ${c.length} drift item(s) detected:`);for(let u of c)f.push(`
### ${u.id} [${u.artifact_type}] (${u.repo})`),f.push(`  - **Type**: ${u.drift_type}`),f.push(`  - **Detail**: ${u.detail}`),f.push(`  - **Path**: ${u.path}`);f.push(""),f.push("**Recommendation**: Run `@dapei discover behaviors for <repo>` to re-analyze drifted areas.")}return{ok:!0,data:{checked_at:s,repos_checked:p,drift_count:c.length,drift_items:c,report:f.join(`
`)},sideEffects:[],reportFragments:[`${c.length} drift item(s) detected across ${p.length} repo(s)`]}}};function oc(t,e,n){let r=ce(t.rootDir),i=[],a=(s,c,p,f)=>{if(c&&e&&c!==e||!Array.isArray(p))return;let u=[];for(let l of p){if(!l||typeof l!="object")continue;let d=l,g=typeof d.file=="string"?d.file:"";g&&n.has(g)&&u.push(g)}u.length>0&&i.push({id:s,entity:s,reason:`${f} sources[] intersect with the diff`,reason_paths:u})};for(let s of r.behaviors){let c=Pe(t.rootDir,s.path);if(!ze(c))continue;let p;try{p=oe(L(c))}catch{continue}a(String(p.id||s.id),s.repo,p.sources,"behavior")}for(let s of r.state_machines){let c=Pe(t.rootDir,s.path);if(!ze(c))continue;let p;try{p=oe(L(c))}catch{continue}a(String(p.entity||s.entity),s.repo,p.sources,"state-machine")}for(let s of r.business_rules){let c=Pe(t.rootDir,s.path);if(!ze(c))continue;let p;try{p=oe(L(c))}catch{continue}a(String(p.id||s.id),s.repo,p.sources,"business-rule")}return i}function Dr(t,e,n){try{return ic("git",["diff","--name-only",`${e}..${n}`,"--"],{cwd:t,encoding:"utf8"}).split(`
`).map(i=>i.trim()).filter(Boolean)}catch{return[]}}var Rr={id:"cdr.stale.scan",version:"1.0.0",inputSchema:{properties:{repo:{type:"string"},base:{type:"string"},head:{type:"string"}},additionalProperties:!1},async execute(t,e){let n=typeof e.repo=="string"?e.repo:void 0,r=typeof e.head=="string"?e.head:"HEAD",i=typeof e.base=="string"?e.base:"HEAD~1";if(!n)throw new A("INVALID_INPUT","cdr.stale.scan requires { repo } to scope the diff");let a=V(t.rootDir),s=Pe(a.reposDir,n);if(!ze(s))throw new A("REPO_MISSING",`repos/${n} not found`);let c=[],p="git-diff";try{let h=new pt(t.rootDir);if(h.isAvailable()){let v=h.impact(s,i,r);v.available?c=v.changed_files:c=Dr(s,i,r)}else c=Dr(s,i,r)}catch{c=Dr(s,i,r)}if(c.length===0)return{ok:!0,data:{repo:n,base:i,head:r,backend:p,changed_files:0,marked:0,stale:[]},sideEffects:["no changes detected; nothing to mark stale"],reportFragments:[`cdr.stale.scan: 0 changed files in ${n} (${i}..${r})`]};let f=new Set(c),u=oc(t,n,f),l=ce(t.rootDir),d=new Date().toISOString(),g=0;for(let h of u){let v=l.state_machines.find(y=>y.entity===h.id&&(!n||y.repo===n));if(v){v.stale=!0,v.stale_reason=h.reason,v.stale_at=d,v.stale_base=`${i}..${r}`,g++;continue}let b=l.behaviors.find(y=>y.id===h.id&&(!n||y.repo===n));if(b){b.stale=!0,b.stale_reason=h.reason,b.stale_at=d,b.stale_base=`${i}..${r}`,g++;continue}let _=l.business_rules.find(y=>y.id===h.id&&(!n||y.repo===n));if(_){_.stale=!0,_.stale_reason=h.reason,_.stale_at=d,_.stale_base=`${i}..${r}`,g++;continue}}return Ne(t.rootDir,l),{ok:!0,data:{repo:n,base:i,head:r,backend:p,changed_files:c.length,stale:u,marked:g},sideEffects:g>0?[`marked ${g} cognitive asset(s) stale`]:[],reportFragments:[`cdr.stale.scan: ${c.length} changed file(s) in ${n} (${i}..${r}) via ${p}`,g>0?`${g} asset(s) marked stale`:"no assets match the change set"]}}};import{existsSync as Er}from"node:fs";import{basename as Ho,join as nt,relative as tt}from"node:path";var Wo=new Set(["invariant","constraint","authorization","sla","compensation"]),Ir={id:"cdr.business.crosslink",version:"1.0.0",inputSchema:{properties:{min_confidence:{type:"string",enum:["low","medium","high"]},kinds:{type:"array"},include_intra_repo:{type:"boolean"}},additionalProperties:!1},async execute(t,e){let n=be(t.rootDir),r=ce(t.rootDir),i=typeof e.min_confidence=="string"?String(e.min_confidence):"low",a={low:0,medium:1,high:2},s=a[i]??0,c=Array.isArray(e.kinds)&&e.kinds.length>0?new Set(e.kinds.map(M=>String(M)).filter(M=>Wo.has(M))):Wo,p=e.include_intra_repo===!0;if(!Er(n.businessRulesDir)){let M=nt(n.docsDir,"as-is","cross-repo");J(M);let Y=nt(M,"cross-links.yaml"),U={generated_at:t.now.toISOString(),product:n.workspaceName,total_rules:0,cross_repo_rules:0,intra_repo_rules:0,groups:[],filter:{min_confidence:i,kinds:[...c],include_intra_repo:p}},ie=ve(U);return R(Y,ie.endsWith(`
`)?ie:`${ie}
`),{ok:!0,data:{path:tt(t.rootDir,Y),total_rules:0,cross_repo_rules:0,intra_repo_rules:0,by_kind:{},rules:[],skipped:[]},sideEffects:[`cross-link view written: ${tt(t.rootDir,Y)}`],reportFragments:["no business rules indexed yet \u2014 emitted empty cross-link view"]}}let f=Ae(n.businessRulesDir,[".yaml",".yml"],200),u=[],l=[];for(let M of f){if(Ho(M).startsWith("_"))continue;let Y;try{Y=oe(L(M))}catch{u.push({file:tt(t.rootDir,M),reason:"unparseable"});continue}let U=String(Y.id||Ho(M,".yaml")),ie=String(Y.kind||"unknown");if(!c.has(ie)){u.push({file:tt(t.rootDir,M),reason:`kind ${ie} not in filter`});continue}let ae=Y.confidence,re=String(ae?.kind||"unknown"),se=String(ae?.level||"unknown");if((a[se]??0)<s){u.push({file:tt(t.rootDir,M),reason:`confidence ${se} < ${i}`});continue}let de=Array.isArray(Y.applies_to)?Y.applies_to:[],_e=[],pe=new Set;for(let E of de){let le=String(E),De=r.behaviors.find(Me=>Me.id===le);De?(_e.push({behavior:le,repo:De.repo}),De.repo&&pe.add(De.repo)):(_e.push({behavior:le,repo:void 0}),u.push({file:tt(t.rootDir,M),reason:`applies_to id '${le}' not in cognitive index`}))}let ye=pe.size>1,j=pe.size===1;!ye&&!j||!p&&j||l.push({id:U,kind:ie,description:String(Y.description||Y.expr||""),applies_to:_e,covered_repos:[...pe].sort(),evidence_kind:re,evidence_level:se})}l.sort((M,Y)=>M.kind!==Y.kind?M.kind.localeCompare(Y.kind):M.id.localeCompare(Y.id));let d=l.filter(M=>M.covered_repos.length>1),g=l.filter(M=>M.covered_repos.length<=1),h={};for(let M of l)h[M.kind]=(h[M.kind]||0)+1;let v=nt(n.dapeiDir,"workspace.yaml"),b=n.workspaceName;if(Er(v))try{let Y=oe(L(v)).workspace;Y&&typeof Y.name=="string"&&(b=String(Y.name))}catch{}let _=[];for(let M of l){let Y=_.find(U=>U.kind===M.kind);Y?Y.rules.push(M):_.push({kind:M.kind,rules:[M]})}let y=nt(n.docsDir,"as-is","cross-repo");J(y);let $=nt(y,"cross-links.yaml"),S={generated_at:t.now.toISOString(),product:b,total_rules:l.length,cross_repo_rules:d.length,intra_repo_rules:g.length,groups:_,filter:{min_confidence:i,kinds:[...c],include_intra_repo:p}},F=ve(S);return R($,F.endsWith(`
`)?F:`${F}
`),{ok:!0,data:{path:tt(t.rootDir,$),total_rules:l.length,cross_repo_rules:d.length,intra_repo_rules:g.length,by_kind:h,rules:l,skipped:u},sideEffects:[`cross-link view written: ${tt(t.rootDir,$)}`],reportFragments:[`cross-linked ${l.length} rule(s) (${d.length} cross-repo, ${g.length} intra-repo)`,u.length?`${u.length} rule(s) skipped \u2014 see report for reasons`:"no rules skipped"]}}};function Zo(t){return t.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")}function sc(t){let e=[];for(let n=0;n<t.applies_to.length-1;n++){let r=t.applies_to[n],i=t.applies_to[n+1],a=`${r.behavior}@${r.repo||"?"}`,s=`${i.behavior}@${i.repo||"?"}`,c=a.replace(/[^a-zA-Z0-9_]/g,"_"),p=s.replace(/[^a-zA-Z0-9_]/g,"_");e.push(`  ${c}["${a}"] -- "${t.kind}: ${t.id}" --> ${p}["${s}"]`)}return e}function Ko(t){let e=new Map;for(let r of t.applies_to){let i=r.repo||"unknown";e.has(i)||e.set(i,[]),e.get(i).push(r.behavior)}let n=[];for(let[r,i]of e.entries()){n.push(`  subgraph ${r.replace(/[^a-zA-Z0-9_]/g,"_")}`);for(let a of i){let s=`${a}@${r}`.replace(/[^a-zA-Z0-9_]/g,"_");n.push(`    ${s}["${a}@${r}"]`)}n.push("  end")}return n.push(...sc(t)),n}var Pr={id:"cdr.crossrepo.doc.generate",version:"1.0.0",inputSchema:{properties:{output_dir:{type:"string"}},additionalProperties:!1},async execute(t,e){let n=V(t.rootDir),r=be(t.rootDir),i=nt(n.rootDir,typeof e.output_dir=="string"?String(e.output_dir):".dapei/docs-portal"),a=nt(r.docsDir,"as-is","cross-repo","cross-links.yaml");if(!Er(a))throw new A("FILE_MISSING",`${tt(t.rootDir,a)} not found \u2014 run cdr.business.cross_link first`);let s=oe(L(a)),c=Array.isArray(s.groups)?s.groups:[],p=String(s.product||n.workspaceName),f=nt(i,"cross-repo");J(f);let u=`---
title: Cross-Repo Business Rules
---

# Cross-Repo Business Rules

> Auto-generated from business-rule artifacts. Each rule here was authored by the AI, validated by the engine (P1 red line: \`kind=fact\` requires \`sources[]\`), and clustered here because it spans more than one repository.

- **Product:** ${p}
- **Generated:** ${String(s.generated_at||"")}
- **Total rules:** ${String(s.total_rules||0)}
- **Cross-repo:** ${String(s.cross_repo_rules||0)}
- **Intra-repo (filtered out):** ${String(s.intra_repo_rules||0)}

## Grouped by kind

`;for(let l of c){u+=`### ${l.kind} (${l.rules.length})

`;for(let d of l.rules)u+=`- [${d.id}](/cross-repo/${Zo(d.id)}) \u2014 spans ${d.covered_repos.join(", ")}
`;u+=`
`}u+=`## Event Graph (cross-repo only)

`,u+="```mermaid\ngraph LR\n";for(let l of c)for(let d of l.rules)d.covered_repos.length>1&&(u+=Ko(d).join(`
`)+`
`);u+="```\n",R(nt(f,"index.md"),u);for(let l of c)for(let d of l.rules){let g=Zo(d.id),h=`---
title: "${d.id}"
---

# ${d.id}

- **Kind:** \`${d.kind}\`
- **Confidence:** ${d.evidence_kind} (${d.evidence_level})
- **Covered repos:** ${d.covered_repos.map(v=>`\`${v}\``).join(", ")}

${d.description}

## Applies To

| Behavior | Repo |
|----------|------|
${d.applies_to.map(v=>`| \`${v.behavior}\` | ${v.repo?`\`${v.repo}\``:"_(unknown \u2014 not in cognitive index)_"} |`).join(`
`)}

## Mermaid

\`\`\`mermaid
graph LR
${Ko(d).join(`
`)}
\`\`\`
`;R(nt(f,`${g}.md`),h)}return{ok:!0,data:{output_dir:typeof e.output_dir=="string"?String(e.output_dir):".dapei/docs-portal",section:"cross-repo",pages_generated:1+c.reduce((l,d)=>l+d.rules.length,0),rules_rendered:c.reduce((l,d)=>l+d.rules.length,0)},sideEffects:["cross-repo portal section generated"],reportFragments:[`generated cross-repo portal section under ${tt(n.rootDir,f)}`]}}};import{existsSync as Bn}from"node:fs";import{basename as Fn,join as cn,relative as At}from"node:path";var ac=2,cc=50,lc=8;function pc(t,e){let n=e&&e.length>0?new Set(e):void 0,r=[];for(let i of t.behaviors)n&&(!i.repo||!n.has(i.repo))||r.push({key:`${i.id}@${i.repo||"unknown"}`,id:i.id,repo:i.repo||"unknown",events:i.events||[],writes:i.writes||[],targetRepos:i.target_repos||[]});return r}function dc(t,e){let n=[];for(let r=0;r<t.length;r++)for(let i=r+1;i<t.length;i++){let a=t[r],s=t[i],c=a.events.filter(d=>s.events.includes(d));c.length>0&&n.push({a:a.key,b:s.key,type:"shared-events",weight:4,detail:`shared event(s): ${c.join(", ")}`});let p=a.writes.filter(d=>s.writes.includes(d));p.length>0&&n.push({a:a.key,b:s.key,type:"shared-writes",weight:3,detail:`shared write target(s): ${p.join(", ")}`});let f=a.targetRepos.includes(s.repo),u=s.targetRepos.includes(a.repo);if(f||u){let d=f?`${a.repo}\u2192${s.repo}`:`${s.repo}\u2192${a.repo}`;n.push({a:a.key,b:s.key,type:"cross-repo-calls",weight:2,detail:`cross-repo call: ${d}`})}e.get(a.key)?.includes(s.key)&&n.push({a:a.key,b:s.key,type:"business-rule",weight:1,detail:"co-applied by some business-rule applies_to"})}return n}function uc(t,e){let n=new Map,r=s=>{let c=n.get(s);if(!c||c===s)return n.set(s,s),s;let p=r(c);return n.set(s,p),p},i=(s,c)=>{let p=r(s),f=r(c);p!==f&&n.set(p,f)};for(let s of t)n.set(s.key,s.key);for(let s of e)i(s.a,s.b);let a=new Map;for(let s of t){let c=r(s.key);a.has(c)||a.set(c,[]),a.get(c).push(s)}return[...a.values()]}function fc(t,e){let n=new Map,r=be(e);if(!Bn(r.businessRulesDir))return new Map;let i=Ae(r.businessRulesDir,[".yaml",".yml"],200);for(let s of i){if(Fn(s).startsWith("_"))continue;let c;try{c=oe(L(s))}catch{continue}let p=Array.isArray(c.applies_to)?c.applies_to:[],f=[];for(let u of p){let l=String(u),d=t.behaviors.find(h=>h.id===l),g=d?`${d.id}@${d.repo||"unknown"}`:`${l}@unknown`;l&&f.push(g)}for(let u=0;u<f.length;u++)for(let l=u+1;l<f.length;l++){let d=f[u],g=f[l];n.has(d)||n.set(d,new Set),n.has(g)||n.set(g,new Set),n.get(d).add(g),n.get(g).add(d)}}let a=new Map;for(let[s,c]of n.entries())a.set(s,[...c]);return a}function gc(t,e){let n=new Map;for(let l of t)for(let d of l.events){let g=d.split(/[.:]/)[0].trim();g&&n.set(g,(n.get(g)||0)+1)}let r="",i=0;for(let[l,d]of n.entries())(d>i||d===i&&l.localeCompare(r)<0)&&(r=l,i=d);let a=new Set(t.map(l=>l.repo)),s=a.size>1,c=new Set(e.map(l=>l.type)),p=[];r&&p.push(`most-common event subject: '${r}'`),s&&p.push(`spans repos: ${[...a].sort().join(", ")}`),c.has("shared-events")&&p.push("behaviors share event names"),c.has("cross-repo-calls")&&p.push("cross-repo calls"),c.has("shared-writes")&&p.push("behaviors write the same tables"),c.has("business-rule")&&p.push("linked by business-rule applies_to");let f=s?"Cross-Repo: ":"",u=r?r.charAt(0).toUpperCase()+r.slice(1):"Cluster";return{name:`${f}${u}`,reason:p.join("; ")||"no edge evidence recorded"}}function mc(t,e){let r=new Set(t.map(a=>a.repo)).size>1,i=new Set(e.map(a=>a.type));return i.has("shared-events")&&r?"high":i.has("shared-events")||i.has("shared-writes")?"medium":"low"}function hc(t){let e=new Map;for(let n of t)e.has(n.repo)||e.set(n.repo,[]),e.get(n.repo).push(n);return[...e.values()]}var Lr={id:"cdr.domain.suggest",version:"1.0.0",inputSchema:{properties:{repos:{type:"array"},min_size:{type:"number"},max_size:{type:"number"},max_clusters:{type:"number"}},additionalProperties:!1},async execute(t,e){let n=ce(t.rootDir),r=Array.isArray(e.repos)?e.repos.map(S=>String(S)):void 0,i=typeof e.min_size=="number"?Number(e.min_size):ac,a=typeof e.max_size=="number"?Number(e.max_size):cc,s=typeof e.max_clusters=="number"?Number(e.max_clusters):lc,c=pc(n,r),p=fc(n,t.rootDir),f=dc(c,p),u=uc(c,f),l=[],d=[];for(let S of u)if(!(S.length<i))if(S.length>a)for(let F of hc(S))F.length>=i&&d.push(F);else l.push(S);l.sort((S,F)=>F.length-S.length);let h=l.slice(0,s).map(S=>{let F=f.filter(de=>S.some(_e=>_e.key===de.a)&&S.some(_e=>_e.key===de.b)),M=new Set(F.map(de=>de.type)),{name:Y,reason:U}=gc(S,F),ie=mc(S,F),ae=[...new Set(S.map(de=>de.repo))].sort(),re=S.map(de=>de.key).sort(),se=[];if(M.has("shared-events")){let de=new Map;for(let _e of S)for(let pe of _e.events)de.has(pe)||de.set(pe,[]),de.get(pe).push(_e.key);for(let[_e,pe]of[...de.entries()].sort())pe.length>=2&&se.push({type:"shared-events",detail:_e,behaviors:pe})}if(M.has("cross-repo-calls"))for(let de of F.filter(_e=>_e.type==="cross-repo-calls"))se.push({type:"cross-repo-calls",detail:de.detail,behaviors:[de.a,de.b]});if(M.has("shared-writes")){let de=new Map;for(let _e of S)for(let pe of _e.writes)de.has(pe)||de.set(pe,[]),de.get(pe).push(_e.key);for(let[_e,pe]of[...de.entries()].sort())pe.length>=2&&se.push({type:"shared-writes",detail:_e,behaviors:pe})}return M.has("business-rule")&&se.push({type:"business-rule",detail:"co-applied by business rules"}),{suggested_name:Y,suggested_domain_slug:nn(Y),naming_reason:U,confidence:ie,behavior_keys:re,repos:ae,evidence:se,size:S.length}}),v=yc(t.rootDir),b={generated_at:t.now.toISOString(),product:v,algorithm_version:"1.0.0",parameters:{repos:r||[],min_size:i,max_size:a,max_clusters:s},behavior_count:c.length,edge_count:f.length,raw_cluster_count:u.length,reported_cluster_count:h.length,clusters:h,note:"These are SUGGESTIONS, not committed domains. To turn a cluster into a real domain, the AI reviews it, picks a stable name, and calls `cdr.domain.compose` with the cluster's behavior keys as `behaviors[]`. The suggestion file is overwritten on each `cdr.domain.suggest` call; composed domains under `docs/as-is/domains/` are never touched."},_=cn(t.rootDir,"docs","as-is","cross-repo");J(_);let y=cn(_,"domain-suggestions.yaml"),$=ve(b);return R(y,$.endsWith(`
`)?$:`${$}
`),{ok:!0,data:{path:At(t.rootDir,y),behavior_count:c.length,edge_count:f.length,raw_cluster_count:u.length,reported_cluster_count:h.length,clusters:h},sideEffects:[`domain-suggestions written: ${At(t.rootDir,y)}`],reportFragments:[`cdr.domain.suggest: ${h.length} cluster(s) reported from ${c.length} behavior(s) (${f.length} edge(s))`,`${u.length-h.length} cluster(s) dropped (below min_size or capped)`]}}};function yc(t){let e=cn(t,".dapei","workspace.yaml");if(Bn(e))try{let r=oe(L(e)).workspace;if(r&&typeof r.name=="string")return String(r.name)}catch{}return Fn(t)}function bc(t,e){let n=new Set,r=0,i=0;for(let s of e){let c=t.behaviors.find(p=>p.id===s);c&&(c.repo&&n.add(c.repo),i++,c.kind==="fact"&&r++)}let a=i>0?r/i:0;return{repos:[...n].sort(),behaviorCount:i,factRatio:a}}function vc(t,e){if(!Bn(e.domainDir))return[];let n=[],r=Ae(e.domainDir,[".yaml",".yml"],200);for(let i of r){if(Fn(i).startsWith("_"))continue;let a;try{a=oe(L(i))}catch{continue}let s=String(a.name||a.domain||Fn(i,".yaml"));if(!s)continue;let c=Array.isArray(a.derived_from)?a.derived_from.map(p=>String(p)):[];n.push({name:s,description:String(a.description||""),behavior_ids:c,repos:[],behavior_count:c.length,fact_ratio:0,source:"composed"})}return n}function _c(t,e){let n=cn(e.docsDir,"as-is","cross-repo","domain-suggestions.yaml");if(!Bn(n))return[];let r;try{r=oe(L(n))}catch{return[]}let i=Array.isArray(r.clusters)?r.clusters:[],a=[];for(let s of i){let c=s,p=Array.isArray(c.behavior_keys)?c.behavior_keys.map(f=>String(f)):[];a.push({name:String(c.suggested_name||c.suggested_domain_slug||"Cluster"),description:`Suggested from cluster: ${String(c.naming_reason||"(no reason recorded)")}`,behavior_ids:p,repos:Array.isArray(c.repos)?c.repos.map(f=>String(f)):[],behavior_count:p.length,fact_ratio:0,source:"suggested"})}return a}function wc(t,e,n){let r=new Map;for(let i of t)r.set(i.name,i);for(let i of e)r.has(i.name)||r.set(i.name,i);for(let i of n)r.has(i.name)||r.set(i.name,i);return[...r.values()].sort((i,a)=>i.name.localeCompare(a.name))}function kc(t){return/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/i.test(t)?{ok:!0}:{ok:!1,error:`capability id '${t}' must be lowercase, multi-segment (e.g., 'core.checkout'), no underscores`}}var Tr={id:"cdr.capability.map.synth",version:"1.0.0",inputSchema:{required:["product"],properties:{product:{type:"string",minLength:1},capabilities:{type:"array"},manual_domains:{type:"array"},use_suggested_domains:{type:"boolean"},include_cross_repo_rules:{type:"boolean"}},additionalProperties:!1},async execute(t,e){let n=String(e.product),r=Array.isArray(e.capabilities)?e.capabilities:[],i=Array.isArray(e.manual_domains)?e.manual_domains:[],a=e.use_suggested_domains===!0,s=be(t.rootDir),c=ce(t.rootDir),p=i.map(S=>{let F=S&&typeof S=="object"?S:{};return{name:String(F.name||F.domain||""),description:String(F.description||""),behavior_ids:Array.isArray(F.behavior_ids)?F.behavior_ids.map(M=>String(M)):[],repos:[],behavior_count:0,fact_ratio:0,source:"manual"}}).filter(S=>S.name),f=vc(t.rootDir,s),u=a?_c(t.rootDir,s):[],l=wc(p,f,u),d=new Map;for(let S of l){let F=bc(c,S.behavior_ids);d.set(S.name,{...S,repos:F.repos,behavior_count:F.behaviorCount,fact_ratio:F.factRatio})}let g=[],h=[];if(r.length===0)for(let S of d.values()){let F=`domain.${nn(S.name)}`;g.push({id:F,name:S.name,description:S.description||`Capability synthesized from domain '${S.name}'`,domains:[S.name],spans_repos:S.repos,behavior_count:S.behavior_count,fact_ratio:Number(S.fact_ratio.toFixed(2)),source:S.source})}else for(let S of r){let F=S&&typeof S=="object"?S:{},M=String(F.id||""),Y=kc(M);if(!Y.ok){h.push(Y.error||`invalid capability id: ${M}`);continue}let U=Array.isArray(F.domains)?F.domains.map(pe=>String(pe)):[],ie=U.map(pe=>d.get(pe)).filter(pe=>!!pe),ae=new Set,re=0,se=0,de=new Set;for(let pe of ie){for(let ye of pe.repos)ae.add(ye);for(let ye of pe.behavior_ids)if(!de.has(ye)){de.add(ye);let j=c.behaviors.find(E=>E.id===ye);j&&(re++,j.kind==="fact"&&se++)}}let _e=re>0?se/re:0;g.push({id:M,name:String(F.name||M),description:String(F.description||""),domains:U,spans_repos:[...ae].sort(),behavior_count:re,fact_ratio:Number(_e.toFixed(2)),source:"manual"})}if(h.length>0)throw new A("INVALID_INPUT",h.join("; "));let v=rn(t.rootDir);J(v);let b=cn(v,"product-map.yaml");if(g.length===0){let S={product:n,generated_at:t.now.toISOString(),synthesized_by:"cdr.capability.map.synth@1.0.0",status:"empty",message:"no domains composed yet \u2014 run cdr.domain.compose (or cdr.domain.suggest) before cdr.capability.map.synth",capabilities:[]};return R(b,ve(S)),{ok:!0,data:{product:n,path:At(t.rootDir,b),capability_count:0,domain_count:d.size,domain_sources:{manual:p.length,composed:f.length,suggested:u.length},capabilities:[]},sideEffects:[`empty capability map written: ${At(t.rootDir,b)}`],reportFragments:[`cdr.capability.map.synth: 0 capability(s) \u2014 no domains available for '${n}'`,"run cdr.domain.compose or cdr.domain.suggest to seed domains first"]}}let _={product:n,generated_at:t.now.toISOString(),synthesized_by:"cdr.capability.map.synth@1.0.0",capabilities:g},y=Ye("capability-map",_);if(y.length)throw new A("INVALID_ARTIFACT",y.join("; "));R(b,ve(_));let $=ce(t.rootDir);return ct($,"capability-map",At(t.rootDir,b),_),Ne(t.rootDir,c),{ok:!0,data:{product:n,path:At(t.rootDir,b),capability_count:g.length,domain_count:d.size,domain_sources:{manual:p.length,composed:f.length,suggested:u.length},capabilities:g},sideEffects:[`capability map synthesized: ${At(t.rootDir,b)}`],reportFragments:[`cdr.capability.map.synth: ${g.length} capability(s) from ${d.size} domain(s) for '${n}'`,`domain sources \u2014 manual: ${p.length}, composed: ${f.length}, suggested: ${u.length}`]}}};import{existsSync as jt}from"node:fs";import{join as bt,relative as Fr}from"node:path";function Jo(t){return t.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")}function Qo(t){let e=String(t.id||""),n=String(t.name||e),r=e.replace(/[^a-zA-Z0-9_]/g,"_"),i=[];i.push(`  subgraph ${r}["${n}"]`);let a=Array.isArray(t.spans_repos)?t.spans_repos.map(s=>String(s)):[];if(a.length===0)i.push(`    ${r}_empty["(no repos)"]`);else for(let s of a){let c=s.replace(/[^a-zA-Z0-9_]/g,"_");i.push(`    ${r}_${c}["${s}"]`)}return i.push("  end"),i}function Sc(t){if(t.length===0)return`graph TD
  empty[No capabilities synthesized yet]`;let e=["graph TD"];for(let n of t)e.push(...Qo(n));return e.join(`
`)}var Br={id:"cdr.reversecluster.doc.generate",version:"1.0.0",inputSchema:{properties:{output_dir:{type:"string"}},additionalProperties:!1},async execute(t,e){let n=V(t.rootDir),r=be(t.rootDir),i=bt(n.rootDir,typeof e.output_dir=="string"?String(e.output_dir):".dapei/docs-portal"),a=bt(r.docsDir,"as-is","capabilities","product-map.yaml");if(!jt(a))throw new A("FILE_MISSING",`${Fr(t.rootDir,a)} not found \u2014 run cdr.capability.map.synth first`);let s=oe(L(a)),c=String(s.product||n.workspaceName),p=String(s.status||"")==="empty",f=Array.isArray(s.capabilities)?s.capabilities:[],u=bt(i,"l1");J(u);let l=`---
title: L1 Capability Map
---

# L1 Capability Map

> Auto-generated from \`docs/as-is/capabilities/product-map.yaml\` (synthesized via \`cdr.capability.map.synth\`). Each capability here was either authored by the AI (manual mode) or synthesized by the engine from composed/suggested domains, with spans_repos / behavior_count / fact_ratio back-filled from the cognitive index.

- **Product:** ${c}
- **Generated:** ${String(s.generated_at||"")}
- **Synthesized by:** ${String(s.synthesized_by||"\u2014")}
- **Capability count:** ${f.length}

## Total Graph

\`\`\`mermaid
${Sc(f)}
\`\`\`

## Capabilities

| ID | Spans Repos | Behavior Count | Fact Ratio | Source |
|----|-------------|----------------|------------|--------|
`;if(p)l+=`| _none yet_ | \u2014 | \u2014 | \u2014 | \u2014 |

`,l+=`> **Status:** empty \u2014 ${String(s.message||"no domains composed yet")}.

`;else for(let g of f){let h=String(g.id||"(missing id)"),v=Array.isArray(g.spans_repos)&&g.spans_repos.map($=>String($)).join(", ")||"\u2014",b=g.behavior_count!==void 0?String(g.behavior_count):"\u2014",_=g.fact_ratio!==void 0?String(g.fact_ratio):"\u2014",y=String(g.source||"\u2014");l+=`| [\`${h}\`](/l1/${Jo(h)}) | ${v} | ${b} | ${_} | ${y} |
`}if(l+=`
## How this was synthesized

`,l+=`- **Source:** \`${Fr(t.rootDir,a)}\`
`,l+=`- **Cluster suggestions:** ${jt(bt(r.docsDir,"as-is","cross-repo","domain-suggestions.yaml"))?"[view](/l1/cluster-suggestions)":"_no cluster suggestions run yet_"}
`,l+=`- **Re-run:** \`runCapability('cdr.capability.map.synth', { product: '${c}' }, ctx)\`
`,R(bt(u,"index.md"),l),!p)for(let g of f){let h=String(g.id||"");if(!h)continue;let v=String(g.name||h),b=String(g.description||""),_=Array.isArray(g.spans_repos)?g.spans_repos.map(Y=>String(Y)):[],y=Array.isArray(g.domains)?g.domains.map(Y=>String(Y)):[],$=String(g.source||"\u2014"),S=g.behavior_count!==void 0?String(g.behavior_count):"\u2014",F=g.fact_ratio!==void 0?String(g.fact_ratio):"\u2014",M=`---
title: "${h}"
---

# Capability: ${v}

- **ID:** \`${h}\`
- **Source:** ${$}
- **Spans repos:** ${_.length>0?_.map(Y=>`\`${Y}\``).join(", "):"_(none)_"}
- **Behavior count:** ${S}
- **Fact ratio:** ${F}

${b||"_no description provided_"}

## Domains

${y.length>0?y.map(Y=>`- \`${Y}\``).join(`
`):"_no domains attached_"}

## Mermaid

\`\`\`mermaid
${Qo(g).join(`
`)}
\`\`\`
`;R(bt(u,`${Jo(h)}.md`),M)}let d=bt(r.docsDir,"as-is","cross-repo","domain-suggestions.yaml");if(jt(d)){let g=oe(L(d)),h=Array.isArray(g.clusters)?g.clusters:[],v=`---
title: Cluster Suggestions
---

# Cluster Suggestions (from cdr.domain.suggest)

> Read-only suggestions emitted by the engine's reverse-cluster pass. These are **not** committed domains \u2014 to turn any cluster into a real domain, the AI calls \`cdr.domain.compose\` with the cluster's behavior keys.

- **Product:** ${String(g.product||c)}
- **Generated:** ${String(g.generated_at||"")}
- **Algorithm version:** ${String(g.algorithm_version||"\u2014")}
- **Behavior count considered:** ${String(g.behavior_count||0)}
- **Edge count:** ${String(g.edge_count||0)}
- **Reported clusters:** ${String(g.reported_cluster_count||0)}

## Clusters

| Suggested Name | Confidence | Size | Repos | Naming Reason |
|----------------|------------|------|-------|---------------|
`;for(let b of h){let _=b,y=String(_.suggested_name||_.suggested_domain_slug||"Cluster"),$=String(_.confidence||"low"),S=String(_.size||(Array.isArray(_.behavior_keys)?_.behavior_keys.length:0)),F=Array.isArray(_.repos)?_.repos.map(Y=>String(Y)).join(", "):"\u2014",M=String(_.naming_reason||"\u2014");v+=`| ${y} | ${$} | ${S} | ${F} | ${M} |
`}v+=`
## Note

${String(g.note||"")}
`,R(bt(u,"cluster-suggestions.md"),v)}return{ok:!0,data:{output_dir:typeof e.output_dir=="string"?String(e.output_dir):".dapei/docs-portal",section:"l1",pages_generated:1+(p?0:f.length)+(jt(d)?1:0),capabilities_rendered:p?0:f.length,suggestions_rendered:jt(d)?1:0},sideEffects:["l1 portal section generated"],reportFragments:[`generated l1 portal section under ${Fr(n.rootDir,u)}`,`${p?0:f.length} capability page(s)${jt(d)?" + cluster suggestions":""}`]}}};import{existsSync as pn}from"node:fs";import{isAbsolute as Ac,join as ln}from"node:path";var Nr={id:"cdr.bootstrap",version:"1.0.0",inputSchema:{required:["repo"],properties:{repo:{type:"string",minLength:1},profile:{type:"boolean"},entry_discovery:{type:"boolean"}},additionalProperties:!1},async execute(t,e){X(e,["repo"]);let n=V(t.rootDir),r=String(e.repo),i=e.profile===void 0?!0:!!e.profile,a=e.entry_discovery===void 0?!0:!!e.entry_discovery;if(!pn(n.dapeiDir))throw new A("WORKSPACE_MISSING",`workspace not initialized at ${n.rootDir}`);let s=ln(n.reposDir,r);if(!pn(ln(s,".git")))throw new A("REPO_MISSING",`repos/${r} not found in workspace`);let c=null;i&&(c=(await sn.execute(t,{repo:r})).data.path);let p=0;if(a){let l=(await Nt.execute(t,{repo:r})).data;p=typeof l.file_count=="number"?l.file_count:Array.isArray(l.files)?l.files.length:0}return{ok:!0,data:{repo:r,profile_path:c,candidate_files_count:p,next_step:a?"AI: read candidate files, then call cdr.entries.propose with sources[] for each entry":"done; next: cdr.entries.candidate or skip to behavior mining"},sideEffects:[...i?[`profile written: ${c}`]:[],...a?[`entry discovery: ${p} files`]:[]],reportFragments:[`bootstrap ${r} ${i?"+ profile":""} ${a?"+ entry discovery":""}`.trim()]}}},Xo=500,$c=10,Dc=5,Nn=8*1024;function Cc(t){if(!pn(t))return"";let e;try{e=L(t)}catch{return""}let n=e.match(/^---\n([\s\S]*?)\n---\n?/),r=n?e.slice(n[0].length):e,i=[],a=r.split(/\r?\n/),s=[];for(let p of a){if(p.trim()===""){if(s.length&&(i.push(s.join(" ").trim()),s=[],i.length>=3))break;continue}s.push(p.trim())}s.length&&i.push(s.join(" ").trim());let c=i.slice(0,2).join(" / ");return c.length<=Xo?c:c.slice(0,Xo-1)+"\u2026"}function xc(t){if(!pn(t))return[];let e;try{e=L(t)}catch{return[]}let n=e.match(/^---\n([\s\S]*?)\n---\n?/);if(!n)return[];let r=n[1],i=[];if(!/^sources:\s*$/m.test(r)&&!/^evidence:\s*$/m.test(r))return[];let s=/^\s*-\s+(.+?)$/gm,c,p=[];for(;(c=s.exec(r))!==null;)p.push(c[1]);for(let f of p){let u=f.match(/file:\s*["']?([^"',}\s]+)/);if(!u)continue;let l=f.match(/line:\s*(\d+)/),d=f.match(/symbol(?:_handle)?:\s*["']?([^"',}\s]+)/),g=f.match(/repo:\s*["']?([^"',}\s]+)/);if(i.push({file:u[1],line:l?Number(l[1]):void 0,symbol:d?d[1]:void 0,repo:g?g[1]:void 0}),i.length>=$c)break}return i}function Rc(t,e,n,r){let i=new Set,a=s=>!r||s.repo===r;if(e==="behavior"){for(let s of t.state_machines)a(s)&&i.add(`sm:${s.entity}`);for(let s of t.domains)a(s)&&i.add(`domain:${s.domain}`);for(let s of t.business_rules)a(s)&&i.add(`rule:${s.id}`)}else if(e==="state-machine"){for(let s of t.state_machines)s.entity!==n&&a(s)&&i.add(`sm:${s.entity}`);for(let s of t.behaviors)a(s)&&i.add(`behavior:${s.id}`)}else if(e==="domain"){for(let s of t.domains)s.domain!==n&&a(s)&&i.add(`domain:${s.domain}`);for(let s of t.behaviors)a(s)&&i.add(`behavior:${s.id}`)}else if(e==="business-rule")for(let s of t.business_rules)s.id!==n&&a(s)&&i.add(`rule:${s.id}`);else if(e==="capability-map")for(let s of t.capability_maps)s.product!==n&&a(s)&&i.add(`cm:${s.product}`);else if(e==="entry")for(let s of t.behaviors)a(s)&&i.add(`behavior:${s.id}`);return i.delete(n),Array.from(i).slice(0,Dc)}var Or={id:"cdr.context.envelope",version:"1.0.0",inputSchema:{required:["target","id"],properties:{target:{type:"string",enum:["behavior","state-machine","domain","business-rule","entry","capability-map"]},id:{type:"string",minLength:1},repo:{type:"string"},include_evidence:{type:"boolean"},include_related:{type:"number"}},additionalProperties:!1},async execute(t,e){X(e,["target","id"]);let n=String(e.target),r=String(e.id),i=e.repo?String(e.repo):void 0,a=e.include_evidence!==!1,s=e.include_related,c=typeof s=="number"?s:1,p=be(t.rootDir),f=ce(t.rootDir),u=n==="behavior"?f.behaviors.find(y=>y.id===r&&(!i||y.repo===i)):n==="state-machine"?f.state_machines.find(y=>y.entity===r):n==="domain"?f.domains.find(y=>y.domain===r):n==="business-rule"?f.business_rules.find(y=>y.id===r):n==="capability-map"?f.capability_maps.find(y=>y.product===r):void 0,l,d;if(u&&(d=n==="behavior"||n==="state-machine"||n==="domain"||n==="business-rule"||n==="capability-map"?u.path:void 0,d&&(l=Ac(d)?d:ln(t.rootDir,d))),!l){let y=n==="behavior"?p.behaviorDir:n==="state-machine"?p.stateMachineDir:n==="domain"?p.domainDir:n==="business-rule"?p.businessRulesDir:n==="capability-map"?p.capabilityDir:n==="entry"?p.entriesDir:void 0;if(!y)throw new A("INVALID_INPUT",`unknown target: ${n}`);let $=n==="state-machine"||n==="domain"?r.toLowerCase().replace(/[^a-z0-9-]+/g,"-"):r;l=i?ln(y,i,`${$}.yaml`):ln(y,`${$}.yaml`)}if(!pn(l))return{ok:!1,data:null,sideEffects:[],reportFragments:[],error:{code:"ENVELOPE_NOT_FOUND",message:`envelope target not found: ${n}.${r}${i?` (repo=${i})`:""}`}};let g=Cc(l),h=a?xc(l):[],v=c>0?Rc(f,n,r,i):[],b={kind:"cognitive-asset-context",target:{type:n,id:r,...i?{repo:i}:{}},summary:g,evidence:h,related_ids:v,generated_at:new Date().toISOString()},_=JSON.stringify(b);if(_.length>Nn&&(b.related_ids=[],_=JSON.stringify(b)),_.length>Nn&&typeof b.summary=="string"){let y=_.length-Nn+16;b.summary=b.summary.slice(0,Math.max(0,b.summary.length-y))+"\u2026",_=JSON.stringify(b)}if(_.length>Nn){let y={kind:"cognitive-asset-context",target:b.target,summary:String(b.summary).slice(0,200),evidence:[],related_ids:[],generated_at:b.generated_at};_=JSON.stringify(y)}return{ok:!0,data:{envelope:JSON.parse(_)},sideEffects:[],reportFragments:[`cdr.context.envelope: ${n}.${r} (${_.length} bytes, ${h.length} evidence, ${v.length} related)`]}}};import{existsSync as vt,readdirSync as Ec}from"node:fs";import{join as te,relative as On,basename as he}from"node:path";function Oe(t){let e=t.confidence,n=String(e?.kind||"unknown");return n==="fact"?"\u{1F7E2} fact":n==="inference"?"\u{1F7E1} inference":"\u{1F534} unknown"}function Q(t){return String(t??"\u2014").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\|/g,"\\|").replace(/\n/g," ")}function Ic(t){let e=t.split(`
`),n=[],r=!1,i=/<\/?(?:BehaviorFlow|CodeLink|StateMachine)(?:\s|\/|>)/;for(let a of e){if(/^\s*(```|~~~)/.test(a)){r=!r,n.push(a);continue}if(r){n.push(a);continue}if(i.test(a)){n.push(a);continue}if(/&(?:lt|gt|amp|quot|#39);/.test(a)){n.push(a);continue}n.push(a.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"))}return n.join(`
`).replace(/&lt;(\/?(?:BehaviorFlow|CodeLink|StateMachine))(?=\s|\/|&gt;)/g,"<$1").replace(/&lt;(\/?(?:BehaviorFlow|CodeLink|StateMachine))&gt;/g,"<$1>")}function Pc(t){let e=["behaviors","states","domains","capabilities","profiles","business-rules"];for(let n of e){let r=te(t,n);if(!vt(r))continue;let i=Ae(r,[".md",".markdown"],500);for(let a of i){let s=L(a),c=Ic(s);c!==s&&R(a,c)}}}function z(t){return t.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")}function $t(t){if(!vt(t))return[];let e=[],n=Ae(t,[".yaml",".yml"],200);for(let r of n)if(!he(r).startsWith("_"))try{let i=L(r),a=oe(i),c=On(t,r).split("/"),p=c.length>=2?c[0]:void 0;e.push({file:r,doc:a,repo:p})}catch{}return e}function Lc(t,e,n,r,i,a=[]){let s=new Map;for(let b of t){let _=String(b.doc.id||he(b.file,".yaml"));_&&s.set(_,b)}let c=new Map;for(let b of e){let _=String(b.doc.name||b.doc.domain||he(b.file,".yaml"));_&&c.set(_,b)}let p=new Map;for(let b of n){let _=String(b.doc.entity||he(b.file,".yaml"));_&&p.set(_,b)}let f=new Map;for(let b of r){let _=String(b.doc.id||he(b.file,".yaml"));_&&f.set(_,b)}let u=new Map;for(let b of n){let _=b.doc.transitions;if(Array.isArray(_))for(let y of _){let $=y?.behavior_id;if(typeof $=="string"&&$){let S=u.get($)||[];S.push(b),u.set($,S)}}}let l=new Map;for(let b of t){let _=b.doc.derived_from;if(Array.isArray(_)){for(let y of _)if(!(typeof y!="string"||!y)&&c.has(y)){let $=l.get(y)||[];$.push(b),l.set(y,$)}}}let d=new Map;for(let b of r){let _=b.doc.applies_to;if(Array.isArray(_))for(let y of _){if(typeof y!="string"||!y)continue;let $=d.get(y)||[];$.push(b),d.set(y,$)}}let g=new Map;for(let b of r){let _=b.doc.derived_from;if(Array.isArray(_)){for(let y of _)if(!(typeof y!="string"||!y)&&c.has(y)){let $=g.get(y)||[];$.push(b),g.set(y,$)}}}let h=new Map;for(let b of i){let _=b.doc.capabilities;if(Array.isArray(_))for(let y of _){let $=y?.domains;if(Array.isArray($))for(let S of $){if(typeof S!="string"||!S)continue;let F=h.get(S)||[];F.push(y),h.set(S,F)}}}let v=new Map;for(let b of a){let _=String(b.doc.repo||b.repo||""),y=Array.isArray(b.doc.entries)?b.doc.entries:[];for(let $ of y){let S=typeof $.id=="string"&&$.id?$.id:"";S&&v.set(S,{repo:_,id:S})}}return{behaviorsById:s,domainsByName:c,statesByEntity:p,rulesById:f,statesByBehavior:u,behaviorsByDomain:l,rulesByBehavior:d,rulesByDomain:g,capabilitiesByDomain:h,entriesByBehaviorId:v}}function qt(t,e){let n=t.sources;if(!Array.isArray(n)||n.length===0)return"";let r=[`
## Sources
`];for(let i of n)if(typeof i=="string")r.push(`- \`${i}\``);else if(i&&typeof i=="object"){let a=i,s=String(a.file||"unknown"),c=typeof a.line=="number"?a.line:null,p=a.symbol_handle?String(a.symbol_handle):null,f=a.repo?String(a.repo):null,u=JSON.stringify({file:s,line:c,symbol_handle:p,repo:f}).replace(/'/g,"&#39;");r.push(`- <CodeLink :source='${u}' />`)}else r.push(`- \`${String(i)}\``);return r.join(`
`)+`
`}function Tc(t){if(!t.length)return"";let e=["```mermaid","graph TD"];for(let n=0;n<t.length;n++){let r=t[n],i=String(r.action||r.description||r.name||`Step ${n+1}`).replace(/"/g,"'"),a=`S${n}`;e.push(`  ${a}["${i}"]`),n>0&&e.push(`  S${n-1} --> ${a}`)}return e.push("```"),e.join(`
`)}function Fc(t,e){let n=["```mermaid","stateDiagram-v2"],r=t.map(i=>String(i));r.length>0&&n.push(`  [*] --> ${r[0]}`);for(let i of e){let a=i,s=String(a.from||"[*]"),c=String(a.to||"[*]"),p=a.trigger?`: ${String(a.trigger)}`:"";n.push(`  ${s} --> ${c}${p}`)}return n.push("```"),n.join(`
`)}function Bc(t){if(!t.length)return"";let e=["```mermaid","graph LR"];for(let n=0;n<t.length;n++){let r=t[n],i=String(r.name||r.id||`Module${n}`).replace(/"/g,"'");e.push(`  M${n}["${i}"]`);let a=r.depends_on||r.dependencies;if(Array.isArray(a))for(let s of a){let c=String(s),p=t.findIndex(f=>{let u=f;return String(u.name||u.id)===c});p>=0&&e.push(`  M${n} --> M${p}`)}}return e.push("```"),e.join(`
`)}function Nc(t,e,n){let r=Object.values(n).reduce((i,a)=>i+a,0);return`---
title: ${t} - Knowledge Portal
---

# ${t} \u2014 Knowledge Portal

> Auto-generated living documentation from code analysis.

## Overview

| Section | Count |
|---------|-------|
| Capabilities | ${n.capabilities} |
| Domains | ${n.domains} |
| Behaviors | ${n.behaviors} |
| State Machines | ${n.states} |
| Profiles | ${n.profiles} |
| **Total Pages** | **${r}** |

## Cognitive Index

- **Behaviors indexed:** ${e.behaviors.length}
- **State machines indexed:** ${e.state_machines.length}
- **Unknowns:** ${e.unknowns.length}
- **Last updated:** ${e.updated_at}

## Quick Links

- [Capabilities](/capabilities/) \u2014 L1 Capability Map
- [Domains](/domains/) \u2014 L2 Domain decomposition
- [Behaviors](/behaviors/) \u2014 L3 Behavior specifications
- [State Machines](/states/) \u2014 Entity state diagrams
- [Profiles](/profiles/) \u2014 Repository profiles
`}function Oc(t,e){let n=`---
title: Business Modules
---

# Business Modules \u2014 L2 Domain Roll-Up

> Auto-generated business-module abstraction. Each section corresponds to one composed domain, with its behaviors, business rules, and the state machines those behaviors drive.

`;if(t.length===0)return n+=`*No domain documents found.*
`,n;for(let r of t){let i=String(r.doc.name||r.doc.domain||he(r.file,".yaml")),a=String(r.doc.repo||"\u2014"),s=a!=="\u2014"?`/domains/${z(a)}/${z(i)}`:`/domains/${z(i)}`;n+=`## [${Q(i)}](${s})

`,n+=`- **Repo:** ${Q(a)}
`,n+=`- **Domain page:** [${Q(i)}](${s})
`;let c=e.behaviorsByDomain.get(i)||[];n+=`- **Behaviors in this domain:** ${c.length}
`;let p=e.rulesByDomain.get(i)||[];if(n+=`- **Business rules applying to this domain:** ${p.length}
`,c.length>0){n+=`
### Behaviors

`;for(let l of c){let d=String(l.doc.id||he(l.file,".yaml")),g=String(l.doc.repo||"\u2014"),h=g!=="\u2014"?`/behaviors/${z(g)}/${z(d)}`:`/behaviors/${z(d)}`;n+=`- [${Q(d)}](${h}) _(repo: ${Q(g)})_
`}}if(p.length>0){n+=`
### Business rules

`;for(let l of p){let d=String(l.doc.id||he(l.file,".yaml")),g=String(l.doc.kind||"\u2014"),h=String(l.doc.repo||"\u2014"),v=h!=="\u2014"?`/business-rules/${z(h)}/${z(d)}`:`/business-rules/${z(d)}`;n+=`- [${Q(d)}](${v}) _(${Q(g)}, repo: ${Q(h)})_
`}}let f=new Set,u=[];for(let l of c){let d=String(l.doc.id||he(l.file,".yaml")),g=e.statesByBehavior.get(d)||[];for(let h of g){let v=h.file;f.has(v)||(f.add(v),u.push(h))}}if(u.length>0){n+=`
### State machines driven by these behaviors

`;for(let l of u){let d=String(l.doc.entity||he(l.file,".yaml")),g=String(l.doc.repo||"\u2014"),h=g!=="\u2014"?`/states/${z(g)}/${z(d)}`:`/states/${z(d)}`;n+=`- [${Q(d)}](${h}) _(repo: ${Q(g)})_
`}}n+=`
`}return n}function Mc(t){let e=`---
title: Capabilities
---

# Capabilities \u2014 L1 Capability Map

`;if(t.length===0)return e+=`*No capability documents found.*
`,e;e+=`| Capability | Confidence | Description |
`,e+=`|------------|------------|-------------|
`;for(let n of t){let r=String(n.doc.id||n.doc.name||he(n.file,".yaml")),i=String(n.doc.description||n.doc.summary||"\u2014");e+=`| [${r}](/capabilities/${z(r)}) | ${Oe(n.doc)} | ${i} |
`}return e}function jc(t,e,n){let r=String(t.doc.id||t.doc.name||"unknown"),i=String(t.doc.description||t.doc.summary||""),a=`---
title: "${r}"
---

# Capability: ${r}

- **Confidence:** ${Oe(t.doc)}
`;if(i&&(a+=`
${i}
`),t.doc.sub_capabilities&&Array.isArray(t.doc.sub_capabilities)){a+=`
## Sub-capabilities

`;for(let s of t.doc.sub_capabilities)a+=`- **${String(s.id||s.name||"?")}** \u2014 ${String(s.description||"")}
`}if(n){let s=t.doc.domains||[];if(s.length>0){a+=`
## Contributing domains

`,a+=`| Domain |
`,a+=`|--------|
`;for(let p of s){let f=String(p),u=n.domainsByName.get(f),l=u?.repo?`/domains/${z(u.repo)}/${z(f)}`:`/domains/${z(f)}`;a+=`| [${Q(f)}](${l}) |
`}a+=`
`}let c=t.doc.spans_repos||[];if(c.length>0){a+=`
## Spans repos

`,a+=`| Repo |
`,a+=`|------|
`;for(let p of c){let f=String(p);a+=`| [${Q(f)}](/profiles/${z(f)}) |
`}a+=`
`}}return a+=qt(t.doc,e),a}function qc(t){let e=`---
title: Domains
---

# Domains \u2014 L2 Overview

`;if(t.length===0)return e+=`*No domain documents found.*
`,e;e+=`| Domain | Confidence | Description |
`,e+=`|--------|------------|-------------|
`;for(let n of t){let r=String(n.doc.name||n.doc.domain||he(n.file,".yaml")),i=String(n.doc.description||n.doc.summary||"\u2014");e+=`| [${r}](/domains/${z(r)}) | ${Oe(n.doc)} | ${i} |
`}return e}function zc(t,e,n){let r=String(t.doc.name||t.doc.domain||"unknown"),i=String(t.doc.description||t.doc.summary||""),a=`---
title: "${r}"
---

# Domain: ${r}

- **Confidence:** ${Oe(t.doc)}
`;i&&(a+=`
${i}
`);let s=t.doc.modules;if(Array.isArray(s)&&s.length>0){a+=`
## Modules

`;for(let c of s){let p=c;if(a+=`### ${String(p.name||p.id||"?")}

`,p.description&&(a+=`${String(p.description)}

`),p.responsibilities&&Array.isArray(p.responsibilities)){a+=`**Responsibilities:**

`;for(let f of p.responsibilities)a+=`- ${String(f)}
`;a+=`
`}}a+=`
## Module Relationships

`,a+=Bc(s),a+=`
`}if(n){let c=n.behaviorsByDomain.get(r)||[];if(c.length>0){a+=`
## Behaviors in this domain

`,a+=`| Behavior | Repo | Confidence |
`,a+=`|----------|------|------------|
`;for(let l of c){let d=String(l.doc.id||he(l.file,".yaml")),g=String(l.doc.repo||"\u2014"),h=g!=="\u2014"?`/behaviors/${z(g)}/${z(d)}`:`/behaviors/${z(d)}`;a+=`| [${Q(d)}](${h}) | ${Q(g)} | ${Oe(l.doc)} |
`}a+=`
`}let p=new Set,f=[];for(let l of c){let d=String(l.doc.id||he(l.file,".yaml")),g=n.statesByBehavior.get(d)||[];for(let h of g){let v=h.file;p.has(v)||(p.add(v),f.push(h))}}if(f.length>0){a+=`
## State machines driven by these behaviors

`,a+=`| Entity | Repo | Confidence |
`,a+=`|--------|------|------------|
`;for(let l of f){let d=String(l.doc.entity||he(l.file,".yaml")),g=String(l.doc.repo||"\u2014"),h=g!=="\u2014"?`/states/${z(g)}/${z(d)}`:`/states/${z(d)}`;a+=`| [${Q(d)}](${h}) | ${Q(g)} | ${Oe(l.doc)} |
`}a+=`
`}let u=n.rulesByDomain.get(r)||[];if(u.length>0){a+=`
## Business rules applying to this domain

`,a+=`| Rule | Kind | Confidence |
`,a+=`|------|------|------------|
`;for(let l of u){let d=String(l.doc.id||he(l.file,".yaml")),g=String(l.doc.kind||"\u2014"),h=String(l.doc.repo||"\u2014"),v=h!=="\u2014"?`/business-rules/${z(h)}/${z(d)}`:`/business-rules/${z(d)}`;a+=`| [${Q(d)}](${v}) | \`${Q(g)}\` | ${Oe(l.doc)} |
`}a+=`
`}}return a+=qt(t.doc,e),a}function Yc(t){let e=`---
title: Behaviors
---

# Behaviors \u2014 L3 Specifications

`;if(t.length===0)return e+=`*No behavior documents found.*
`,e;e+=`| Behavior | Repo | Confidence | Entry |
`,e+=`|----------|------|------------|-------|
`;for(let n of t){let r=String(n.doc.id||he(n.file,".yaml")),i=String(n.doc.repo||"\u2014"),a=n.doc.entry,s=a?`${String(a.type||"")} ${String(a.method||"")} ${String(a.path||a.handler||"")}`.trim():"\u2014",c=i!=="\u2014"?`/behaviors/${z(i)}/${z(r)}`:`/behaviors/${z(r)}`;e+=`| [${r}](${c}) | ${i} | ${Oe(n.doc)} | ${s} |
`}return e}function es(t){let e=new Map;for(let n of t){let r=n.doc.entry,i=r&&typeof r.type=="string"&&r.type?r.type:"other",a=e.get(i)||[];a.push(n),e.set(i,a)}return e}function Vc(t){let e=`---
title: Behaviors by Entry Type
---

# Behaviors by Entry Type

> Cross-cut view: behaviors grouped by their entry surface (api / mq / cron / rpc / cache / search / other).

`,n=es(t);if(n.size===0)return e+=`*No behavior documents found.*
`,e;e+=`| Entry type | Behavior count |
`,e+=`|------------|----------------|
`;let r=[...n.keys()].sort();for(let i of r)e+=`| [${Q(i)}](/behaviors/by-entry-type/${z(i)}) | ${n.get(i).length} |
`;return e}function Gc(t,e){let n=`---
title: "Behaviors \u2014 entry type: ${t}"
---

# Behaviors \u2014 entry type: \`${t}\`

> Back to [Behaviors by Entry Type index](/behaviors/by-entry-type/) \xB7 [All behaviors](/behaviors/)

`;if(e.length===0)return n+=`*No behaviors of this entry type.*
`,n;n+=`| Behavior | Repo | Path | Summary |
`,n+=`|----------|------|------|---------|
`;for(let r of e){let i=String(r.doc.id||he(r.file,".yaml")),a=String(r.doc.repo||"\u2014"),s=r.doc.entry,c=s?String(s.path||s.handler||"\u2014"):"\u2014",p=String(r.doc.description||r.doc.summary||"\u2014"),f=a!=="\u2014"?`/behaviors/${z(a)}/${z(i)}`:`/behaviors/${z(i)}`;n+=`| [${Q(i)}](${f}) | ${Q(a)} | \`${Q(c)}\` | ${Q(p)} |
`}return n}function Uc(t){let e=String(t.doc.repo||t.repo||he(t.file,".yaml")),n=Array.isArray(t.doc.entries)?t.doc.entries:[],r=`---
title: "Entries \u2014 ${e}"
---

# Confirmed Entries \u2014 ${e}

> Back to [Behaviors index](/behaviors/) \xB7 [All behaviors](/behaviors/)

- **Repo:** ${Q(e)}
- **Total entries:** ${n.length}

`;if(n.length===0)return r+=`*No entries recorded for this repo.*
`,r;r+=`| Entry | Type | Method | Path | Anchor | Line | Status | Summary |
`,r+=`|-------|------|--------|------|--------|------|--------|---------|
`;for(let i of n){let a=String(i.id||"?"),s=String(i.type||"\u2014"),c=i.method?String(i.method):"\u2014",p=i.path?String(i.path):"\u2014",f=String(i.anchor||"\u2014"),u=typeof i.line=="number"?String(i.line):"\u2014",l=String(i.status||"\u2014"),d=String(i.summary||"\u2014");r+=`| \`${Q(a)}\` | \`${Q(s)}\` | \`${Q(c)}\` | \`${Q(p)}\` | \`${Q(f)}\` | ${Q(u)} | \`${Q(l)}\` | ${Q(d)} |
`}return r}function Hc(t,e,n){let r=String(t.doc.id||"unknown"),i=String(t.doc.description||t.doc.summary||""),a=t.doc.entry,s=`---
title: "${r}"
---

# Behavior: ${r}

- **Confidence:** ${Oe(t.doc)}
- **Repo:** ${String(t.doc.repo||"\u2014")}
`;if(a){if(s+=`- **Entry:** ${String(a.type||"")} ${String(a.method||"")} ${String(a.path||a.handler||"")}`,n&&n.entriesByBehaviorId.has(r)){let g=n.entriesByBehaviorId.get(r);s+=` \u2014 see [entry catalog](/entries/${z(g.repo)}#${z(g.id)})`}s+=`
`}i&&(s+=`
${i}
`);let c=t.doc.steps;if(Array.isArray(c)&&c.length>0){s+=`
## Steps

`;let g=JSON.stringify(c).replace(/'/g,"&#39;");s+=`<BehaviorFlow :steps='${g}' />

`,s+=`<details><summary>Flowchart source</summary>

`,s+=Tc(c),s+=`
</details>
`}let p=t.doc.writes;if(Array.isArray(p)&&p.length>0){s+=`
## Writes

`,s+=`| Target | Operation | Fields |
`,s+=`|--------|-----------|--------|
`;for(let g of p){let h=g,v=Array.isArray(h.fields)?h.fields.join(", "):String(h.fields||"\u2014");s+=`| ${Q(h.target||h.table||"\u2014")} | ${Q(h.operation||"\u2014")} | ${Q(v)} |
`}}let f=t.doc.events;if(Array.isArray(f)&&f.length>0){s+=`
## Events

`;for(let g of f)s+=`- \`${String(g)}\`
`}let u=t.doc.calls,l=[];if(Array.isArray(u)&&u.length>0){s+=`
## Calls

`;for(let g of u){if(typeof g=="string"){s+=`- \`${g}\`
`;continue}if(!g||typeof g!="object"||Array.isArray(g))continue;let h=g,v=String(h.target||h.service||"?"),b=typeof h.protocol=="string"?h.protocol:"",_=typeof h.target_repo=="string"?h.target_repo:"",y=h.evidence&&typeof h.evidence=="object"?h.evidence:null,$=y?String(y.file||""):"",S=y&&typeof y.line=="number"?y.line:null,F=y&&typeof y.repo=="string"?y.repo:null,M=typeof h.method=="string"?` (${h.method})`:"";if(s+=`- **${v}**${M}`,b&&(s+=` \`[${b}]\``),s+=`
`,$){let Y=JSON.stringify({file:$,line:S,repo:F}).replace(/'/g,"&#39;");s+=`  - evidence: <CodeLink :source='${Y}' />
`}_&&l.push({target:v,protocol:b,targetRepo:_,evidenceFile:$,evidenceLine:S,evidenceRepo:F})}}if(l.length>0){s+=`
## Cross-service calls

`,s+=`This behavior calls into the following repos:

`,s+=`| Target | Protocol | Target repo | Evidence |
`,s+=`|--------|----------|-------------|----------|
`;for(let g of l){let h=g.evidenceFile?g.evidenceLine?`\`${g.evidenceFile}:${g.evidenceLine}\``:`\`${g.evidenceFile}\``:"\u2014";s+=`| ${Q(g.target)} | ${Q(g.protocol||"\u2014")} | ${Q(g.targetRepo)} | ${h} |
`}}if(n){let g=n.statesByBehavior.get(r)||[];if(g.length>0){s+=`
## Drives transitions

`,s+=`This behavior drives state transitions in:

`,s+=`| State machine | Repo |
`,s+=`|---------------|------|
`;for(let h of g){let v=String(h.doc.entity||he(h.file,".yaml")),b=String(h.doc.repo||"\u2014"),_=b!=="\u2014"?`/states/${z(b)}/${z(v)}`:`/states/${z(v)}`;s+=`| [${Q(v)}](${_}) | ${Q(b)} |
`}s+=`
`}}let d=t.doc.risks;if(Array.isArray(d)&&d.length>0){s+=`
## Risks

`;for(let g of d)if(typeof g=="string")s+=`- \u26A0\uFE0F ${g}
`;else{let h=g;s+=`- \u26A0\uFE0F **${String(h.name||h.type||"Risk")}** \u2014 ${String(h.description||h.detail||"")}
`}}return s+=qt(t.doc,e),s}function Wc(t){let e=`---
title: State Machines
---

# State Machines

`;if(t.length===0)return e+=`*No state machine documents found.*
`,e;e+=`| Entity | Repo | Confidence | States |
`,e+=`|--------|------|------------|--------|
`;for(let n of t){let r=String(n.doc.entity||he(n.file,".yaml")),i=String(n.doc.repo||"\u2014"),a=Array.isArray(n.doc.states)?n.doc.states.join(", "):"\u2014",s=i!=="\u2014"?`/states/${z(i)}/${z(r)}`:`/states/${z(r)}`;e+=`| [${r}](${s}) | ${i} | ${Oe(n.doc)} | ${a} |
`}return e}function Zc(t,e,n){let r=String(t.doc.entity||"unknown"),i=String(t.doc.repo||"\u2014"),a=`---
title: "${r}"
---

# State Machine: ${r}

- **Confidence:** ${Oe(t.doc)}
- **Repo:** ${i}
`,s=Array.isArray(t.doc.states)?t.doc.states:[],c=Array.isArray(t.doc.transitions)?t.doc.transitions:[];if(s.length>0){a+=`
## States

`;for(let p of s)a+=`- \`${String(p)}\`
`}if(c.length>0){a+=`
## Transitions

`,a+=`| From | To | Trigger | Behavior |
`,a+=`|------|----|---------|----------|
`;for(let p of c){let f=p,u=String(f.from||"\u2014"),l=String(f.to||"\u2014"),d=String(f.trigger||"\u2014"),g=typeof f.behavior_id=="string"?f.behavior_id:null,h="\u2014";if(g){let v=n?.behaviorsById.get(g);if(v){let b=String(v.doc.repo||"\u2014"),_=b!=="\u2014"?`/behaviors/${z(b)}/${z(g)}`:`/behaviors/${z(g)}`;h=`[${Q(g)}](${_})`}else h=`~~${Q(g)}~~ _(no behavior document)_`}a+=`| ${Q(u)} | ${Q(l)} | ${Q(d)} | ${h} |
`}}if(s.length>0||c.length>0){let p=String(t.doc.initial_state||s[0]||"");a+=`
## State Diagram

`;let f=JSON.stringify(s).replace(/'/g,"&#39;"),u=JSON.stringify(c).replace(/'/g,"&#39;");a+=`<StateMachine :entity='${JSON.stringify(r).replace(/'/g,"&#39;")}' :states='${f}' :transitions='${u}' :initial_state='${JSON.stringify(p).replace(/'/g,"&#39;")}' />

`,a+=`<details><summary>State diagram source</summary>

`,a+=Fc(s,c),a+=`
</details>
`}return a+=qt(t.doc,e),a}function Kc(t){let e=`---
title: Profiles
---

# Repository Profiles

`;if(t.length===0)return e+=`*No profile documents found.*
`,e;e+=`| Repository | Language | Description |
`,e+=`|------------|----------|-------------|
`;for(let n of t){let r=String(n.doc.repo||n.doc.name||he(n.file,".yaml")),i=String(n.doc.language||n.doc.stack||"\u2014"),a=String(n.doc.description||n.doc.summary||"\u2014");e+=`| [${r}](/profiles/${z(r)}) | ${i} | ${a} |
`}return e}function Jc(t,e){let n=String(t.doc.repo||t.doc.name||"unknown"),r=String(t.doc.description||t.doc.summary||""),i=`---
title: "${n}"
---

# Profile: ${n}

- **Language/Stack:** ${String(t.doc.language||t.doc.stack||"\u2014")}
- **Confidence:** ${Oe(t.doc)}
`;if(r&&(i+=`
${r}
`),t.doc.modules&&Array.isArray(t.doc.modules)){i+=`
## Modules

`;for(let a of t.doc.modules)i+=`- **${String(a.name||a.path||"?")}** \u2014 ${String(a.description||"")}
`}if(t.doc.dependencies&&Array.isArray(t.doc.dependencies)){i+=`
## Dependencies

`;for(let a of t.doc.dependencies)i+=`- ${String(a)}
`}return i+=qt(t.doc,e),i}function Qc(t){let e=`---
title: Business Rules
---

# Business Rules \u2014 Invariants, Constraints, Authorization, SLA, Compensation

`;if(t.length===0)return e+=`*No business rule documents found.*
`,e;e+=`| Rule | Kind | Confidence | Description |
`,e+=`|------|------|------------|-------------|
`;for(let n of t){let r=String(n.doc.id||he(n.file,".yaml")),i=String(n.doc.kind||"\u2014"),a=String(n.doc.description||n.doc.expr||"\u2014"),s=z(r),c=n.repo?`/business-rules/${z(n.repo)}/${s}`:`/business-rules/${s}`;e+=`| [${r}](${c}) | \`${i}\` | ${Oe(n.doc)} | ${Q(a)} |
`}return e}function ts(t){let e=new Map;for(let n of t){let r=typeof n.doc.kind=="string"&&n.doc.kind?n.doc.kind:"other",i=e.get(r)||[];i.push(n),e.set(r,i)}return e}function Xc(t){let e=`---
title: Business Rules by Kind
---

# Business Rules by Kind

> Cross-cut view: business rules grouped by their semantic kind (invariant / constraint / authorization / sla / compensation).

`,n=ts(t);if(n.size===0)return e+=`*No business rule documents found.*
`,e;e+=`| Kind | Rule count |
`,e+=`|------|-----------|
`;let r=[...n.keys()].sort();for(let i of r)e+=`| [${Q(i)}](/business-rules/by-kind/${z(i)}) | ${n.get(i).length} |
`;return e}function el(t,e){let n=`---
title: "Business Rules \u2014 kind: ${t}"
---

# Business Rules \u2014 kind: \`${t}\`

> Back to [Business Rules by Kind index](/business-rules/by-kind/) \xB7 [All business rules](/business-rules/)

`;if(e.length===0)return n+=`*No rules of this kind.*
`,n;n+=`| Rule | Repo | Applies to | Derived from | Description |
`,n+=`|------|------|-----------|--------------|-------------|
`;for(let r of e){let i=String(r.doc.id||he(r.file,".yaml")),a=String(r.doc.repo||"\u2014"),s=Array.isArray(r.doc.applies_to)?r.doc.applies_to.map(u=>String(u)).join(", "):"\u2014",c=Array.isArray(r.doc.derived_from)?r.doc.derived_from.map(u=>String(u)).join(", "):"\u2014",p=String(r.doc.description||r.doc.expr||"\u2014"),f=a!=="\u2014"?`/business-rules/${z(a)}/${z(i)}`:`/business-rules/${z(i)}`;n+=`| [${Q(i)}](${f}) | ${Q(a)} | ${Q(s)} | ${Q(c)} | ${Q(p)} |
`}return n}function tl(t,e,n){let r=String(t.doc.id||"unknown"),i=String(t.doc.kind||"unknown"),a=String(t.doc.description||""),s=String(t.doc.expr||""),c=`---
title: "${r}"
---

# Business Rule: ${r}

- **Kind:** \`${i}\`
- **Confidence:** ${Oe(t.doc)}
- **Repo:** ${String(t.doc.repo||"\u2014")}
`;a&&(c+=`
${a}
`),s&&(c+=`
## Expression

`,c+="```text\n"+s+"\n```\n");let p=t.doc.applies_to;if(Array.isArray(p)&&p.length>0){c+=`
## Applies To

`;for(let u of p){let l=String(u);if(n){let d=n.behaviorsById.get(l);if(d){let g=String(d.doc.repo||"\u2014"),h=g!=="\u2014"?`/behaviors/${z(g)}/${z(l)}`:`/behaviors/${z(l)}`;c+=`- [${Q(l)}](${h})
`;continue}}c+=`- \`${Q(l)}\`
`}}let f=t.doc.derived_from;if(Array.isArray(f)&&f.length>0){c+=`
## Derived From

`;for(let u of f){let l=String(u);if(n){let d=n.domainsByName.get(l);if(d){let g=String(d.doc.repo||"\u2014"),h=g!=="\u2014"?`/domains/${z(g)}/${z(l)}`:`/domains/${z(l)}`;c+=`- [${Q(l)}](${h})
`;continue}}c+=`- \`${Q(l)}\`
`}}return c+=qt(t.doc,e),c}function nl(t){return{l1:vt(te(t,"l1","index.md")),crossRepo:vt(te(t,"cross-repo","index.md")),businessModules:vt(te(t,"business-modules","index.md"))}}function rl(t,e,n,r){let i=JSON.stringify(n,null,6),a=JSON.stringify(r||[{text:"Home",link:"/"},{text:"Capabilities",link:"/capabilities/"},{text:"Domains",link:"/domains/"},{text:"Behaviors",link:"/behaviors/"},{text:"States",link:"/states/"},{text:"Business Rules",link:"/business-rules/"},{text:"Profiles",link:"/profiles/"}],null,6);return`import { defineConfig } from 'vitepress'

export default defineConfig({
  title: '${t} - Knowledge Portal',
  description: 'Auto-generated living documentation from code analysis',
  pages: ${i},
  themeConfig: {
    nav: ${a},
    sidebar: ${JSON.stringify(e,null,6)},
    search: { provider: 'local' }
  }
})
`}function il(){return`{
  "name": "dapei-docs-portal",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vitepress dev",
    "build": "vitepress build",
    "preview": "vitepress preview"
  },
  "devDependencies": {
    "vitepress": "^1.6.0",
    "vue": "^3.5.0"
  }
}
`}function ol(t){let e=import.meta.dirname||new URL(".",import.meta.url).pathname,n=te(e,"..","templates"),r=te(t,".vitepress","theme"),i=te(r,"components");J(r),J(i);let a=te(r,"index.ts"),s=te(n,"theme","index.ts");vt(s)&&R(a,L(s));let c=[],p=te(n,"components");if(vt(p))for(let f of Ec(p)){if(!f.endsWith(".vue"))continue;let u=te(p,f),l=te(i,f);R(l,L(u)),c.push(l)}return{themeFile:a,componentFiles:c}}var Mr={id:"cdr.doc.generate",version:"1.1.0",inputSchema:{properties:{output_dir:{type:"string"},fold_v08_sections:{type:"boolean"}},additionalProperties:!1},async execute(t,e){let n=e.output_dir?String(e.output_dir):".dapei/docs-portal",r=V(t.rootDir),i=be(t.rootDir),a=te(r.rootDir,n),s=["capabilities","domains","behaviors","states","profiles","business-rules","business-modules",".vitepress"];for(let j of s)J(te(a,j));let c=ce(t.rootDir),p=te(r.dapeiDir,"workspace.yaml"),f=r.workspaceName;if(vt(p))try{let E=oe(L(p)).workspace;E?.name&&(f=String(E.name))}catch{}let u=$t(te(r.docsDir,"as-is","capabilities")),l=$t(i.domainDir),d=$t(i.behaviorDir),g=$t(i.stateMachineDir),h=$t(te(r.docsDir,"as-is","profiles")),v=$t(te(r.docsDir,"as-is","entries")),b=$t(i.businessRulesDir),_=Lc(d,l,g,b,u,v),y=0,$={capabilities:0,domains:0,behaviors:0,states:0,profiles:0,business_rules:0},S={};R(te(a,"capabilities","index.md"),Mc(u)),y++;let F=[];for(let j of u){let E=String(j.doc.id||j.doc.name||he(j.file,".yaml")),le=z(E);R(te(a,"capabilities",`${le}.md`),jc(j,r.rootDir,_)),F.push({text:E,link:`/capabilities/${le}`}),y++,$.capabilities++}S["/capabilities/"]=[{text:"Capabilities",link:"/capabilities/",items:[{text:"Overview",link:"/capabilities/"},...F]}],R(te(a,"domains","index.md"),qc(l)),y++;let M=[];for(let j of l){let E=String(j.doc.name||j.doc.domain||he(j.file,".yaml")),le=z(E),De=j.repo?`/domains/${z(j.repo)}/${le}`:`/domains/${le}`,Me=j.repo?te(a,"domains",z(j.repo),`${le}.md`):te(a,"domains",`${le}.md`);R(Me,zc(j,r.rootDir,_)),M.push({text:j.repo?`${E} (${j.repo})`:E,link:De}),y++,$.domains++}S["/domains/"]=[{text:"Domains",link:"/domains/",items:[{text:"Overview",link:"/domains/"},...M]}],R(te(a,"behaviors","index.md"),Yc(d)),y++,J(te(a,"behaviors","by-entry-type")),R(te(a,"behaviors","by-entry-type","index.md"),Vc(d)),y++;{let j=es(d);for(let[E,le]of j)R(te(a,"behaviors","by-entry-type",`${z(E)}.md`),Gc(E,le)),y++}let Y={};for(let j of d){let E=String(j.doc.id||he(j.file,".yaml")),le=z(E),De=j.repo?`/behaviors/${z(j.repo)}/${le}`:`/behaviors/${le}`,Me=j.repo?te(a,"behaviors",z(j.repo),`${le}.md`):te(a,"behaviors",`${le}.md`);R(Me,Hc(j,r.rootDir,_));let Ve=j.repo?z(j.repo):"_norepo";(Y[Ve]||=[]).push({text:E,link:De}),y++,$.behaviors++}let U=[{text:"Overview",link:"/behaviors/"}];for(let[j,E]of Object.entries(Y))j==="_norepo"?U.push(...E):U.push({text:j,items:E});S["/behaviors/"]=[{text:"Behaviors",link:"/behaviors/",items:U}],R(te(a,"states","index.md"),Wc(g)),y++;let ie={};for(let j of g){let E=String(j.doc.entity||he(j.file,".yaml")),le=z(E),De=j.repo?`/states/${z(j.repo)}/${le}`:`/states/${le}`,Me=j.repo?te(a,"states",z(j.repo),`${le}.md`):te(a,"states",`${le}.md`);R(Me,Zc(j,r.rootDir,_));let Ve=j.repo?z(j.repo):"_norepo";(ie[Ve]||=[]).push({text:E,link:De}),y++,$.states++}let ae=[{text:"Overview",link:"/states/"}];for(let[j,E]of Object.entries(ie))j==="_norepo"?ae.push(...E):ae.push({text:j,items:E});S["/states/"]=[{text:"State Machines",link:"/states/",items:ae}],R(te(a,"profiles","index.md"),Kc(h)),y++;let re=[];for(let j of h){let E=String(j.doc.repo||j.doc.name||he(j.file,".yaml")),le=z(E);R(te(a,"profiles",`${le}.md`),Jc(j,r.rootDir)),re.push({text:E,link:`/profiles/${le}`}),y++,$.profiles++}S["/profiles/"]=[{text:"Profiles",link:"/profiles/",items:[{text:"Overview",link:"/profiles/"},...re]}],R(te(a,"business-rules","index.md"),Qc(b)),y++,J(te(a,"business-rules","by-kind")),R(te(a,"business-rules","by-kind","index.md"),Xc(b)),y++;{let j=ts(b);for(let[E,le]of j)R(te(a,"business-rules","by-kind",`${z(E)}.md`),el(E,le)),y++}let se=[];for(let j of b){let E=String(j.doc.id||he(j.file,".yaml")),le=z(E),De=j.repo?`/business-rules/${z(j.repo)}/${le}`:`/business-rules/${le}`,Me=j.repo?te(a,"business-rules",z(j.repo),`${le}.md`):te(a,"business-rules",`${le}.md`);R(Me,tl(j,r.rootDir,_)),se.push({text:j.repo?`${E} (${j.repo})`:E,link:De}),y++,$.business_rules++}if(S["/business-rules/"]=[{text:"Business Rules",link:"/business-rules/",items:[{text:"Overview",link:"/business-rules/"},...se]}],R(te(a,"business-modules","index.md"),Oc(l,_)),y++,v.length>0){J(te(a,"entries"));for(let j of v){let E=String(j.doc.repo||j.repo||he(j.file,".yaml"));R(te(a,"entries",`${z(E)}.md`),Uc(j)),y++}}R(te(a,"index.md"),Nc(f,c,$)),y++,R(te(a,"package.json"),il());let de=Ae(a,[".md"],500).map(j=>"/"+On(a,j).split(te("\\")).join("/")).filter(j=>j!=="/.vitepress/dist").sort(),pe=(e.fold_v08_sections===void 0?!0:!!e.fold_v08_sections)?nl(a):{l1:!1,crossRepo:!1,businessModules:!1};if(pe.l1){let j=Ae(te(a,"l1"),[".md"],50).map(E=>"/"+On(a,E).split(te("\\")).join("/")).sort();S["/l1/"]=[{text:"L1 Map",link:"/l1/",items:j.map(E=>({text:E.replace(/^\/l1\//,"").replace(/\.md$/,"")||"Overview",link:E}))}]}if(pe.crossRepo){let j=Ae(te(a,"cross-repo"),[".md"],50).map(E=>"/"+On(a,E).split(te("\\")).join("/")).sort();S["/cross-repo/"]=[{text:"Cross-repo",link:"/cross-repo/",items:j.map(E=>({text:E.replace(/^\/cross-repo\//,"").replace(/\.md$/,"")||"Overview",link:E}))}]}pe.businessModules&&(S["/business-modules/"]=[{text:"Business Modules",link:"/business-modules/",items:[{text:"Overview",link:"/business-modules/"}]}]);let ye=[{text:"Home",link:"/"},{text:"Capabilities",link:"/capabilities/"},{text:"Domains",link:"/domains/"},{text:"Behaviors",link:"/behaviors/"},{text:"States",link:"/states/"},{text:"Business Rules",link:"/business-rules/"},{text:"Profiles",link:"/profiles/"}];return pe.l1&&ye.push({text:"L1 Map",link:"/l1/"}),pe.crossRepo&&ye.push({text:"Cross-repo",link:"/cross-repo/"}),R(te(a,".vitepress","config.mts"),rl(f,S,de,ye)),ol(a),Pc(a),{ok:!0,data:{output_dir:n,pages_generated:y,sections:$},sideEffects:["documentation portal generated"],reportFragments:[`generated ${y} pages in ${n}`]}}};var ns=[...or,sn,Nt,ur,fr,gr,hr,br,vr,Ar,$r,yr,Cr,xr,Ir,Pr,Rr,Lr,Tr,Br,_r,wr,Sr,Nr,Or,Mr],ng=Object.fromEntries(ns.map(t=>[t.id,t]));function jr(t,e,n){return lr(ns,t,e,n)}function ge(t){let e=[/feature[:\s]+([a-z0-9-]+)/i,/([a-z0-9-]+)[\s\n]/,/\/([a-z0-9-]+)$/];for(let n of e){let r=t.match(n);if(r&&r[1])return r[1]}return""}function qr(t){let e=[/(?:name|repo)[:\s]+([a-zA-Z0-9_-]+)/i,/add\s+([a-zA-Z0-9_-]+)/i];for(let n of e){let r=t.match(n);if(r&&r[1])return r[1]}return""}function rs(t){let e=[/https?:\/\/[^\s]+/,/git@[^\s]+/];for(let n of e){let r=t.match(n);if(r)return r[0]}return""}function Dt(t){let e=t.match(/--all|--target\s+([a-zA-Z0-9_-]+)/i);return e&&e[1]?e[1]:t.includes("--all")?"--all":""}function Mn(t){let e=[/repos[:\s]+([a-zA-Z0-9_,-]+)/i,/--repos\s+([a-zA-Z0-9_,-]+)/i,/(?:包含|涉及)\s+([a-zA-Z0-9_,\s-]+?)(?:\s|,|$|\n)/i];for(let n of e){let r=t.match(n);if(r&&r[1])return r[1].trim().replace(/\s+/g,"")}return""}function jn(t){let e=[/(?:goal|objective|目标|目的)[:\s]+(.+?)(?:\n|$)/i,/(?:goal|objective|目标)[:\s]+(.+?)(?:\.|$)/i];for(let n of e){let r=t.match(n);if(r&&r[1])return r[1].trim()}return""}var is=["analyze-current-state","gap-analysis","solution-design","task-breakdown","implementation","local-validation","architecture-review","acceptance"];function Ct(t){for(let n of is)if(t.includes(n))return n;let e=t.match(/stage[:\s]+([a-z-]+)/i);return e?e[1]:""}function zr(t){let e=[/(?:for|repo|target)\s+([a-zA-Z0-9_-]+)/i,/behaviors?\s+for\s+([a-zA-Z0-9_-]+)/i];for(let n of e){let r=t.match(n);if(r&&r[1]&&r[1]!=="behavior"&&r[1]!=="behaviors")return r[1]}return""}var sl=new Set(["repo","repos","the","a","an","this","that","behavior","behaviors","state","states","entry","entries","domain","product","map","maps","documentation","docs","doc","portal","assets","asset","cognitive","index","all","with","using","and","or","from","to"]);function ue(t){let e=[/\bin\s+([a-zA-Z][a-zA-Z0-9_-]+)\s*$/,/\brepo\s+([a-zA-Z][a-zA-Z0-9_-]*)/i,/\bfor\s+([a-zA-Z][a-zA-Z0-9_-]+)\b/];for(let n of e){let r=t.match(n);if(r&&r[1]&&!sl.has(r[1].toLowerCase()))return r[1]}return""}function zt(t){let e=[/\bconfirm\s+entry\s+([a-zA-Z0-9_-]+)/i,/\bentry\s+([a-zA-Z0-9_-]+)/i];for(let n of e){let r=t.match(n);if(r&&r[1]&&r[1].toLowerCase()!=="in")return r[1]}return""}function xt(t){let e=[/\bentity\s+([A-Z][a-zA-Z0-9]*)/,/\bfor\s+([A-Z][a-zA-Z0-9]+)\b/,/\bof\s+([A-Z][a-zA-Z0-9]+)\b/,/\b([A-Z][a-zA-Z]{2,})\s+(?:state|states)\b/];for(let n of e){let r=t.match(n);if(r&&r[1])return r[1]}return""}function os(t){let e=[/\bcompose\s+domain\s+([a-zA-Z][a-zA-Z0-9_-]+)/i,/\bdomain\s+([a-zA-Z][a-zA-Z0-9_-]+)/i];for(let n of e){let r=t.match(n);if(r&&r[1]&&r[1].toLowerCase()!=="from")return r[1]}return""}function Yt(t){let e=[/\bcapability\s+map\s+for\s+(.+?)(?:\s+--|\n|$)/i,/\bfor\s+([A-Za-z][A-Za-z0-9 _-]+?)(?:\s+--|\n|$)/];for(let n of e){let r=t.match(n);if(r&&r[1])return r[1].trim()}return""}function Yr(t){let e=[/(?:description|desc|描述)[:\s]+(.+?)(?:\n|$)/i];for(let n of e){let r=t.match(n);if(r&&r[1])return r[1].trim()}return""}function W(t,e){let n=t.match(e);return n&&n[1]||""}function ss(t){return/\bstate[\s-]?machines?\b/i.test(t)||/状态机/.test(t)?"state-machine":/\bdomains?\b/i.test(t)||/领域/.test(t)?"domain":/\b(?:business[\s-]?rules?|rules?)\b/i.test(t)||/业务规则/.test(t)?"business-rule":/\bentr(?:y|ies)\b/i.test(t)||/入口/.test(t)?"entry":/\bcapability[\s-]?maps?\b/i.test(t)||/能力地图/.test(t)?"capability-map":/\bbehaviors?\b/i.test(t)||/行为/.test(t)?"behavior":""}function qn(t){return W(t,/--feature[=\s]+([a-zA-Z0-9_-]+)/i)||W(t,/\b(?:for|of)\s+(?!feature\b)([a-zA-Z0-9_-]+)/i)||ge(t)}var zn=[{id:"workspace.init.english",capability:"workspace.init",pattern:/^(?=.*(?:^|\s)(?:init|initialize)\b)(?=.*\bworkspace\b).*/i,inputBuilder:()=>({}),reason:"workspace init intent",confidence:.95,tags:["workspace"],priority:100},{id:"repos.add.english",capability:"repos.add",pattern:/^(?=.*(?<!-)\brepos?\b)(?=.*\badd\b).*/i,inputBuilder:(t,e)=>({name:e.name||qr(t),url:e.url||rs(t)}),reason:"repo add intent",confidence:.9,tags:["repos"],priority:100},{id:"cognitive.discover.english",capability:"cognitive.discover",pattern:/^(?=.*\bbehaviors?\b)(?=.*\b(?:analyze|discover)\b).*/i,inputBuilder:(t,e)=>({target:e.target||zr(t)||"--all"}),reason:"cognitive behavior discover intent (Agent reads code)",confidence:.92,tags:["cognitive"],priority:100},{id:"cognitive.artifact.list.english",capability:"cognitive.artifact.list",pattern:/^(?=.*\bbehaviors?\b)(?=.*\blist\b).*/i,inputBuilder:(t,e)=>({repo:e.repo||zr(t)}),reason:"cognitive artifact list intent",confidence:.9,tags:["cognitive"],priority:100},{id:"cdr.profile.english",capability:"cdr.profile",pattern:/^(?=.*(?<!-)\bprofile\b).*/i,inputBuilder:(t,e)=>({repo:e.repo||ue(t)||""}),reason:"cdr profile repo intent",confidence:.9,tags:["cdr","profile"],priority:100},{id:"cdr.entries.prepare.english",capability:"cdr.entries.prepare",pattern:/^(?=.*\bdiscover\b)(?=.*\bentries?\b).*/i,inputBuilder:(t,e)=>({repo:e.repo||ue(t)||""}),reason:"cdr entries prepare intent",confidence:.93,tags:["cdr","entries"],priority:100},{id:"cdr.entries.confirm.english",capability:"cdr.entries.confirm",pattern:/^(?=.*\bconfirm\b)(?=.*\bentry\b).*/i,inputBuilder:(t,e)=>({repo:e.repo||ue(t)||"",entry_id:e.entry_id||zt(t)||""}),reason:"cdr entries confirm intent",confidence:.92,tags:["cdr","entries"],priority:100},{id:"cognitive.state.suggest.english",capability:"cognitive.state.suggest",pattern:/^(?=.*\bdiscover\b)(?=.*\bstates?\b).*/i,inputBuilder:(t,e)=>{let n=e.entity||xt(t),r=n?t.replace(new RegExp(`\\b${n}\\b`,"g"),""):t;return{entity:n||"all",repo:e.repo||ue(r)||""}},reason:"cognitive state suggest intent",confidence:.93,tags:["cognitive","state"],priority:100},{id:"cdr.domain.compose.english",capability:"cdr.domain.compose",pattern:/^(?=.*\bcompose\b)(?=.*\bdomain\b).*/i,inputBuilder:(t,e)=>({domain:e.domain||os(t)||"",description:e.description||Yr(t)||""}),reason:"cdr domain compose intent",confidence:.92,tags:["cdr","domain"],priority:100},{id:"cdr.capability.map.init.english",capability:"cdr.capability.map.init",pattern:/^(?=.*\binit\b)(?=.*\bcapability\b)(?=.*\bmap\b).*/i,inputBuilder:(t,e)=>({product:e.product||Yt(t)||""}),reason:"cdr capability map init intent",confidence:.92,tags:["cdr","capability-map"],priority:100},{id:"cdr.bootstrap.english",pattern:/^bootstrap\s+(?:repo\s+)?([a-z0-9][a-z0-9._-]*)/i,capability:"cdr.bootstrap",inputBuilder:(t,e)=>{let n=t.match(/^bootstrap\s+(?:repo\s+)?([a-z0-9][a-z0-9._-]*)/i);return{repo:n&&n[1]||e.repo||""}},reason:"cdr.bootstrap one-shot intent",confidence:.9,tags:["cdr","bootstrap","v0.8"],priority:50},{id:"cdr.bootstrap.chinese",pattern:/^(?:引导)\s+([a-z0-9][a-z0-9._-]*)/i,capability:"cdr.bootstrap",inputBuilder:(t,e)=>{let n=t.match(/(?:引导)\s+([a-z0-9][a-z0-9._-]*)/i);return{repo:n&&n[1]||e.repo||""}},reason:"cdr.bootstrap one-shot intent (chinese)",confidence:.88,tags:["cdr","bootstrap","v0.8","chinese"],priority:50},{id:"cdr.domain.suggest.english",pattern:/^(?=.*\b(?:suggest|cluster|reverse[\s_-]?cluster)\b)(?=.*\b(?:domains?)\b).*/i,capability:"cdr.domain.suggest",inputBuilder:(t,e)=>({repos:e.repos||"",min_size:e.min_size||"",max_size:e.max_size||"",max_clusters:e.max_clusters||""}),reason:"cdr domain suggest intent (v0.8)",confidence:.9,tags:["cdr","domain","v0.8"],priority:50},{id:"cdr.capability.map.synth.english",pattern:/^(?=.*\b(?:synth(?:esize)?)\b)(?=.*\bcapability\b)(?=.*\bmap\b).*/i,capability:"cdr.capability.map.synth",inputBuilder:(t,e)=>({product:e.product||Yt(t)||"",use_suggested_domains:e.use_suggested_domains||""}),reason:"cdr capability map synth intent (v0.8)",confidence:.92,tags:["cdr","capability-map","v0.8"],priority:50},{id:"cdr.reversecluster.doc.generate.english",pattern:/^(?=.*\b(?:render|build|generate)\b)(?=.*\b(?:l1|capability[\s_-]?map|reverse[\s_-]?cluster)\b)(?=.*\b(?:portal|docs|documentation)\b).*/i,capability:"cdr.reversecluster.doc.generate",inputBuilder:(t,e)=>({output_dir:e.output_dir||".dapei/docs-portal"}),reason:"cdr reverse_cluster doc generate intent (v0.8)",confidence:.92,tags:["cdr","doc","v0.8"],priority:50},{id:"cdr.crossrepo.doc.generate.english",pattern:/^(?=.*\b(?:cross[_-]?repo|cross[_-]?repository)\b)(?=.*\b(?:portal|docs|documentation)\b).*/i,capability:"cdr.crossrepo.doc.generate",inputBuilder:(t,e)=>({output_dir:e.output_dir||".dapei/docs-portal"}),reason:"cdr cross_repo doc generate intent (precedence over cdr.doc.generate)",confidence:.92,tags:["cdr","doc","cross-repo"],priority:50},{id:"cdr.doc.generate.english",pattern:/^(?!.*\b(?:l1|capability[\s_-]?map|reverse[\s_-]?cluster)\b)(?=.*\b(?:generate|build|render)\b)(?=.*\b(?:documentation|docs|portal)\b).*/i,capability:"cdr.doc.generate",inputBuilder:(t,e)=>({output_dir:e.output_dir||".dapei/docs-portal"}),reason:"cdr doc generate intent",confidence:.92,tags:["cdr","doc"],priority:100},{id:"cdr.index.list.english",pattern:/^(?=.*\b(?:list|show)\b)(?=.*\b(?:assets|cognitive|index)\b).*/i,capability:"cdr.index.list",inputBuilder:(t,e)=>({repo:e.repo||ue(t)||"",kind:e.kind||""}),reason:"cdr index list intent",confidence:.85,tags:["cdr","index"],priority:100},{id:"cdr.profile.chinese",pattern:/分析\s*(?:repo|仓库|项目|repos?)?\s*([a-zA-Z][a-zA-Z0-9_-]+)/i,capability:"cdr.profile",inputBuilder:(t,e)=>{let n=t.match(/分析\s*(?:repo|仓库|项目|repos?)?\s*([a-zA-Z][a-zA-Z0-9_-]+)/i);return{repo:e.repo||n&&n[1]||""}},reason:"cdr profile repo intent (chinese)",confidence:.88,tags:["cdr","profile","chinese"],priority:100},{id:"cdr.entries.prepare.chinese",pattern:/扫描.*?(?:入口|entries?)\s+(?:for\s+|in\s+)?([a-zA-Z0-9_-]+)/i,capability:"cdr.entries.prepare",inputBuilder:(t,e)=>{let n=t.match(/扫描.*?(?:入口|entries?)\s+(?:for\s+|in\s+)?([a-zA-Z0-9_-]+)/i);return{repo:e.repo||n&&n[1]||""}},reason:"cdr entries prepare intent (chinese)",confidence:.91,tags:["cdr","entries","chinese"],priority:100},{id:"cdr.entries.confirm.chinese",pattern:/(?:确认|标记).*?(?:入口|entry)\s+([a-zA-Z0-9_-]+)/i,capability:"cdr.entries.confirm",inputBuilder:(t,e)=>{let n=t.match(/(?:确认|标记).*?(?:入口|entry)\s+([a-zA-Z0-9_-]+)/i);return{repo:e.repo||ue(t)||"",entry_id:e.entry_id||n&&n[1]||""}},reason:"cdr entries confirm intent (chinese)",confidence:.9,tags:["cdr","entries","chinese"],priority:100},{id:"cognitive.state.suggest.chinese",pattern:/推导.*(?:状态|state)\s+(?:for\s+|of\s+)?([A-Z][a-zA-Z0-9]+)?/i,capability:"cognitive.state.suggest",inputBuilder:(t,e)=>{let n=t.match(/(?:状态|state)\s+(?:for\s+|of\s+)?([A-Z][a-zA-Z0-9]+)/);return{entity:e.entity||n&&n[1]||"all",repo:e.repo||ue(t)||""}},reason:"cognitive state suggest intent (chinese)",confidence:.91,tags:["cognitive","state","chinese"],priority:100},{id:"cdr.domain.compose.chinese",pattern:/(?:组合|聚类|compose).*(?:领域|domain)\s+([a-zA-Z0-9_-]+)/i,capability:"cdr.domain.compose",inputBuilder:(t,e)=>{let n=t.match(/(?:组合|聚类|compose)\s*(?:领域|domain)\s+([a-zA-Z0-9_-]+)/i);return{domain:e.domain||n&&n[1]||"",description:e.description||""}},reason:"cdr domain compose intent (chinese)",confidence:.9,tags:["cdr","domain","chinese"],priority:100},{id:"cdr.business.compose.chinese",pattern:/(?:组合|聚类|compose).*(?:业务规则?|business[\s_-]?rule?)\s+([a-zA-Z0-9_-]+)/i,capability:"cdr.business.compose",inputBuilder:(t,e)=>({id:e.id||t.match(/(?:业务规则?|business[\s_-]?rule?)\s+([a-zA-Z0-9_-]+)/i)?.[1]||"",kind:e.kind||"invariant",description:e.description||""}),reason:"cdr business compose intent (chinese)",confidence:.9,tags:["cdr","business-rule","chinese"],priority:100},{id:"cdr.capability.map.init.chinese",pattern:/初始化.*(?:功能|能力)\s*(?:地图|全景)/i,capability:"cdr.capability.map.init",inputBuilder:(t,e)=>({product:e.product||Yt(t)||""}),reason:"cdr capability map init intent (chinese)",confidence:.9,tags:["cdr","capability-map","chinese"],priority:100},{id:"cdr.crossrepo.doc.generate.chinese",pattern:/(?:生成|渲染|构建)\s*(?:跨[_-]?仓库?|跨[_-]?服务?)\s*(?:门户|视图|页面|文档)/i,capability:"cdr.crossrepo.doc.generate",inputBuilder:(t,e)=>({output_dir:e.output_dir||".dapei/docs-portal"}),reason:"cdr cross_repo doc generate intent (chinese)",confidence:.9,tags:["cdr","doc","cross-repo","chinese"],priority:50},{id:"cdr.doc.generate.chinese",pattern:/(?!.*跨越?)(?:生成|渲染|构建).*(?:文档|docs|documentation|门户|portal)/i,capability:"cdr.doc.generate",inputBuilder:(t,e)=>({output_dir:e.output_dir||".dapei/docs-portal"}),reason:"cdr doc generate intent (chinese)",confidence:.9,tags:["cdr","doc","chinese"],priority:100},{id:"cdr.index.list.assets.english",capability:"cdr.index.list",pattern:/^(?=.*\b(?:list|show)\b)(?=.*\b(?:assets|cognitive)\b).*/i,inputBuilder:(t,e)=>({repo:e.repo||ue(t)||"",kind:e.kind||""}),reason:"cdr index list assets intent (precedence over repos.list)",confidence:.93,tags:["cdr","index"],priority:100},{id:"cdr.index.list.chinese",pattern:/(?:列出|list)\s*(?:资产|assets|认知|cognitive|索引|index)/i,capability:"cdr.index.list",inputBuilder:(t,e)=>({repo:e.repo||ue(t)||"",kind:e.kind||""}),reason:"cdr index list intent (chinese)",confidence:.85,tags:["cdr","index","chinese"],priority:100},{id:"cdr.business.crosslink.english",pattern:/^(?=.*\b(?:cross[_-]?repo|cross[_-]?repository)\b)(?=.*\b(?:link|rules?|ruleset|view|map)\b).*/i,capability:"cdr.business.crosslink",inputBuilder:(t,e)=>({min_confidence:e.min_confidence||""}),reason:"cdr business cross-link intent",confidence:.9,tags:["cdr","business-rule","cross-repo"],priority:100},{id:"cdr.business.crosslink.chinese",pattern:/(?:建立|构建|汇总|推导|生成)\s*(?:跨[_-]?仓库?|跨[_-]?服务?)\s*(?:业务规则|关系|规则集)/i,capability:"cdr.business.crosslink",inputBuilder:(t,e)=>({min_confidence:e.min_confidence||""}),reason:"cdr business cross-link intent (chinese)",confidence:.88,tags:["cdr","business-rule","cross-repo","chinese"],priority:100},{id:"cdr.domain.suggest.chinese",pattern:/(?:推荐|聚类|建议|reverse[\s_-]?cluster|suggest).*(?:领域|domain)/i,capability:"cdr.domain.suggest",inputBuilder:(t,e)=>({repos:e.repos||"",min_size:e.min_size||"",max_size:e.max_size||"",max_clusters:e.max_clusters||""}),reason:"cdr domain suggest intent (chinese)",confidence:.88,tags:["cdr","domain","chinese","v0.8"],priority:100},{id:"cdr.capability.map.synth.chinese",pattern:/(?:聚类|生成|推导|合成).*(?:功能|能力|capability)\s*(?:地图|map|全景)/i,capability:"cdr.capability.map.synth",inputBuilder:(t,e)=>({product:e.product||Yt(t)||"",use_suggested_domains:e.use_suggested_domains||""}),reason:"cdr capability map synth intent (chinese)",confidence:.88,tags:["cdr","capability-map","chinese","v0.8"],priority:100},{id:"cdr.reversecluster.doc.generate.chinese",pattern:/(?:渲染|生成|构建).*(?:L1|能力地图|功能全景|capability[\s_-]?map)/i,capability:"cdr.reversecluster.doc.generate",inputBuilder:(t,e)=>({output_dir:e.output_dir||".dapei/docs-portal"}),reason:"cdr reverse_cluster doc generate intent (chinese)",confidence:.9,tags:["cdr","doc","chinese","v0.8"],priority:50},{id:"repos.analyze.english",capability:"repos.analyze",pattern:/^(?=.*(?<!-)\brepos?\b)(?=.*\banalyze\b).*/i,inputBuilder:(t,e)=>({target:e.target||Dt(t)||"--all"}),reason:"repo analyze intent",confidence:.95,tags:["repos"],priority:100},{id:"repos.sync.english",capability:"repos.sync",pattern:/^(?=.*(?<!-)\brepos?\b)(?=.*\bsync\b).*/i,inputBuilder:(t,e)=>({target:e.target||Dt(t)||"--all"}),reason:"repo sync intent",confidence:.95,tags:["repos"],priority:100},{id:"repos.list.english",capability:"repos.list",pattern:/^(?=.*(?<!-)\brepos?\b)(?=.*\blist\b).*/i,inputBuilder:()=>({}),reason:"repo list intent",confidence:.9,tags:["repos"],priority:100},{id:"repos.check.english",capability:"repos.check",pattern:/^(?=.*(?<!-)\brepos?\b)(?=.*\bcheck\b).*/i,inputBuilder:(t,e)=>({target:e.target||Dt(t)||"--all"}),reason:"repo check intent",confidence:.92,tags:["repos"],priority:100},{id:"feature.create.english",capability:"feature.create",pattern:/^(?=.*\bcreate\b)(?=.*\bfeature\b).*/i,inputBuilder:(t,e)=>({name:e.name||ge(t),repos:e.repos||Mn(t),objective:e.objective||jn(t)||"TBD"}),reason:"feature create intent",confidence:.95,tags:["feature"],priority:100},{id:"feature.create.chinese.direct",pattern:/创建.*feature|feature.*创建/i,capability:"feature.create",inputBuilder:(t,e)=>({name:e.name||ge(t),repos:e.repos||Mn(t),objective:e.objective||jn(t)||"TBD"}),reason:"feature create intent (chinese)",confidence:.95,tags:["feature","chinese"],priority:100},{id:"feature.create.chinese.indirect",pattern:/新开.*需求|需求.*新开/i,capability:"feature.create",inputBuilder:(t,e)=>({name:e.name||ge(t),repos:e.repos||Mn(t),objective:e.objective||jn(t)||"TBD"}),reason:"feature create intent (chinese)",confidence:.95,tags:["feature","chinese"],priority:100},{id:"context.build.english",capability:"context.build",pattern:/^(?=.*\bcontext\b)(?=.*\bbuild\b).*/i,inputBuilder:(t,e)=>({feature:e.feature||ge(t),stage:e.stage||Ct(t)||"general"}),reason:"context build intent",confidence:.95,tags:["feature","context"],priority:100},{id:"workflow.runStage.english",capability:"workflow.runStage",pattern:/^(?=.*\brun\b)(?=.*\bworkflow\b).*/i,inputBuilder:(t,e)=>({feature:e.feature||ge(t),stage:e.stage||Ct(t)||""}),reason:"workflow run intent",confidence:.9,tags:["feature","workflow"],priority:100},{id:"validation.run.english",capability:"validation.run",pattern:/^(?=.*\bvalidate\b).*/i,inputBuilder:(t,e)=>({feature:e.feature||ge(t)}),reason:"validation intent",confidence:.85,tags:["feature","validation"],priority:100},{id:"feature.report.english",capability:"feature.report",pattern:/^(?=.*\breport\b).*/i,inputBuilder:(t,e)=>({feature:e.feature||ge(t)}),reason:"report intent",confidence:.8,tags:["feature","report"],priority:100},{id:"feature.review.english",capability:"feature.review",pattern:/^(?=.*\breview\b).*/i,inputBuilder:(t,e)=>({feature:e.feature||ge(t)}),reason:"review intent",confidence:.8,tags:["feature","review"],priority:100},{id:"feature.close.normal",capability:"feature.close",pattern:/^(?=.*\bclose\b)(?=.*\bfeature\b).*/i,inputBuilder:(t,e)=>({feature:e.feature||ge(t)}),reason:"close feature intent",confidence:.9,tags:["feature","close"],priority:100},{id:"feature.close.reversed",capability:"feature.close",pattern:/^(?=.*\bfeature\b)(?=.*\bclose\b).*/i,inputBuilder:(t,e)=>({feature:e.feature||ge(t)}),reason:"close feature intent (reversed)",confidence:.9,tags:["feature","close"],priority:100},{id:"feature.status.fallback",capability:"feature.status",pattern:/^(?=.*\bstatus\b).*$/i,inputBuilder:()=>({}),reason:"status intent",confidence:.7,tags:["feature","status"],priority:100},{id:"feature.gap-analysis.english",capability:"feature.gap.analysis",pattern:/^(?=.*\bgap\b)(?=.*\banalysis\b).*/i,inputBuilder:(t,e)=>({feature:e.feature||ge(t),max_envelopes:3}),reason:"gap-analysis intent",confidence:.9,tags:["feature","gap-analysis"],priority:100},{id:"feature.gap-analysis.chinese",capability:"feature.gap.analysis",pattern:/差距分析|gap\s*分析|分析.*差距/i,inputBuilder:(t,e)=>({feature:e.feature||ge(t),max_envelopes:3}),reason:"gap-analysis intent (chinese)",confidence:.9,tags:["feature","gap-analysis","chinese"],priority:100},{id:"feature.stage.transition.english",capability:"feature.stage.transition",pattern:/^(?=.*\btransition\b)(?=.*\bstage\b).*/i,inputBuilder:(t,e)=>({feature:e.feature||ge(t),stage:e.stage||Ct(t)||""}),reason:"stage transition intent",confidence:.9,tags:["feature","stage"],priority:100},{id:"feature.accept.english",capability:"feature.accept",pattern:/^(?=.*\baccept\b)(?=.*\bfeature\b).*/i,inputBuilder:(t,e)=>({feature:e.feature||ge(t),confirmed:e.confirmed??!0}),reason:"feature accept intent",confidence:.9,tags:["feature","accept"],priority:100},{id:"feature.accept.chinese",capability:"feature.accept",pattern:/接受.*feature|验收.*feature|feature.*接受/i,inputBuilder:(t,e)=>({feature:e.feature||ge(t),confirmed:e.confirmed??!0}),reason:"feature accept intent (chinese)",confidence:.9,tags:["feature","accept","chinese"],priority:100},{id:"workspace.validate.english",capability:"workspace.validate",pattern:/^(?=.*\b(?:workspace|工作区)\b)(?=.*\b(?:validate|validation|conform|conformance|check)\b).*/i,inputBuilder:()=>({}),reason:"workspace validate intent",confidence:.93,tags:["workspace","validation"],priority:100},{id:"workspace.validate.chinese",capability:"workspace.validate",pattern:/(?:校验|检查).*(?:workspace|工作区)|(?:workspace|工作区).*(?:校验|检查)/i,inputBuilder:()=>({}),reason:"workspace validate intent (chinese)",confidence:.92,tags:["workspace","validation","chinese"],priority:100},{id:"workspace.status.english",capability:"workspace.status",pattern:/^(?=.*\b(?:workspace|工作区)\b)(?=.*\b(?:status|overview|summary)\b).*/i,inputBuilder:()=>({}),reason:"workspace status intent",confidence:.93,tags:["workspace","status"],priority:100},{id:"workspace.status.chinese",capability:"workspace.status",pattern:/(?:workspace|工作区).*(?:状态|概览|总览)/i,inputBuilder:()=>({}),reason:"workspace status intent (chinese)",confidence:.92,tags:["workspace","status","chinese"],priority:100},{id:"workspace.report.english",capability:"workspace.report",pattern:/^(?=.*\b(?:workspace|工作区)\b)(?=.*\b(?:report|health)\b).*/i,inputBuilder:()=>({}),reason:"workspace report intent",confidence:.93,tags:["workspace","report"],priority:100},{id:"workspace.report.chinese",capability:"workspace.report",pattern:/(?:workspace|工作区).*(?:报告|健康)/i,inputBuilder:()=>({}),reason:"workspace report intent (chinese)",confidence:.92,tags:["workspace","report","chinese"],priority:100},{id:"workflow.status.english",capability:"workflow.status",pattern:/^(?=.*\bworkflow\b)(?=.*\b(?:status|progress)\b).*/i,inputBuilder:(t,e)=>({feature:e.feature||W(t,/\bworkflow\s+(?:status|progress)\s+(?:for\s+)?([a-zA-Z0-9_-]+)/i)||ge(t)}),reason:"workflow status intent",confidence:.92,tags:["feature","workflow","status"],priority:100},{id:"workflow.status.chinese",capability:"workflow.status",pattern:/(?:workflow|工作流).*(?:状态|进度)/i,inputBuilder:(t,e)=>({feature:e.feature||ge(t)}),reason:"workflow status intent (chinese)",confidence:.9,tags:["feature","workflow","status","chinese"],priority:100},{id:"feature.stage.english",capability:"feature.stage",pattern:/^(?=.*\bfeature\s+stage\b).*/i,inputBuilder:(t,e)=>({feature:e.feature||W(t,/\bfeature\s+stage\s+([a-zA-Z0-9_-]+)/i)||ge(t),action:/\b(?:set|update|设置|更新|推进)\b/i.test(t)?"set":"get",stage:e.stage||Ct(t)}),reason:"feature stage get/set intent",confidence:.9,tags:["feature","stage"],priority:100},{id:"feature.stage.getset.english",capability:"feature.stage",pattern:/^(?!.*\b(?:transition|workflow|validate|validation|accept)\b)(?=.*\bfeature\b)(?=.*\bstage\b).*/i,inputBuilder:(t,e)=>({feature:e.feature||ge(t),action:/\b(?:set|update|推进)\b/i.test(t)?"set":"get",stage:e.stage||Ct(t)}),reason:"feature stage get/set intent (loose phrasing)",confidence:.89,tags:["feature","stage"],priority:100},{id:"feature.stage.chinese",capability:"feature.stage",pattern:/(?:获取|设置|查看|查询|切换).*(?:stage|阶段)|(?:stage|阶段).*(?:获取|设置|查看|查询|切换)/i,inputBuilder:(t,e)=>({feature:e.feature||ge(t),action:/\b(?:set|update)\b|设置|更新/i.test(t)?"set":"get",stage:e.stage||Ct(t)}),reason:"feature stage get/set intent (chinese)",confidence:.9,tags:["feature","stage","chinese"],priority:100},{id:"feature.tasks.english",capability:"feature.tasks",pattern:/^(?=.*\bfeature\b)(?=.*\b(?:tasks?|backlog)\b).*/i,inputBuilder:(t,e)=>({feature:e.feature||W(t,/\bfeature\s+(?:tasks?|backlog)\s+([a-zA-Z0-9_-]+)/i)||ge(t),action:/\b(?:append|add|新增|添加|追加)\b/i.test(t)?"append":"list",content:e.content||W(t,/--content\s+(.+)$/i)}),reason:"feature tasks list/append intent",confidence:.9,tags:["feature","tasks"],priority:100},{id:"feature.tasks.chinese",capability:"feature.tasks",pattern:/(?:feature|特性).*(?:任务|backlog|待办|清单)/i,inputBuilder:(t,e)=>({feature:e.feature||ge(t),action:/新增|添加|追加|append/i.test(t)?"append":"list",content:e.content||W(t,/--content\s+(.+)$/i)}),reason:"feature tasks list/append intent (chinese)",confidence:.9,tags:["feature","tasks","chinese"],priority:100},{id:"feature.guardrail.english",capability:"feature.guardrail",pattern:/^(?=.*\bfeature\b)(?=.*\bguardrails?\b).*/i,inputBuilder:(t,e)=>({feature:e.feature||W(t,/\bfeature\s+guardrails?\s+([a-zA-Z0-9_-]+)/i)||ge(t)}),reason:"feature guardrail intent",confidence:.9,tags:["feature","guardrail"],priority:100},{id:"feature.guardrail.chinese",capability:"feature.guardrail",pattern:/guardrails?|护栏|守卫/i,inputBuilder:(t,e)=>({feature:e.feature||ge(t)}),reason:"feature guardrail intent (chinese)",confidence:.89,tags:["feature","guardrail","chinese"],priority:100},{id:"feature.assign.english",capability:"feature.assign",pattern:/^(?=.*\bfeature\b)(?=.*\b(?:assign|assignee|owner|ownership)\b).*/i,inputBuilder:(t,e)=>({feature:e.feature||ge(t),owner:e.owner||W(t,/\bto\s+@?([a-zA-Z0-9_-]+)/i)||W(t,/(?:owner|assignee)[:\s]+@?([a-zA-Z0-9_-]+)/i)}),reason:"feature assign intent",confidence:.88,tags:["feature","assign"],priority:100},{id:"feature.assign.chinese",capability:"feature.assign",pattern:/(?:分配|指派).*(?:feature|特性|负责人)|(?:feature|特性).*(?:分配|指派)/i,inputBuilder:(t,e)=>({feature:e.feature||ge(t),owner:e.owner||W(t,/(?:给|指派|分配给)\s*@?([a-zA-Z0-9_-]+)/i)}),reason:"feature assign intent (chinese)",confidence:.87,tags:["feature","assign","chinese"],priority:100},{id:"feature.handoff.english",capability:"feature.handoff",pattern:/^(?=.*\bfeature\b)(?=.*\b(?:handoff|hand[\s-]?off)\b).*/i,inputBuilder:(t,e)=>({feature:e.feature||ge(t),to:e.to||W(t,/\bto\s+@?([a-zA-Z0-9_-]+)/i),note:e.note||W(t,/--note\s+(.+)$/i)}),reason:"feature handoff intent",confidence:.9,tags:["feature","handoff"],priority:100},{id:"feature.handoff.chinese",capability:"feature.handoff",pattern:/(?:移交|交接).*(?:feature|特性)|(?:feature|特性).*(?:移交|交接)/i,inputBuilder:(t,e)=>({feature:e.feature||ge(t),to:e.to||W(t,/(?:给|移交给|交接给)\s*@?([a-zA-Z0-9_-]+)/i)}),reason:"feature handoff intent (chinese)",confidence:.89,tags:["feature","handoff","chinese"],priority:100},{id:"feature.teamstatus.english",capability:"feature.teamstatus",pattern:/^(?=.*\bteam\b)(?=.*\b(?:status|progress|overview)\b).*/i,inputBuilder:()=>({}),reason:"feature team status intent",confidence:.92,tags:["feature","status","team"],priority:100},{id:"feature.teamstatus.chinese",capability:"feature.teamstatus",pattern:/团队.*(?:状态|进度|概览)/i,inputBuilder:()=>({}),reason:"feature team status intent (chinese)",confidence:.9,tags:["feature","status","team","chinese"],priority:100},{id:"validation.detect.english",capability:"validation.detect",pattern:/^(?=.*\b(?:detect|discover)\b)(?=.*\b(?:tests?|validation|commands?|checks?)\b).*/i,inputBuilder:(t,e)=>({repo:e.repo||Dt(t)||W(t,/(?:detect|discover)\s+(?:tests?\s+|validation\s+)?(?:commands?\s+)?(?:for\s+|in\s+|on\s+)?([a-zA-Z0-9_.-]+)/i)||ue(t)}),reason:"validation detect intent",confidence:.92,tags:["validation","detect"],priority:100},{id:"validation.detect.chinese",capability:"validation.detect",pattern:/(?:发现|识别|探测).*(?:测试|验证).*命令|(?:测试|验证)命令.*(?:发现|识别|探测)/i,inputBuilder:(t,e)=>({repo:e.repo||ue(t)}),reason:"validation detect intent (chinese)",confidence:.9,tags:["validation","detect","chinese"],priority:100},{id:"validation.execute.english",capability:"validation.execute",pattern:/^(?=.*\bvalidation\b)(?=.*\b(?:execute|executing|execution|run)\b).*/i,inputBuilder:(t,e)=>({repo:e.repo||Dt(t)||W(t,/\b(?:execut(?:e|ing)|run)\s+([a-zA-Z0-9_.-]+)/i)||ue(t),command:e.command||W(t,/"([^"]+)"/)||W(t,/--command[=\s]+(.+)$/i)}),reason:"validation execute intent",confidence:.92,tags:["validation","execute"],priority:100},{id:"validation.execute.tests",capability:"validation.execute",pattern:/^(?=.*\b(?:run|execute)\b)(?=.*\b(?:tests?|checks?)\b)(?=.*\b(?:for|in|on)\b).*/i,inputBuilder:(t,e)=>({repo:e.repo||Dt(t)||W(t,/(?:for|in|on)\s+([a-zA-Z0-9_.-]+)/i)||ue(t),command:e.command||W(t,/"([^"]+)"/)}),reason:"validation execute (run tests) intent",confidence:.9,tags:["validation","execute"],priority:100},{id:"validation.execute.chinese",capability:"validation.execute",pattern:/执行.*测试|测试.*执行/i,inputBuilder:(t,e)=>({repo:e.repo||ue(t),command:e.command||W(t,/"([^"]+)"/)}),reason:"validation execute intent (chinese)",confidence:.9,tags:["validation","execute","chinese"],priority:100},{id:"validation.report.english",capability:"validation.report",pattern:/^(?=.*\bvalidation\b)(?=.*\breport\b).*/i,inputBuilder:(t,e)=>({feature:e.feature||W(t,/\bvalidation\s+report\s+(?:for\s+)?([a-zA-Z0-9_-]+)/i)||ge(t)}),reason:"validation report intent",confidence:.92,tags:["validation","report"],priority:100},{id:"validation.report.chinese",capability:"validation.report",pattern:/(?:验证|校验|测试)报告/i,inputBuilder:(t,e)=>({feature:e.feature||ge(t)}),reason:"validation report intent (chinese)",confidence:.9,tags:["validation","report","chinese"],priority:100},{id:"memory.append.english",capability:"memory.append",pattern:/^(?=.*\bmemory\b)(?=.*\b(?:append|record|add|log|write|note)\b).*/i,inputBuilder:(t,e)=>({feature:e.feature||W(t,/\bmemory\s+(?:append|add|record)\s+([a-zA-Z0-9_-]+)/i)||ge(t),type:(W(t,/\b(decision|risk|question|note)\b/i)||"note").toLowerCase(),content:e.content||W(t,/--content\s+(.+)$/i)||W(t,/\b(?:decision|risk|question|note)\b[:\s]+(.+)$/i)}),reason:"memory append intent",confidence:.92,tags:["memory","feature"],priority:100},{id:"memory.append.entry",capability:"memory.append",pattern:/^(?=.*\b(?:record|log|append|note)\b)(?=.*\b(?:decision|risk|question|note)s?\b).*/i,inputBuilder:(t,e)=>({feature:e.feature||ge(t),type:(W(t,/\b(decision|risk|question|note)s?\b/i)||"note").toLowerCase().replace(/s$/,""),content:e.content||W(t,/--content\s+(.+)$/i)}),reason:"memory append (record entry) intent",confidence:.9,tags:["memory"],priority:100},{id:"memory.append.chinese",capability:"memory.append",pattern:/记录.*(?:决策|风险|问题|笔记|备忘)/i,inputBuilder:(t,e)=>{let n=W(t,/(决策|风险|问题|笔记)/),r=n==="\u51B3\u7B56"?"decision":n==="\u98CE\u9669"?"risk":n==="\u95EE\u9898"?"question":"note";return{feature:e.feature||ge(t),type:r,content:e.content||W(t,/--content\s+(.+)$/i)}},reason:"memory append intent (chinese)",confidence:.9,tags:["memory","chinese"],priority:100},{id:"audit.query.english",capability:"audit.query",pattern:/^(?=.*\baudit\b).*/i,inputBuilder:(t,e)=>({since:e.since||W(t,/--since[=\s]+(\S+)/i),until:e.until||W(t,/--until[=\s]+(\S+)/i),capability:e.capability||W(t,/--capability[=\s]+(\S+)/i),feature:e.feature||W(t,/--feature[=\s]+(\S+)/i)}),reason:"audit query intent",confidence:.92,tags:["audit"],priority:100},{id:"audit.query.chinese",capability:"audit.query",pattern:/审计|能力执行日志/i,inputBuilder:(t,e)=>({since:e.since||W(t,/--since[=\s]+(\S+)/i),until:e.until||W(t,/--until[=\s]+(\S+)/i),capability:e.capability||W(t,/--capability[=\s]+(\S+)/i),feature:e.feature||W(t,/--feature[=\s]+(\S+)/i)}),reason:"audit query intent (chinese)",confidence:.9,tags:["audit","chinese"],priority:100},{id:"repos.remove.english",capability:"repos.remove",pattern:/^(?=.*(?:remove|delete|drop)\b)(?=.*(?<!-)\brepos?\b).*/i,inputBuilder:(t,e)=>({name:e.name||W(t,/(?:remove|delete|drop)\s+([a-zA-Z0-9_-]+)/i)||qr(t),force:/--force/.test(t)}),reason:"repo remove intent",confidence:.93,tags:["repos"],priority:100},{id:"repos.remove.chinese",capability:"repos.remove",pattern:/(?:移除|删除|去掉).*(?:repo|仓库)|(?:repo|仓库).*(?:移除|删除|去掉)/i,inputBuilder:(t,e)=>({name:e.name||W(t,/(?:移除|删除|去掉)\s*(?:repos?\b|仓库)?\s*([a-zA-Z0-9_-]+)/i),force:/--force|强制/.test(t)}),reason:"repo remove intent (chinese)",confidence:.92,tags:["repos","chinese"],priority:100},{id:"cdr.state.derive.english",capability:"cdr.state.derive",pattern:/^(?=.*\b(?:derive|draft|infer)\b)(?=.*\b(?:states?|state[\s-]?machines?)\b).*/i,inputBuilder:(t,e)=>({entity:e.entity||xt(t)||"all",repo:e.repo||ue(t)||""}),reason:"cdr state derive intent",confidence:.92,tags:["cdr","state"],priority:100},{id:"cdr.state.derive.machine.english",capability:"cdr.state.derive",pattern:/^(?=.*\bstate[\s-]?machines?\b)(?=.*\b(?:derive|draft|generate|create|build)\b).*/i,inputBuilder:(t,e)=>({entity:e.entity||xt(t)||"all",repo:e.repo||ue(t)||""}),reason:"cdr state derive intent (state machine)",confidence:.92,tags:["cdr","state"],priority:100},{id:"cdr.state.derive.chinese",capability:"cdr.state.derive",pattern:/推导.*状态机|状态机.*(?:推导|生成|构建)/i,inputBuilder:(t,e)=>({entity:e.entity||xt(t)||"all",repo:e.repo||ue(t)||""}),reason:"cdr state derive intent (chinese)",confidence:.92,tags:["cdr","state","chinese"],priority:100},{id:"cdr.behavior.upsert.english",capability:"cdr.behavior.upsert",pattern:/^(?!.*\bcognitive\b)(?=.*\bupsert\b)(?=.*\bbehaviors?\b).*/i,inputBuilder:(t,e)=>({id:e.id||W(t,/\bupsert\s+behaviors?\s+([a-zA-Z0-9_.-]+)/i),repo:e.repo||ue(t)||""}),reason:"cdr behavior upsert intent",confidence:.93,tags:["cdr","behavior"],priority:100},{id:"cdr.behavior.upsert.write.english",capability:"cdr.behavior.upsert",pattern:/^(?!.*\bcognitive\b)(?=.*\b(?:write|insert|index)\b)(?=.*\bbehaviors?\b).*/i,inputBuilder:(t,e)=>({id:e.id||W(t,/\b(?:write|insert|index)\s+behaviors?\s+([a-zA-Z0-9_.-]+)/i),repo:e.repo||ue(t)||""}),reason:"cdr behavior upsert intent (write form)",confidence:.9,tags:["cdr","behavior"],priority:100},{id:"cdr.behavior.upsert.chinese",capability:"cdr.behavior.upsert",pattern:/(?:写入|索引|更新)\s*行为(?:产物|链路)?|行为\s*(?:写入|索引)/i,inputBuilder:(t,e)=>({id:e.id||"",repo:e.repo||ue(t)||""}),reason:"cdr behavior upsert intent (chinese)",confidence:.92,tags:["cdr","behavior","chinese"],priority:100},{id:"cdr.entries.candidate.english",capability:"cdr.entries.candidate",pattern:/^(?:(?=.*\b(?:entry|entries)\s+(?:candidates?|files?)\b)|(?=.*\b(?:candidates?|files?)\s+(?:for\s+)?(?:entry|entries)\b)).*/i,inputBuilder:(t,e)=>({repo:e.repo||ue(t)||""}),reason:"cdr entries candidate intent",confidence:.92,tags:["cdr","entries"],priority:100},{id:"cdr.entries.candidate.chinese",capability:"cdr.entries.candidate",pattern:/入口候选|候选入口|入口文件/i,inputBuilder:(t,e)=>({repo:e.repo||ue(t)||""}),reason:"cdr entries candidate intent (chinese)",confidence:.92,tags:["cdr","entries","chinese"],priority:100},{id:"cdr.entries.propose.english",capability:"cdr.entries.propose",pattern:/^(?=.*\b(?:propose|submit)\b)(?=.*\bentr(?:y|ies)\b).*/i,inputBuilder:(t,e)=>({repo:e.repo||ue(t)||"",id:e.id||zt(t)||"",file:e.file||W(t,/--file[=\s]+(\S+)/i)||""}),reason:"cdr entries propose intent",confidence:.92,tags:["cdr","entries"],priority:100},{id:"cdr.entries.propose.chinese",capability:"cdr.entries.propose",pattern:/提交.*入口|入口.*提交/i,inputBuilder:(t,e)=>({repo:e.repo||ue(t)||"",id:e.id||zt(t)||"",file:e.file||W(t,/--file[=\s]+(\S+)/i)||""}),reason:"cdr entries propose intent (chinese)",confidence:.92,tags:["cdr","entries","chinese"],priority:100},{id:"cdr.query.byTarget.english",capability:"cdr.query",pattern:/^(?=.*\b(?:query|search|find)\b)(?=.*\bbehaviors?\b).*/i,inputBuilder:(t,e)=>({target:e.target||"any",entity:e.entity||xt(t)||"",id_contains:e.id_contains||W(t,/\bid contains\s+([a-zA-Z0-9_.-]+)/i)||"",event:e.event||W(t,/\bemit(?:s|ting)?\s+([a-zA-Z0-9_.-]+)/i)||"",calls_target:e.calls_target||W(t,/\bcall(?:s|ing)?\s+([A-Za-z0-9_.-]+)/i)||"",created_by_feature:e.created_by_feature||W(t,/\bcreated by feature\s+([a-zA-Z0-9_-]+)/i)||"",target_repo:e.target_repo||W(t,/\bin\s+([a-z][a-zA-Z0-9_-]*)\s*$/i)||"",repo:e.repo||""}),reason:"cdr query intent (read-only cross-repo lookup)",confidence:.93,tags:["cdr","query"],priority:100},{id:"cdr.query.byFilter.english",capability:"cdr.query",pattern:/^(?!.*\b(?:discover|analyze)\b)(?=.*\b(?:behaviors?|state[\s-]?machines?|domains?|business[\s-]?rules?|capability[\s-]?maps?)\b)(?=.*\b(?:created by feature|emits?|emitting|calls?|calling|writes|reads|exposes?)\b).*/i,inputBuilder:(t,e)=>({target:e.target||"any",entity:e.entity||xt(t)||"",id_contains:e.id_contains||W(t,/\bid contains\s+([a-zA-Z0-9_.-]+)/i)||"",event:e.event||W(t,/\bemit(?:s|ting)?\s+([a-zA-Z0-9_.-]+)/i)||"",calls_target:e.calls_target||W(t,/\bcall(?:s|ing)?\s+([A-Za-z0-9_.-]+)/i)||"",created_by_feature:e.created_by_feature||W(t,/\bcreated by feature\s+([a-zA-Z0-9_-]+)/i)||"",target_repo:e.target_repo||W(t,/\bin\s+([a-z][a-zA-Z0-9_-]*)\s*$/i)||"",repo:e.repo||""}),reason:"cdr query intent (filtered lookup)",confidence:.93,tags:["cdr","query"],priority:100},{id:"cdr.query.chinese",capability:"cdr.query",pattern:/(?:查询|查找|搜索).*(?:行为|状态机|业务规则|领域|资产)/i,inputBuilder:(t,e)=>({target:e.target||"any",entity:e.entity||"",target_repo:e.target_repo||ue(t)||"",repo:e.repo||""}),reason:"cdr query intent (chinese)",confidence:.9,tags:["cdr","query","chinese"],priority:100},{id:"cdr.pipeline.status.english",capability:"cdr.pipeline.status",pattern:/^(?=.*\bpipeline\b)(?=.*\b(?:status|progress|next|phase)\b).*/i,inputBuilder:(t,e)=>({repo:e.repo||ue(t)||""}),reason:"cdr pipeline status intent",confidence:.92,tags:["cdr","pipeline"],priority:100},{id:"cdr.pipeline.status.chinese",capability:"cdr.pipeline.status",pattern:/pipeline.*(?:状态|进度|阶段)|(?:状态|进度).*pipeline/i,inputBuilder:(t,e)=>({repo:e.repo||ue(t)||""}),reason:"cdr pipeline status intent (chinese)",confidence:.9,tags:["cdr","pipeline","chinese"],priority:100},{id:"cdr.feature.link.english",capability:"cdr.feature.link",pattern:/^(?=.*\bfeature\b)(?=.*\blink\b).*/i,inputBuilder:(t,e)=>({feature:e.feature||qn(t),mode:/backfill/i.test(t)?"backfill":"audit",repo:e.repo||""}),reason:"cdr feature link intent",confidence:.9,tags:["cdr","feature"],priority:100},{id:"cdr.feature.link.chinese",capability:"cdr.feature.link",pattern:/(?:关联|链接).*(?:feature|特性|资产)/i,inputBuilder:(t,e)=>({feature:e.feature||qn(t),mode:/backfill|回填/i.test(t)?"backfill":"audit",repo:e.repo||""}),reason:"cdr feature link intent (chinese)",confidence:.9,tags:["cdr","feature","chinese"],priority:100},{id:"cdr.stale.scan.english",capability:"cdr.stale.scan",pattern:/^(?=.*\bstale\b)(?=.*\b(?:scan|scanning|diff)\b).*/i,inputBuilder:(t,e)=>({repo:e.repo||ue(t)||"",base:e.base||W(t,/--base[=\s]+(\S+)/i)||"",head:e.head||W(t,/--head[=\s]+(\S+)/i)||""}),reason:"cdr stale scan intent",confidence:.92,tags:["cdr","stale"],priority:100},{id:"cdr.stale.scan.chinese",capability:"cdr.stale.scan",pattern:/(?:过期|陈旧|失效).*(?:扫描|检测|diff)/i,inputBuilder:(t,e)=>({repo:e.repo||ue(t)||""}),reason:"cdr stale scan intent (chinese)",confidence:.9,tags:["cdr","stale","chinese"],priority:100},{id:"cdr.asset.stalecheck.english",capability:"cdr.asset.stalecheck",pattern:/^(?=.*\bstale\b)(?=.*\b(?:check|checking|verify|clear|patch)\b).*/i,inputBuilder:(t,e)=>({repo:e.repo||ue(t)||"",clear_stale:/--clear/.test(t)}),reason:"cdr asset stalecheck intent",confidence:.9,tags:["cdr","stale"],priority:100},{id:"cdr.asset.stalecheck.chinese",capability:"cdr.asset.stalecheck",pattern:/(?:过期|陈旧).*(?:检查|清理|标记)/i,inputBuilder:(t,e)=>({repo:e.repo||ue(t)||"",clear_stale:/--clear|清理/.test(t)}),reason:"cdr asset stalecheck intent (chinese)",confidence:.9,tags:["cdr","stale","chinese"],priority:100},{id:"cdr.architecture.driftcheck.english",capability:"cdr.architecture.driftcheck",pattern:/^(?=.*\barchitecture\b)(?=.*\bdrift\b).*/i,inputBuilder:(t,e)=>({feature:e.feature||qn(t),repo:e.repo||ue(t)||""}),reason:"cdr architecture driftcheck intent",confidence:.92,tags:["cdr","architecture"],priority:100},{id:"cdr.architecture.driftcheck.chinese",capability:"cdr.architecture.driftcheck",pattern:/架构.*(?:漂移|偏移|drift)/i,inputBuilder:(t,e)=>({feature:e.feature||qn(t),repo:e.repo||ue(t)||""}),reason:"cdr architecture driftcheck intent (chinese)",confidence:.92,tags:["cdr","architecture","chinese"],priority:100},{id:"cdr.context.envelope.english",capability:"cdr.context.envelope",pattern:/^(?=.*\benvelope\b).*/i,inputBuilder:(t,e)=>{let n=e.target||ss(t);return{...n?{target:n}:{},id:e.id||zt(t)||ue(t)||""}},reason:"cdr context envelope intent (single-artifact bundle)",confidence:.92,tags:["cdr","context"],priority:100},{id:"cdr.context.envelope.chinese",capability:"cdr.context.envelope",pattern:/(?:上下文|语境).*(?:封套|信封|包|bundle)/i,inputBuilder:(t,e)=>{let n=e.target||ss(t);return{...n?{target:n}:{},id:e.id||zt(t)||ue(t)||""}},reason:"cdr context envelope intent (chinese)",confidence:.9,tags:["cdr","context","chinese"],priority:100},{id:"cognitive.artifact.upsert.english",capability:"cognitive.artifact.upsert",pattern:/^(?=.*\bcognitive\b)(?=.*\b(?:upsert|write|index|insert)\b).*/i,inputBuilder:(t,e)=>({type:/状态机|state[\s-]?machine/i.test(t)?"state-machine":"behavior",content:e.content||"",file:e.file||W(t,/--file[=\s]+(\S+)/i)||""}),reason:"cognitive artifact upsert intent",confidence:.92,tags:["cognitive","artifact"],priority:100},{id:"cognitive.artifact.upsert.chinese",capability:"cognitive.artifact.upsert",pattern:/(?:写入|索引|更新).*(?:认知|产物)/i,inputBuilder:(t,e)=>({type:/状态机/.test(t)?"state-machine":"behavior",content:e.content||"",file:e.file||""}),reason:"cognitive artifact upsert intent (chinese)",confidence:.92,tags:["cognitive","artifact","chinese"],priority:100},{id:"cognitive.artifact.validate.english",capability:"cognitive.artifact.validate",pattern:/^(?=.*\bcognitive\b)(?=.*\b(?:validate|validation|check)\b).*/i,inputBuilder:(t,e)=>({type:/状态机|state[\s-]?machine/i.test(t)?"state-machine":"behavior",content:e.content||"",file:e.file||W(t,/--file[=\s]+(\S+)/i)||""}),reason:"cognitive artifact validate intent",confidence:.93,tags:["cognitive","artifact"],priority:100},{id:"cognitive.artifact.validate.chinese",capability:"cognitive.artifact.validate",pattern:/(?:校验|验证).*(?:认知|产物)/i,inputBuilder:(t,e)=>({type:/状态机/.test(t)?"state-machine":"behavior",content:e.content||"",file:e.file||""}),reason:"cognitive artifact validate intent (chinese)",confidence:.92,tags:["cognitive","artifact","chinese"],priority:100},{id:"cognitive.explore.english",capability:"cognitive.explore",pattern:/^(?=.*\bcognitive\b)(?=.*\bexplore\b).*/i,inputBuilder:(t,e)=>({intent:e.intent||t,repo:e.repo||ue(t)||""}),reason:"cognitive explore intent",confidence:.92,tags:["cognitive"],priority:100},{id:"cognitive.explore.chinese",capability:"cognitive.explore",pattern:/认知.*(?:探索|调研|研究)/i,inputBuilder:(t,e)=>({intent:e.intent||t,repo:e.repo||ue(t)||""}),reason:"cognitive explore intent (chinese)",confidence:.9,tags:["cognitive","chinese"],priority:100},{id:"cdr.capability.map.build.english",capability:"cdr.capability.map.init",pattern:/^(?!.*\b(?:init|initialize|synth(?:esize)?)\b)(?=.*\bcapability\b)(?=.*\bmap\b).*/i,inputBuilder:(t,e)=>({product:e.product||Yt(t)||""}),reason:"cdr capability map init intent (verb-less build form)",confidence:.9,tags:["cdr","capability-map"],priority:100},{id:"cdr.business.compose.english",capability:"cdr.business.compose",pattern:/^(?=.*\bcompose\b)(?=.*\b(?:business|rule|ruleset|invariant)\b).*/i,inputBuilder:(t,e)=>({id:e.id||W(t,/\bcompose\s+business(?:\s+rules?)?\s+([a-zA-Z0-9_.-]+)/i),kind:e.kind||"invariant",description:e.description||Yr(t)||""}),reason:"cdr business compose intent",confidence:.91,tags:["cdr","business-rule"],priority:100}];var dn={id:"fallback",capability:"feature.status",pattern:/.*/,inputBuilder:()=>({}),reason:"fallback (no match)",confidence:.1,tags:["fallback"],priority:1e3};function Yn(t,e,n){let r;for(let i of n)i.pattern.test(t)&&(r&&i.confidence<r.route.confidence||r&&i.confidence===r.route.confidence&&(i.priority??100)>(r.route.priority??100)||(r={route:i,result:{capability:i.capability,input:i.inputBuilder(t,e),reason:i.reason,confidence:i.confidence}}));return r||{route:dn,result:{capability:dn.capability,input:{},reason:dn.reason,confidence:dn.confidence}}}function as(t,e={}){return Yn(t,e,zn).result}function _t(t,e){let n=e.indexOf(t);return n>=0?e[n+1]:void 0}function cs(t){return t?JSON.parse(t):{}}function pl(t){let[e,n,r,...i]=t;if(!e)throw new A("INVALID_INPUT","missing command");if(e==="init"&&n==="workspace")return{capability:"workspace.init",input:{}};if(e==="repos"&&n==="add")return{capability:"repos.add",input:{name:r,url:i[0]}};if(e==="repos"&&n==="sync")return{capability:"repos.sync",input:{target:r}};if(e==="repos"&&n==="list")return{capability:"repos.list",input:{}};if(e==="repos"&&n==="check")return{capability:"repos.check",input:{target:r}};if(e==="repos"&&n==="analyze")return{capability:"repos.analyze",input:{target:r}};if(e==="cognitive"&&n==="discover")return{capability:"cognitive.discover",input:{target:r||"--all"}};if(e==="cognitive"&&n==="list")return{capability:"cognitive.artifact.list",input:{}};if(e==="cognitive"&&n==="validate")return{capability:"cognitive.artifact.validate",input:{type:r,file:i[0]}};if(e==="cognitive"&&n==="upsert")return{capability:"cognitive.artifact.upsert",input:{type:r,file:i[0]}};if(e==="cognitive"&&n==="state"&&r==="suggest")return{capability:"cognitive.state.suggest",input:{entity:i[0]||"Order"}};if(e==="create"&&n==="feature"){let a=_t("--repos",i)||"",s=_t("--objective",i)||"";return{capability:"feature.create",input:{name:r,repos:a,objective:s}}}if(e==="context"&&n==="build")return{capability:"context.build",input:{feature:r,stage:_t("--stage",i)||"general"}};if(e==="run"&&n==="workflow")return{capability:"workflow.runStage",input:{feature:r,stage:_t("--stage",i)||"",confirmed:i.includes("--yes")}};if(e==="validate"&&n==="feature")return{capability:"validation.run",input:{feature:r}};if(e==="review"&&n==="feature")return{capability:"feature.review",input:{feature:r}};if(e==="report"&&n==="feature")return{capability:"feature.report",input:{feature:r}};if(e==="close"&&n==="feature")return{capability:"feature.close",input:{feature:r,confirmed:i.includes("--yes"),force:i.includes("--force")}};if(e==="status"&&n==="feature")return{capability:"feature.status",input:{}};throw new A("INVALID_INPUT","unknown legacy command")}function dl(t){let[e,...n]=t;return e==="run"&&n[0]!=="workflow"?{cmd:e,args:n}:e==="route"?{cmd:e,args:n}:{cmd:"legacy",args:t}}async function ul(){let t=ll(process.env.DAPEI_WORKSPACE_ROOT||process.cwd()),e=dl(process.argv.slice(2));try{if(e.cmd==="run"){let i=_t("--capability",e.args)||e.args[0],a=cs(_t("--input",e.args)),{result:s}=await jr(i,a,{rootDir:t,now:new Date}),c=s.data;c&&typeof c=="object"&&typeof c.text=="string"?console.log(c.text):console.log(JSON.stringify(s,null,2));return}if(e.cmd==="route"){let i=_t("--intent",e.args)||"",a=cs(_t("--context",e.args)),s=as(i,a);console.log(JSON.stringify(s,null,2));return}if(e.args.length===0&&e.cmd==="legacy"){console.log(`Usage:
  dapei init workspace
  dapei repos add <name> <git-url>
  dapei repos sync <name|--all>
  dapei repos list
  dapei repos check <name|--all>
  dapei repos analyze <name|--all>
  dapei create feature <name> --repos repo1,repo2 [--objective "..."]
  dapei context build <feature> [--stage <stage>]
  dapei run workflow <feature> --stage <stage>
  dapei validate feature <name>
  dapei review feature <name>
  dapei report feature <name>
  dapei close feature <name>
  dapei status feature`),process.exitCode=1;return}let n=pl(e.args[0]==="@dapei"?e.args.slice(1):e.args),{result:r}=await jr(n.capability,n.input,{rootDir:t,now:new Date});r.data.text?console.log(r.data.text):r.data.message&&console.log(`[dapei] ${r.data.message}`)}catch(n){n instanceof A&&(console.error(`[dapei][error] ${n.message}`),process.exit(1)),console.error(n?.message||String(n)),process.exit(1)}}ul();
/*! Bundled license information:

js-yaml/dist/js-yaml.mjs:
  (*! js-yaml 4.2.0 https://github.com/nodeca/js-yaml @license MIT *)
*/
