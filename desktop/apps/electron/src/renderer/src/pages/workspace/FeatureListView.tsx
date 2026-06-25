import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Plus } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ensureDesktopApi } from "../../lib/desktop-api.ts";
import { queryKeys } from "../../lib/query-keys.ts";

export function FeatureListView() {
  const { workspaceId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [repos, setRepos] = useState("");
  const [objective, setObjective] = useState("");
  const [error, setError] = useState<string | null>(null);

  const workspacePath = decodeURIComponent(workspaceId);

  const featuresQuery = useQuery({
    queryKey: queryKeys.features.list(workspaceId),
    queryFn: () => ensureDesktopApi().features.list()
  });
  const features = featuresQuery.data ?? [];

  const createMutation = useMutation({
    mutationFn: async () => ensureDesktopApi().features.create({ name, repos, objective: objective || undefined }),
    onSuccess: (result) => {
      if (!result.ok) {
        setError(result.error?.message ?? "create failed");
        return;
      }
      setShowCreate(false);
      setName("");
      setRepos("");
      setObjective("");
      queryClient.invalidateQueries({ queryKey: queryKeys.features.list(workspaceId) });
    },
    onError: (err: Error) => setError(err.message)
  });

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50 p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Features 执行区</h1>
            <p className="mt-1 text-sm text-slate-500">需求执行隔离区，与 workspace 知识分离。</p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            创建 Feature
          </button>
        </div>

        {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

        <div className="space-y-3">
          {featuresQuery.isLoading && <p className="text-sm text-slate-400">加载中…</p>}
          {features.length === 0 && !featuresQuery.isLoading && (
            <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
              暂无 feature — 点击右上角创建
            </p>
          )}
          {features.map((f) => (
            <button
              key={f.name}
              type="button"
              onClick={() => navigate(`/w/${workspaceId}/features/${f.name}`)}
              className="group flex w-full items-center rounded-lg border border-slate-200 bg-white p-4 text-left transition-all hover:border-indigo-400 hover:shadow-md"
            >
              <div className="mr-3">
                {f.active ? (
                  <span className="flex h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />
                ) : (
                  <span className="flex h-2.5 w-2.5 rounded-full bg-slate-300" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="font-bold text-slate-800 group-hover:text-indigo-600">{f.name}</h3>
                  <span className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-[10px] uppercase text-slate-500">
                    {f.stage ?? "未开始"}
                  </span>
                </div>
              </div>
              <ArrowRight className="ml-3 h-4 w-4 text-slate-300 group-hover:text-indigo-500" />
            </button>
          ))}
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-slate-800">创建 Feature</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (name && repos) createMutation.mutate();
              }}
              className="space-y-3"
            >
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">名称 (kebab-case)</label>
                <input
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  pattern="^[a-z0-9][a-z0-9-]{0,62}$"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">repos (逗号分隔)</label>
                <input
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  value={repos}
                  onChange={(e) => setRepos(e.target.value)}
                  placeholder="mall-payment,mall-order"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">objective (可选)</label>
                <textarea
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-sm"
                  onClick={() => setShowCreate(false)}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white"
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? "创建中…" : "创建"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
