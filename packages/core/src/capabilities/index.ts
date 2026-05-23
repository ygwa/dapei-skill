import { workspaceInit } from "./domains/workspace.ts";
import { reposAdd, reposAnalyze, reposList, reposSync } from "./domains/repos.ts";
import { featureClose, featureCreate, featureReview, featureStatus } from "./domains/feature.ts";
import { contextBuild } from "./domains/context.ts";
import { workflowRunStage } from "./domains/workflow.ts";
import { featureReport, guardrailRun, validationRun } from "./domains/reporting.ts";
import type { CapabilitySpec } from "../types.ts";

export type AnyCap = CapabilitySpec<any, any>;

export const capabilitySpecs: AnyCap[] = [
  workspaceInit,
  reposAdd,
  reposSync,
  reposList,
  reposAnalyze,
  featureCreate,
  contextBuild,
  workflowRunStage,
  validationRun,
  guardrailRun,
  featureReport,
  featureStatus,
  featureReview,
  featureClose
];

export const capabilities: Record<string, AnyCap> = Object.fromEntries(
  capabilitySpecs.map((spec) => [spec.id, spec])
);
