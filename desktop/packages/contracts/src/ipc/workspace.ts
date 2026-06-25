/** Workspace 相关 IPC payload（实现阶段由 services 填充） */

export interface RecentWorkspace {
  id: string;
  name: string;
  path: string;
  openedAt: string;
}

export interface WorkspaceValidation {
  status: "valid" | "invalid";
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
