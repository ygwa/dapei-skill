import { workspaceInit, workspaceReport, workspaceStatus, workspaceValidate } from "./domains/workspace.ts";
import { reposAdd, reposAnalyze, reposCheck, reposList, reposRemove, reposSync } from "./domains/repos.ts";
import { featureClose, featureCreate, featureReview, featureStage, featureStatus, featureTasks, featureAssign, featureHandoff, featureTeamStatus } from "./domains/feature.ts";
import { contextBuild } from "./domains/context.ts";
import { workflowRunStage, workflowStatus } from "./domains/workflow.ts";
import { featureReport, featureGuardrail, validationDetect, validationExecute, validationReport, validationRun } from "./domains/reporting.ts";
import {
  cognitiveArtifactList,
  cognitiveArtifactUpsert,
  cognitiveArtifactValidate,
  cognitiveDiscover,
  cognitiveStateSuggest,
  cognitiveExplore
} from "./domains/cognitive.ts";
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
} from "../../../cdr/src/capabilities.ts";
import { docGenerate } from "../../../doc-gen/src/doc-gen.ts";
import { memoryAppend } from "./domains/memory.ts";
import { auditQuery } from "./domains/audit.ts";
import type { CapabilitySpec } from "../types.ts";

export type AnyCap = CapabilitySpec<any, any>;

export const capabilitySpecs: AnyCap[] = [
  workspaceInit,
  workspaceReport,
  workspaceStatus,
  workspaceValidate,
  reposAdd,
  reposSync,
  reposList,
  reposCheck,
  reposAnalyze,
  reposRemove,
  featureCreate,
  contextBuild,
  workflowRunStage,
  workflowStatus,
  validationRun,
  validationDetect,
  validationExecute,
  validationReport,
  featureGuardrail,
  featureReport,
  featureStatus,
  featureStage,
  featureTasks,
  featureReview,
  featureClose,
  featureAssign,
  featureHandoff,
  featureTeamStatus,
  memoryAppend,
  auditQuery,
  cognitiveDiscover,
  cognitiveArtifactValidate,
  cognitiveArtifactUpsert,
  cognitiveArtifactList,
  cognitiveStateSuggest,
  cognitiveExplore,
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
