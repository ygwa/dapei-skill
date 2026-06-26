import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Library, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { ensureDesktopApi } from "../../lib/desktop-api.ts";
import { queryKeys } from "../../lib/query-keys.ts";

export function ReposView() {
  const { workspaceId = "" } = useParams();
  const queryClient = useQueryClient();
  const workspacePath = decodeURIComponent(workspaceId);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reposQuery = useQuery({
    queryKey: queryKeys.repos.list(workspaceId),
    queryFn: () => ensureDesktopApi().repos.list()
  });
  const repos = reposQuery.data ?? [];

  const addMutation = useMutation({
    mutationFn: async () => ensureDesktopApi().repos.add(name, url),
    onSuccess: (result) => {
      if (!result.ok) {
        setError(result.error?.message ?? "add failed");
        return;
      }
      setShowAdd(false);
      setName("");
      setUrl("");
      queryClient.invalidateQueries({ queryKey: queryKeys.repos.list(workspaceId) });
    },
    onError: (err: Error) => setError(err.message)
  });

  const syncMutation = useMutation({
    mutationFn: async (target: string) => ensureDesktopApi().repos.sync(target),
    onSuccess: (result) => {
      if (!result.ok) {
        setError(result.error?.message ?? "sync failed");
        return;
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.repos.list(workspaceId) });
    }
  });

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50 p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="flex items-center text-2xl font-bold text-slate-800">
              <Library className="mr-2 h-5 w-5 text-indigo-500" />
              代码库基座
            </h1>
            <p className="mt-1 text-sm text-slate-500">分析来源 + feature worktree 基座池（只读基座，feature 内改码在 features/&lt;f&gt;/repos/）。</p>
          </div>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            添加代码库
          </button>
        </div>

        {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

        <div className="space-y-3">
          {reposQuery.isLoading && <p className="text-sm text-slate-400">加载中…</p>}
          {repos.length === 0 && !reposQuery.isLoading && (
            <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
              暂无代码库 — 点击右上角添加
            </p>
          )}
          {repos.map((r) => (
            <div
              key={r.name}
              className="flex items-center rounded-lg border border-slate-200 bg-white p-4"
            >
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="font-bold text-slate-800">{r.name}</h3>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${r.cloned ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                    {r.cloned ? "✓ cloned" : "未 clone"}
                  </span>
                  {r.branch && (
                    <span className="font-mono text-xs text-slate-500">{r.branch}</span>
                  )}
                  {r.hash && (
                    <span className="font-mono text-[10px] text-slate-400">{r.hash}</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => syncMutation.mutate(r.name)}
                disabled={!r.cloned || syncMutation.isPending}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                <RefreshCw className="mr-1 inline h-3 w-3" />
                Sync
              </button>
            </div>
          ))}
        </div>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-slate-800">添加代码库</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (name && url) addMutation.mutate();
              }}
              className="space-y-3"
            >
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">名称 (kebab-case)</label>
                <input
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  pattern="^[a-z0-9][a-z0-9_-]{0,62}$"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Git URL</label>
                <input
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://github.com/..."
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-sm"
                  onClick={() => setShowAdd(false)}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white"
                  disabled={addMutation.isPending}
                >
                  {addMutation.isPending ? "添加中…" : "添加"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
