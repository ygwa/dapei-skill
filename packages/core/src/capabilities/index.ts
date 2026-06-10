import { workspaceInit, workspaceReport, workspaceStatus, workspaceValidate } from "./domains/workspace.ts";
import { reposAdd, reposAnalyze, reposCheck, reposList, reposRemove, reposSync } from "./domains/repos.ts";
import { featureClose, featureCreate, featureReview, featureStage, featureStatus, featureTasks } from "./domains/feature.ts";
import { contextBuild } from "./domains/context.ts";
import { workflowRunStage, workflowStatus } from "./domains/workflow.ts";
import { featureReport, featureGuardrail, validationDetect, validationExecute, validationReport, validationRun } from "./domains/reporting.ts";
import {
  cognitiveArtifactList,
  cognitiveArtifactUpsert,
  cognitiveArtifactValidate,
  cognitiveDiscover,
  cognitiveStateSuggest
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
  cdrBusinessCrossLink,
  cdrCrossRepoDocGenerate,
  cdrStaleScan,
  cdrDomainSuggest
} from "./domains/cdr.ts";
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
  memoryAppend,
  auditQuery,
  cognitiveDiscover,
  cognitiveArtifactValidate,
  cognitiveArtifactUpsert,
  cognitiveArtifactList,
  cognitiveStateSuggest,
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
  cdrBusinessCrossLink,
  cdrCrossRepoDocGenerate,
  cdrStaleScan,
  cdrDomainSuggest,
  // Documentation generation
  docGenerate
];

export const capabilities: Record<string, AnyCap> = Object.fromEntries(
  capabilitySpecs.map((spec) => [spec.id, spec])
);
