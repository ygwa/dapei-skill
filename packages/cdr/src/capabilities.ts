// Public entry for the `@dapei/cdr/capabilities` subpath. The 24 CDR
// capability specs used to live in this file; they now live in the sibling
// domain modules below and are re-exported here so existing consumers
// (`@dapei/catalog`, tests, scripts/validate-skills.mjs) keep working.
export { cdrProfile, cdrEntriesCandidate, cdrEntriesPropose, cdrEntriesPrepare, cdrEntriesConfirm } from "./entry-discovery.ts";
export { cdrDomainCompose, cdrBusinessCompose, cdrCapabilityMapInit, cdrIndexList } from "./compose.ts";
export { cdrQuery, cdrPipelineStatus } from "./read-query.ts";
export { cdrFeatureLink } from "./feature-link.ts";
export { cdrBehaviorUpsert, cdrStateDerive } from "./artifact-writers.ts";
export { cdrStaleScan, cdrAssetStaleCheck, cdrArchitectureDriftCheck } from "./staleness.ts";
export { cdrBusinessCrossLink, cdrCrossRepoDocGenerate } from "./cross-repo.ts";
export { cdrDomainSuggest, cdrCapabilityMapSynth } from "./clustering.ts";
export { cdrReverseClusterDocGenerate } from "./portal-sections.ts";
export { cdrBootstrap, cdrContextEnvelope } from "./envelope.ts";
export type { AnyCap } from "./internal/shared.ts";
