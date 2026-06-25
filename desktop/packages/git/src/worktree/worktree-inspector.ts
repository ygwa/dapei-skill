export interface WorktreeInfo {
  featureId: string;
  repo: string;
  path: string;
}

export interface WorktreeInspector {
  list(workspaceRoot: string): Promise<WorktreeInfo[]>;
}
