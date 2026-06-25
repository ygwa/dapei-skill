import { IPC_CHANNELS } from "./channels.ts";

/** Zod schemas for the M1-2 demonstrative channels. M1-3 / M1-4 add
 * more; each channel's Zod schema is the source of truth for the
 * payload shape on both sides of the IPC boundary. */

import { z } from "zod";

/** dapei:workspace:status — no payload, returns WorkspaceStatus */
export const workspaceStatusRequestSchema = z.object({}).strict();

/** dapei:repos:list — no payload, returns RepoSummary[] */
export const reposListRequestSchema = z.object({}).strict();

/** dapei:feature:list — no payload, returns FeatureSummary[] */
export const featureListRequestSchema = z.object({}).strict();

/** Channel → request schema lookup. The router uses this to validate
 * the payload before invoking the handler. */
export const REQUEST_SCHEMAS = {
  [IPC_CHANNELS.workspace.status]: workspaceStatusRequestSchema,
  [IPC_CHANNELS.repos.list]: reposListRequestSchema,
  [IPC_CHANNELS.feature.list]: featureListRequestSchema
} as const;

export type ChannelWithSchema = keyof typeof REQUEST_SCHEMAS;
