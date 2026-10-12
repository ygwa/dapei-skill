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

import { coreCapabilitySpecs, registerCapabilitySpecs, runCapability, type AnyCap } from "../../core/src/index.ts";
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
} from "../../cdr/src/capabilities.ts";
import { docGenerate } from "../../doc-gen/src/doc-gen.ts";

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

// Register the full spec set with the kernel so that internal core
// callers (which resolve capabilities through core's `runCapability`)
// can dispatch cdr/doc-gen capabilities too. The specs themselves are
// exported above; `runCapability` is re-exported from core so there is
// exactly one runner implementation.
registerCapabilitySpecs(capabilitySpecs);

export { runCapability };
