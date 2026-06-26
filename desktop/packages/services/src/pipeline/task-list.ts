/** 确定性任务项 — 由 tree-sitter / 引擎扫描生成，程序 for-each 调度 */

export type AnalysisTaskStatus = "pending" | "running" | "done" | "skipped" | "failed";

export interface AnalysisTask {
  id: string;
  repo: string;
  kind: "entry-candidate" | "behavior" | "state" | "custom";
  status: AnalysisTaskStatus;
  /** 程序可计算的定位信息 */
  locator?: {
    file: string;
    symbol?: string;
    line?: number;
  };
}

export interface AnalysisTaskList {
  version: 1;
  repo: string;
  tasks: AnalysisTask[];
}
