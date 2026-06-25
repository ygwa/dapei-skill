import { z } from "zod";

export const jsonRpcNotificationSchema = z.object({
  jsonrpc: z.literal("2.0"),
  method: z.string(),
  params: z.unknown().optional()
});

export const acpTextStreamParamsSchema = z.object({
  delta: z.string(),
  sessionId: z.string().optional()
});

export const acpToolCallRequestParamsSchema = z.object({
  capabilityId: z.string(),
  input: z.record(z.string(), z.unknown()),
  sessionId: z.string().optional()
});

export const acpInitializeParamsSchema = z.object({
  clientInfo: z.object({ name: z.string(), version: z.string() }),
  workspaceRoot: z.string(),
  capabilities: z
    .object({
      ui: z
        .object({
          supportsRichCards: z.boolean().optional(),
          supportsModals: z.boolean().optional()
        })
        .optional()
    })
    .optional()
});

export const desktopPluginManifestSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  name: z.string().optional(),
  description: z.string().optional(),
  main: z.string().optional(),
  renderer: z.string().optional(),
  contributes: z.object({
    routes: z.array(z.object({ id: z.string(), path: z.string(), label: z.string(), module: z.string().optional() })).optional(),
    sidebar: z
      .array(z.object({ id: z.string(), label: z.string(), icon: z.string().optional(), route: z.string() }))
      .optional(),
    featurePanels: z
      .array(
        z.object({
          id: z.string(),
          label: z.string(),
          slot: z.enum(["inspector", "context"]),
          module: z.string()
        })
      )
      .optional(),
    agentBackends: z.array(z.object({ id: z.string(), label: z.string(), module: z.string() })).optional(),
    pipelineSteps: z
      .array(z.object({ id: z.string(), label: z.string(), phase: z.string(), module: z.string() }))
      .optional()
  }),
  engines: z.object({ desktop: z.string().optional() }).optional()
});
