import { useQuery } from "@tanstack/react-query";
import { FolderOpen, Plus, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ensureDesktopApi } from "../lib/desktop-api.ts";
import { queryKeys } from "../lib/query-keys.ts";

export function LauncherPage() {
  const navigate = useNavigate();
  const { data: recents = [] } = useQuery({
    queryKey: queryKeys.workspace.recents,
    queryFn: () => ensureDesktopApi().workspace.listRecents()
  });

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
            大
          </div>
          <span className="text-lg font-semibold text-slate-800">大培</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-md p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-4xl space-y-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">选择工作空间</h1>
            <p className="mt-1 text-sm text-slate-500">
              打开已有目录或创建新的 dapei workspace（repos / docs / features / .dapei）
            </p>
          </div>

          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">
              最近工作空间
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {recents.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  className="rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:border-indigo-400 hover:shadow-md"
                  onClick={() => navigate(`/w/${w.id}`)}
                >
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
                    <FolderOpen className="h-5 w-5 text-indigo-500" />
                  </div>
                  <div className="font-semibold text-slate-800">{w.name}</div>
                  <div className="mt-1 truncate text-xs text-slate-500">{w.path}</div>
                </button>
              ))}

              <button
                type="button"
                onClick={() => navigate("/w/demo")}
                className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white p-5 text-slate-500 transition-colors hover:border-indigo-400 hover:text-indigo-600"
              >
                <Plus className="mb-2 h-8 w-8 opacity-50" />
                <span className="text-sm font-medium">演示工作空间</span>
                <span className="mt-1 text-xs text-slate-400">mall-core 原型 UI</span>
              </button>
            </div>

            {recents.length === 0 && (
              <p className="mt-4 text-center text-sm text-slate-400">
                暂无最近记录 — 点击下方按钮打开或新建
              </p>
            )}
          </section>

          <div className="flex flex-wrap gap-3 border-t border-slate-200 pt-6">
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300"
            >
              选择已有目录
            </button>
            <button
              type="button"
              className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
            >
              新建工作空间
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
