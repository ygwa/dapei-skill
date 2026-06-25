export type WorkspaceNavId =
  | "overview"
  | "features"
  | "knowledge"
  | "architecture"
  | "repos"
  | "settings";

export interface WorkspaceNavItem {
  id: WorkspaceNavId;
  label: string;
}

export interface ActiveFeatureSummary {
  id: string;
  name: string;
  active: boolean;
}
