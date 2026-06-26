import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderOpen, Plus, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ensureDesktopApi } from "../lib/desktop-api.ts";
import { queryKeys } from "../lib/query-keys.ts";

interface SetupState {
  parentDir: string;
  name: string;
}

export function LauncherPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: recentsRaw, error: recentsError } = useQuery({
    queryKey: queryKeys.workspace.recents,
    queryFn: () => ensureDesktopApi().workspace.listRecents()
  });
  // Defensive: the API contract is `RecentWorkspace[]` but a stale
  // vite cache or a third-party API stub may return a non-array.
  // We coerce to an array so the render path is type-safe.
  const recents: Array<{ id: string; name: string; path: string; openedAt: string }> = Array.isArray(recentsRaw)
    ? recentsRaw
    : [];

  const [setup, setSetup] = useState<SetupState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openMutation = useMutation({
    mutationFn: async (path: string) => ensureDesktopApi().workspace.open(path),
    onSuccess: (result) => {
      if (!result.ok) {
        setError(result.error?.message ?? "open failed");
        return;
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace.recents });
      navigate(`/w/${encodeURIComponent(result.path)}`);
    },
    onError: (err: Error) => setError(err.message)
  });

  const initMutation = useMutation({
    mutationFn: async (s: SetupState) => ensureDesktopApi().workspace.init(s.parentDir, s.name),
    onSuccess: (result) => {
      if (!result.ok) {
        setError(result.error?.message ?? "init failed");
        return;
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace.recents });
      setSetup(null);
      navigate(`/w/${encodeURIComponent(result.path)}`);
    },
    onError: (err: Error) => setError(err.message)
  });

  const pickDirectory = async (): Promise<void> => {
    setError(null);
    const picked = await ensureDesktopApi().workspace.pickDirectory();
    if (picked) setSetup({ parentDir: picked, name: "" });
  };

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">大</div>
          <span className="text-lg font-semibold text-slate-800">大培</span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="rounded-md p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600" title="设置 (M2-3)">
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-4xl space-y-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">选择工作空间</h1>
            <p className="mt-1 text-sm text-slate-500">打开已有目录或创建新的 dapei workspace（repos / docs / features / .dapei）</p>
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {recentsError && !error && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
              listRecents 失败：{String((recentsError as Error)?.message ?? recentsError)}。试试 Ctrl+R 刷新或重启 vite。
            </div>
          )}

          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">最近工作空间</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {recents.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  className="rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:border-indigo-400 hover:shadow-md"
                  onClick={() => openMutation.mutate(w.path)}
                  disabled={openMutation.isPending}
                >
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
                    <FolderOpen className="h-5 w-5 text-indigo-500" />
                  </div>
                  <div className="font-semibold text-slate-800">{w.name}</div>
                  <div className="mt-1 truncate text-xs text-slate-500">{w.path}</div>
                </button>
              ))}
              {recents.length === 0 && (
                <p className="col-span-full text-center text-sm text-slate-400">暂无最近记录 — 点击下方按钮打开或新建</p>
              )}
            </div>
          </section>

          <div className="flex flex-wrap gap-3 border-t border-slate-200 pt-6">
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300"
              onClick={pickDirectory}
              disabled={initMutation.isPending}
            >
              打开已有目录…
            </button>
            <button
              type="button"
              className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
              onClick={pickDirectory}
              disabled={initMutation.isPending}
            >
              <Plus className="-ml-1 mr-1 inline h-4 w-4" />
              新建工作空间
            </button>
          </div>
        </div>
      </main>

      {setup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-slate-800">新建工作空间</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (setup.name) initMutation.mutate(setup);
              }}
              className="space-y-3"
            >
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">父目录</label>
                <input
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  value={setup.parentDir}
                  readOnly
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">名称 (kebab-case)</label>
                <input
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  value={setup.name}
                  onChange={(e) => setSetup({ ...setup, name: e.target.value })}
                  placeholder="my-project"
                  pattern="^[a-z0-9][a-z0-9-]{0,62}$"
                  required
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-sm"
                  onClick={() => setSetup(null)}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white"
                  disabled={!setup.name || initMutation.isPending}
                >
                  {initMutation.isPending ? "创建中…" : "创建"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
