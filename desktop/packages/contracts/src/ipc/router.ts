import { IPC_CHANNELS } from "./channels.ts";

/** Zod schemas for every IPC channel. The router uses these to
 * validate the renderer payload before invoking the handler. */

import { z } from "zod";

// ---- workspace.* ----

export const workspaceListRecentsRequestSchema = z.object({}).strict();
export const workspaceOpenRequestSchema = z.object({ path: z.string().min(1) }).strict();
export const workspacePickDirectoryRequestSchema = z.object({}).strict();
export const workspaceInitRequestSchema = z.object({
  parentDir: z.string().min(1),
  name: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]{0,62}$/, "workspace name must be kebab-case")
}).strict();
export const workspaceStatusRequestSchema = z.object({}).strict();
export const workspaceValidateRequestSchema = z.object({}).strict();

// ---- repos.* ----

export const reposListRequestSchema = z.object({}).strict();
export const reposAddRequestSchema = z.object({
  name: z.string().min(1).regex(/^[a-z0-9][a-z0-9_-]{0,62}$/),
  url: z.string().min(1)
}).strict();
export const reposSyncRequestSchema = z.object({
  target: z.string().min(1)
}).strict();
export const reposProfileRequestSchema = z.object({
  name: z.string().min(1)
}).strict();

// ---- feature.* ----

export const featureListRequestSchema = z.object({}).strict();
export const featureCreateRequestSchema = z.object({
  name: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
  repos: z.string().min(1),
  objective: z.string().optional()
}).strict();
export const featureStatusRequestSchema = z.object({
  name: z.string().min(1)
}).strict();
export const featureStageRequestSchema = z.object({
  name: z.string().min(1)
}).strict();
export const featureRunStageRequestSchema = z.object({
  name: z.string().min(1),
  stage: z.string().min(1),
  confirmed: z.boolean().optional()
}).strict();
export const featureContextRequestSchema = z.object({
  name: z.string().min(1),
  stage: z.string().min(1)
}).strict();
export const featureTasksRequestSchema = z.object({
  name: z.string().min(1),
  action: z.enum(["list", "append"]).default("list"),
  content: z.string().optional()
}).strict();

/**
 * M3-2 schemas for the Close Feature wizard. These mirror the engine-side
 * shapes in `packages/core/src/capabilities/domains/feature.ts`
 * (`featureClose` v3.0.0 + `cdr.context.envelope`).
 */
export const featurePrepareCloseRequestSchema = z.object({
  feature: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]{0,62}$/)
}).strict();

export const featureCloseWithPromoteRequestSchema = z.object({
  feature: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
  confirmed: z.boolean().optional(),
  force: z.boolean().optional(),
  promote_artifacts: z.object({
    decisions: z.object({
      skip: z.boolean().optional(),
      target_path: z.string().min(1).optional()
    }).strict().optional(),
    architecture: z.object({
      entries: z.array(z.object({
        source_path: z.string().min(1),
        target_path: z.string().min(1)
      }).strict()).optional()
    }).strict().optional(),
    cognitive: z.object({
      unlink: z.array(z.object({
        kind: z.enum(["behavior", "state-machine", "domain", "business-rule", "capability-map"]),
        id: z.string().min(1),
        repo: z.string().optional()
      }).strict()).optional()
    }).strict().optional(),
    reports: z.object({
      copy_paths: z.array(z.string().min(1)).optional()
    }).strict().optional()
  }).strict().optional()
}).strict();

// ---- agent.* ----

export const agentListRequestSchema = z.object({}).strict();
export const agentAttachRequestSchema = z.object({
  backendId: z.string().min(1),
  cwd: z.string().min(1),
  feature: z.string().min(1).optional()
}).strict();
export const agentDetachRequestSchema = z.object({
  sessionId: z.string().min(1)
}).strict();
export const agentSendRequestSchema = z.object({
  sessionId: z.string().min(1),
  text: z.string().min(1)
}).strict();
export const agentInjectContextRequestSchema = z.object({
  sessionId: z.string().min(1),
  context: z.record(z.string(), z.unknown())
}).strict();
export const agentListBackendsRequestSchema = z.object({}).strict();

// ---- knowledge.* ----

export const knowledgePortalBuildRequestSchema = z.object({}).strict();
export const knowledgePortalUrlRequestSchema = z.object({}).strict();
export const knowledgeAssetTreeRequestSchema = z.object({}).strict();
export const knowledgeIndexListRequestSchema = z.object({}).strict();

/** Channel → request schema lookup. The router uses this to validate
 * the payload before invoking the handler. */
export const REQUEST_SCHEMAS = {
  [IPC_CHANNELS.workspace.listRecents]: workspaceListRecentsRequestSchema,
  [IPC_CHANNELS.workspace.open]: workspaceOpenRequestSchema,
  [IPC_CHANNELS.workspace.pickDirectory]: workspacePickDirectoryRequestSchema,
  [IPC_CHANNELS.workspace.init]: workspaceInitRequestSchema,
  [IPC_CHANNELS.workspace.status]: workspaceStatusRequestSchema,
  [IPC_CHANNELS.workspace.validate]: workspaceValidateRequestSchema,
  [IPC_CHANNELS.repos.list]: reposListRequestSchema,
  [IPC_CHANNELS.repos.add]: reposAddRequestSchema,
  [IPC_CHANNELS.repos.sync]: reposSyncRequestSchema,
  [IPC_CHANNELS.repos.profile]: reposProfileRequestSchema,
  [IPC_CHANNELS.feature.list]: featureListRequestSchema,
  [IPC_CHANNELS.feature.create]: featureCreateRequestSchema,
  [IPC_CHANNELS.feature.status]: featureStatusRequestSchema,
  [IPC_CHANNELS.feature.stage]: featureStageRequestSchema,
  [IPC_CHANNELS.feature.runStage]: featureRunStageRequestSchema,
  [IPC_CHANNELS.feature.context]: featureContextRequestSchema,
  [IPC_CHANNELS.feature.tasks]: featureTasksRequestSchema,
  [IPC_CHANNELS.feature.prepareClose]: featurePrepareCloseRequestSchema,
  [IPC_CHANNELS.feature.closeWithPromote]: featureCloseWithPromoteRequestSchema,
  [IPC_CHANNELS.agent.list]: agentListRequestSchema,
  [IPC_CHANNELS.agent.attach]: agentAttachRequestSchema,
  [IPC_CHANNELS.agent.detach]: agentDetachRequestSchema,
  [IPC_CHANNELS.agent.send]: agentSendRequestSchema,
  [IPC_CHANNELS.agent.injectContext]: agentInjectContextRequestSchema,
  [IPC_CHANNELS.agent.listBackends]: agentListBackendsRequestSchema,
  [IPC_CHANNELS.knowledge.portalBuild]: knowledgePortalBuildRequestSchema,
  [IPC_CHANNELS.knowledge.portalUrl]: knowledgePortalUrlRequestSchema,
  [IPC_CHANNELS.knowledge.assetTree]: knowledgeAssetTreeRequestSchema,
  [IPC_CHANNELS.knowledge.indexList]: knowledgeIndexListRequestSchema
} as const;

export type ChannelWithSchema = keyof typeof REQUEST_SCHEMAS;
