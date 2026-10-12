// Composition root for the dapei capability engine.
//
// `packages/core` owns the kernel (registry, schema validation, audit
// log, generic runner) and the core capabilities; it must not import
// `packages/cdr` or `packages/doc-gen`. This package is the single
// place that knows the full capability set: it collects the core specs
// plus the cdr and doc-gen specs, registers them with the kernel, and
// re-exports the public surface consumers use (`capabilitySpecs`,
// `capabilities`, `runCapability`).
//
// Dependency direction (acyclic):
//
//   catalog → core, cdr, doc-gen
//   cdr     → core, runtime-adapters
//   doc-gen → core, runtime-adapters

import { coreCapabilitySpecs, runCapabilityWith, type AnyCap } from "@dapei/core";
import type { CapabilityContext, Json } from "@dapei/core/types";
import {
  cdrProfile,
  cdrEntriesCandidate,
  cdrEntriesPropose,
  cdrEntriesPrepare,
  cdrEntriesConfirm,
  cdrDomainCompose,
  cdrCapabilityMapInit,
  cdrIndexList,
  cdrBehaviorUpsert,
  cdrStateDerive,
  cdrBusinessCompose,
  cdrAssetStaleCheck,
  cdrArchitectureDriftCheck,
  cdrBusinessCrossLink,
  cdrCrossRepoDocGenerate,
  cdrStaleScan,
  cdrDomainSuggest,
  cdrCapabilityMapSynth,
  cdrReverseClusterDocGenerate,
  cdrQuery,
  cdrPipelineStatus,
  cdrFeatureLink,
  cdrBootstrap,
  cdrContextEnvelope
} from "@dapei/cdr/capabilities";
import { docGenerate } from "@dapei/doc-gen";

export const capabilitySpecs: AnyCap[] = [
  ...coreCapabilitySpecs,
  // CDR capabilities
  cdrProfile,
  cdrEntriesCandidate,
  cdrEntriesPropose,
  cdrEntriesPrepare,
  cdrEntriesConfirm,
  cdrDomainCompose,
  cdrCapabilityMapInit,
  cdrIndexList,
  cdrBehaviorUpsert,
  cdrStateDerive,
  cdrBusinessCompose,
  cdrAssetStaleCheck,
  cdrArchitectureDriftCheck,
  cdrBusinessCrossLink,
  cdrCrossRepoDocGenerate,
  cdrStaleScan,
  cdrDomainSuggest,
  cdrCapabilityMapSynth,
  cdrReverseClusterDocGenerate,
  cdrQuery,
  cdrPipelineStatus,
  cdrFeatureLink,
  cdrBootstrap,
  cdrContextEnvelope,
  // Documentation generation
  docGenerate
];

export const capabilities: Record<string, AnyCap> = Object.fromEntries(
  capabilitySpecs.map((spec) => [spec.id, spec])
);

// The composition root owns the full spec set, so it binds the generic
// runner (`runCapabilityWith`) to it here. There is exactly one runner
// implementation, shared with any other composition root.
export function runCapability(id: string, input: Record<string, Json>, ctx: CapabilityContext) {
  return runCapabilityWith(capabilitySpecs, id, input, ctx);
}
