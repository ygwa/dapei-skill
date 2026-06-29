---
id: ADR-0014
title: "UI Tone 8-tone system — semantic color tokens for all status visuals"
status: proposed
date: 2026-06-26
deciders: [ygwa]
technical-story: "feature/m3-ui-density (PR-1)"
---

## Problem Statement

The desktop renderer is currently littered with ad-hoc Tailwind color
classes (`bg-emerald-50 text-emerald-700`, `bg-amber-50`, `bg-red-50`, etc.)
scattered across views. The same semantic idea ("warning", "active",
"completed") gets rendered differently in different files, sometimes
because the intent diverges and sometimes because of copy-paste drift.

Three problems caused by this:

1. **Inconsistency** — `bg-slate-50` and `bg-slate-100` mean different
   things in different files; "success" sometimes renders green,
   sometimes teal.
2. **Density upgrade friction** — when adding the prototype-style
   `WorkspaceHealthBar` + 6-field `FeatureCard`, the new components
   had to invent new color choices, perpetuating the drift.
3. **Tailwind class fraud** — the reference prototype at
   `~/Downloads/ui.tsx` uses non-existent classes (`bg-slate-750`,
   `bg-slate-850`, `bg-indigo-550`, `bg-indigo-655`,
   `border-slate-255`). Tailwind v4 emits no warnings for unknown
   classes; the bug ships silently.

## Constraints

- Renderer-only — no engine / IPC changes.
- Tailwind v4 (not v3). No `tailwind.config` extension; ADR forbids
  adding custom color shades that would re-introduce the prototype's
  class fraud.
- All new components in this PR and downstream PRs MUST consume
  `toneClasses(tone)` rather than raw `bg-*` / `text-*` color classes.
- ADR-0016 / 0017 / 0019 field additions (objective / priority /
  syncStatus / suggestion) must use this same tone vocabulary so the
  contract stays decoupled from the palette.

## Decision

Adopt an **8-tone semantic system** in
`packages/ui/src/lib/status-colors.ts`, exposed through a single
`<ToneBadge>` primitive in `packages/ui/src/components/ToneBadge.tsx`.

### The 8 tones

| Tone | Semantic | Palette (Tailwind v4) |
|---|---|---|
| `neutral` | not-started / dormant / placeholder | slate |
| `info` | in-progress / informational | blue |
| `active` | current focus / agent online | indigo |
| `success` | completed / synced / ready | emerald |
| `warning` | behind / blocked / lagging | amber |
| `danger` | failed / conflict / broken | red |
| `pending` | awaiting gate / queued | orange |
| `insight` | agent suggestion / cognitive artifact | violet |

Each tone maps to a 5-tuple:

```ts
interface ToneClasses {
  bg: string;        // solid bg for filled badges
  bgSubtle: string;  // subtle bg for cards / banners / hover
  text: string;      // foreground text on subtle bg
  border: string;    // outlined elements
  ring: string;      // focus state
}
```

### Domain-specific tone mappers

The same module also exposes typed mappers that turn domain values
into tones, so views never have to remember the mapping:

```ts
stageTone("方案设计")            // → "active"
repoSyncTone("behind")            // → "warning"
priorityTone("P0")                // → "danger"
```

These mappers take `string | undefined` and fall back to `neutral`,
which means the components gracefully degrade before the new
ADR-0016 / 0017 fields land (Contract-first path; see
`.omo/plans/ui-density-m3.md` §1.2).

### `<ToneBadge>` primitive

Three variants: `filled` (solid bg, white text), `subtle`
(default; bgSubtle + text), `outline` (white bg + border + text).
Pill or rectangular. Optional icon. Always requires children
(no empty badges).

### Forbidden

- Any raw `bg-{emerald|amber|red|orange|blue|violet|slate|indigo}-*`
  in `apps/electron/src/renderer/**` or in `packages/ui/src/**`
  going forward. PR-6 (color sweep) will sweep stragglers.
- Custom Tailwind palette extensions (no `slate-750` etc.). The
  prototype's class fraud must not be replicated.

## Consequences

### Positive

- Single source of truth for status visuals. Future palette tweaks
  are 1-file changes.
- Domain mappers (`stageTone`, `priorityTone`, `repoSyncTone`) make
  views self-documenting: `<ToneBadge tone={stageTone(f.stage)}>` is
  more readable than ad-hoc conditional classes.
- ADR-0016 / 0017 fields land cleanly: their renderers consume the
  tone system rather than inventing new color choices.
- Tailwind class fraud eliminated by definition (the tone map is
  the only legal color source).

### Negative

- One extra layer of indirection: views can't directly grep "what
  color is `success`" — they need to read `status-colors.ts`. This
  is the right tradeoff; the alternative is 5+ files with bespoke
  color decisions.
- Migrating existing views is mechanical but not free. PR-6 will
  sweep `bg-emerald-50` / `bg-amber-50` / etc. across the renderer.

## Implementation Status

PR-1 of `.omo/plans/ui-density-m3.md` ships:

- `packages/ui/src/lib/status-colors.ts` — the 8-tone map +
  domain mappers.
- `packages/ui/src/components/ToneBadge.tsx` — the primitive.
- 4 new view primitives that already consume the tone system
  (`FeatureCard`, `WorkspaceHealthBar`, `RepoSummaryCard`,
  `KnowledgeSummaryCard`).
- Exported via `packages/ui/src/index.ts`.

Existing views (`DashboardView`, `FeatureListView`,
`FeatureWorkbenchView`, `ReposView`, `KnowledgeView`) still use raw
classes — that's PR-2 onwards.

## Verification

- `pnpm --filter @dapei/desktop-ui typecheck` clean.
- `pnpm test` — 61/61 golden tests pass (PR-1 is pure-additive; no
  contract change).
- `pnpm build` — `out/renderer/assets/index.css` 40.27 kB (grew
  from prior build due to new tone classes).
- Tailwind v4 `@source "../../../../../packages/ui/src"` in
  `apps/electron/src/renderer/src/index.css` ensures the new classes
  are emitted.

## Open Questions

- **Dark mode**: out of scope for M3-UI. When dark mode lands,
  `ToneClasses` gets a `dark:` variant per tone (Tailwind v4
  syntax). Pre-planning in §1.3 of the plan.
- **Accessibility contrast**: current slate/blue/etc. pairings meet
  WCAG AA for body text but not always for 10px labels. PR-6 may
  upgrade some tone mappings.