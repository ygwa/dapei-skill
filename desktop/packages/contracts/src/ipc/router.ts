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

// ---- feature.* ----

export const featureListRequestSchema = z.object({}).strict();

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
  [IPC_CHANNELS.feature.list]: featureListRequestSchema
} as const;

export type ChannelWithSchema = keyof typeof REQUEST_SCHEMAS;
