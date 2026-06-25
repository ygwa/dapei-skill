/** Workspace 相关 IPC payload */

export interface RecentWorkspace {
  id: string;
  name: string;
  path: string;
  openedAt: string;
}

export interface WorkspaceValidation {
  status: "valid" | "warn" | "invalid";
  errors: string[];
  warnings: string[];
}

export interface WorkspaceOpenResult {
  ok: boolean;
  path: string;
  name: string;
  validation?: WorkspaceValidation;
  error?: { code: string; message: string };
}
