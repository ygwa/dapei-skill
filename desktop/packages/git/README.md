# @dapei/desktop-git

Git **观测**层；`git pull` / `repos.sync` 写操作走 `desktop-services`。

```
src/
├── reader/      # GitStatusReader
├── worktree/    # WorktreeInspector
└── scheduler/   # SyncScheduler
```
