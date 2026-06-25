export const queryKeys = {
  workspace: {
    recents: ["workspace", "recents"] as const,
    status: (root: string) => ["workspace", "status", root] as const
  },
  features: {
    list: (workspaceRoot: string) => ["features", "list", workspaceRoot] as const
  },
  repos: {
    list: (workspaceRoot: string) => ["repos", "list", workspaceRoot] as const
  },
  pipeline: {
    status: (repo: string) => ["pipeline", "status", repo] as const
  }
};
