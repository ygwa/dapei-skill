export const queryKeys = {
  workspace: {
    recents: ["workspace", "recents"] as const,
    status: (root: string) => ["workspace", "status", root] as const
  },
  features: {
    list: (workspaceRoot: string) => ["features", "list", workspaceRoot] as const,
    stage: (workspaceRoot: string, featureName: string) =>
      ["features", "stage", workspaceRoot, featureName] as const,
    context: (workspaceRoot: string, featureName: string, stage: string) =>
      ["features", "context", workspaceRoot, featureName, stage] as const,
    tasks: (workspaceRoot: string, featureName: string) =>
      ["features", "tasks", workspaceRoot, featureName] as const
  },
  repos: {
    list: (workspaceRoot: string) => ["repos", "list", workspaceRoot] as const
  },
  pipeline: {
    status: (repo: string) => ["pipeline", "status", repo] as const
  }
};
