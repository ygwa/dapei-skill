import { workspaceInit, workspaceReport, workspaceStatus, workspaceValidate } from "./domains/workspace.ts";
import { reposAdd, reposAnalyze, reposCheck, reposList, reposRemove, reposSync } from "./domains/repos.ts";
import { featureClose, featureCreate, featureReview, featureStage, featureStatus, featureTasks, featureAssign, featureHandoff, featureTeamStatus, featureGapAnalysis, featureStageTransition, featureAccept } from "./domains/feature.ts";
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
import { memoryAppend } from "./domains/memory.ts";
import { auditQuery } from "./domains/audit.ts";
import type { CapabilitySpec } from "../types.ts";

export type AnyCap = CapabilitySpec<any, any>;

/**
 * Core capability specs — the kernel-owned capabilities only.
 *
 * Capabilities implemented by sibling packages (`packages/cdr`,
 * `packages/doc-gen`) are NOT listed here: core must not depend on
 * them. The composition root (`packages/catalog/src/index.ts`) composes
 * these specs with the cdr/doc-gen specs into the full registry.
 */
export const coreCapabilitySpecs: AnyCap[] = [
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
  featureGapAnalysis,
  featureStageTransition,
  featureAccept,
  memoryAppend,
  auditQuery,
  cognitiveDiscover,
  cognitiveArtifactValidate,
  cognitiveArtifactUpsert,
  cognitiveArtifactList,
  cognitiveStateSuggest,
  cognitiveExplore
];
