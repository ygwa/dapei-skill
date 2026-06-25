import { useQuery } from "@tanstack/react-query";
import { ArrowRight, GitPullRequest, Plus } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { ensureDesktopApi } from "../../lib/desktop-api.ts";
import { queryKeys } from "../../lib/query-keys.ts";

export function DashboardView() {
  const { workspaceId = "" } = useParams();
  const navigate = useNavigate();
  const displayName = decodeURIComponent(workspaceId).split(/[/\\]/).filter(Boolean).pop() ?? workspaceId;

  const statusQuery = useQuery({
    queryKey: queryKeys.workspace.status(workspaceId),
    queryFn: () => ensureDesktopApi().capability.run({
      capabilityId: "workspace.status",
      input: {},
      workspaceRoot: decodeURIComponent(workspaceId)
    })
  });

  const featuresQuery = useQuery({
    queryKey: queryKeys.features.list(workspaceId),
    queryFn: () => ensureDesktopApi().features.list()
  });

  const status = statusQuery.data?.ok ? (statusQuery.data.data as { repoCount: number; featureCount: number; conforms: boolean } | undefined) : undefined;
  const features = featuresQuery.data ?? [];

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50 p-8">
      <div className="mx-auto max-w-5xl space-y-10">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="mb-1 text-2xl font-bold text-slate-800">{displayName} 概览</h1>
            <p className="text-sm text-slate-500">所有维度的资产健康状况与最近活动。</p>
            {status && (
              <p className="mt-2 text-xs text-slate-400">
                结构合规: {status.conforms ? "✓" : "✗"} · {status.repoCount} repos · {status.featureCount} features
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => navigate(`/w/${workspaceId}/features`)}
            className="flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            创建新 Feature
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h2 className="flex items-center text-sm font-bold text-slate-700">
                <GitPullRequest className="mr-2 h-4 w-4 text-indigo-500" />
                进行中的 Features
              </h2>
              <button
                type="button"
                onClick={() => navigate(`/w/${workspaceId}/features`)}
                className="text-xs text-indigo-600 hover:underline"
              >
                查看全部
              </button>
            </div>
            <div className="space-y-3">
              {featuresQuery.isLoading && <p className="text-sm text-slate-400">加载中…</p>}
              {features.length === 0 && !featuresQuery.isLoading && (
                <p className="text-sm text-slate-400">暂无 feature — 点击右上角创建</p>
              )}
              {features.map((f) => (
                <button
                  key={f.name}
                  type="button"
                  onClick={() => navigate(`/w/${workspaceId}/features/${f.name}`)}
                  className="group flex w-full cursor-pointer items-start rounded-lg border border-slate-200 bg-white p-4 text-left transition-all hover:border-indigo-400 hover:shadow-md"
                >
                  <div className="mr-3 mt-1">
                    {f.active ? (
                      <span className="flex h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />
                    ) : (
                      <span className="flex h-2.5 w-2.5 rounded-full bg-slate-300" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="mb-1 flex items-center justify-between">
                      <h3 className="font-bold text-slate-800 transition-colors group-hover:text-indigo-600">
                        {f.name}
                      </h3>
                      <span className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-[10px] uppercase text-slate-500">
                        {f.stage ?? "未开始"}
                      </span>
                    </div>
                  </div>
                  <div className="ml-4 flex h-full items-center">
                    <span className="flex items-center rounded-md bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-600 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-indigo-100">
                      进入工作台
                      <ArrowRight className="ml-1 h-3 w-3" />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
