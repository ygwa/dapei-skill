export interface RepoGitStatus {
  repo: string;
  branch: string;
  ahead: number;
  behind: number;
  dirty: boolean;
}

/** branch / ahead / behind / dirty — 只读 */
export interface GitStatusReader {
  read(repoPath: string): Promise<RepoGitStatus>;
}
