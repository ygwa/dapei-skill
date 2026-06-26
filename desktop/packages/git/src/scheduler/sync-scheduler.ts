/** 定时/手动触发 repos.sync — 委托 ReposService */

export interface SyncScheduler {
  start(): void;
  stop(): void;
}
