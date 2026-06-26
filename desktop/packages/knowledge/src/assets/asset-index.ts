export interface AssetIndexEntry {
  id: string;
  kind: "behavior" | "domain" | "state-machine" | "business-rule" | "profile";
  path: string;
  repo?: string;
}

export interface AssetIndex {
  list(workspaceRoot: string): Promise<AssetIndexEntry[]>;
}
