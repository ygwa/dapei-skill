import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, ChevronRight, FileCode, Folder, RefreshCw, Search } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { ensureDesktopApi } from "../../lib/desktop-api.ts";
import { queryKeys } from "../../lib/query-keys.ts";

export function KnowledgeView() {
  const { workspaceId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"portal" | "assets">("portal");
  const [portalUrl, setPortalUrl] = useState<string>("");
  const [iframeKey, setIframeKey] = useState(0);

  const portalUrlQuery = useQuery({
    queryKey: queryKeys.knowledge.portalUrl(workspaceId),
    queryFn: async () => {
      const r = await ensureDesktopApi().knowledge.portalUrl();
      if (r.ok) setPortalUrl(r.url);
      return r;
    },
    enabled: false
  });

  const portalBuildMutation = useMutation({
    mutationFn: () => ensureDesktopApi().knowledge.portalBuild(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.portalUrl(workspaceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.assetTree(workspaceId) });
      setIframeKey((k) => k + 1);
    }
  });

  const assetTreeQuery = useQuery({
    queryKey: queryKeys.knowledge.assetTree(workspaceId),
    queryFn: () => ensureDesktopApi().knowledge.assetTree()
  });
  const assets = assetTreeQuery.data ?? [];

  useEffect(() => {
    if (tab === "portal") {
      void portalUrlQuery.refetch();
    }
  }, [tab]);

  return (
    <div className="flex h-full flex-col bg-slate-50/50">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div>
          <h1 className="flex items-center text-2xl font-bold text-slate-800">
            <BookOpen className="mr-2 h-5 w-5 text-indigo-500" />
            业务知识图谱
          </h1>
          <p className="mt-1 text-sm text-slate-500">CDR portal + cognitive assets.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
              tab === "portal" ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
            onClick={() => setTab("portal")}
          >
            门户视图
          </button>
          <button
            type="button"
            className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
              tab === "assets" ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
            onClick={() => setTab("assets")}
          >
            资产浏览器
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === "portal" && (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-2 text-xs text-slate-500">
              <span>
                {portalUrl ? `本地 server: ${portalUrl}` : "本地 portal server 未启动 — 点击 'Generate' 构建"}
              </span>
              <div className="flex items-center gap-2">
                {portalUrl && (
                  <button
                    type="button"
                    onClick={() => setIframeKey((k) => k + 1)}
                    className="rounded-md border border-slate-200 px-2.5 py-1 text-xs hover:bg-slate-50"
                    title="重新加载"
                  >
                    <RefreshCw className="inline h-3 w-3" />
                    刷新
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => portalBuildMutation.mutate()}
                  disabled={portalBuildMutation.isPending}
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {portalBuildMutation.isPending ? "构建中…" : "Generate Portal"}
                </button>
              </div>
            </div>
            <div className="flex-1 bg-white">
              {portalUrl ? (
                <iframe
                  key={iframeKey}
                  src={portalUrl}
                  className="h-full w-full border-0"
                  title="CDR Portal"
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <BookOpen className="mx-auto h-12 w-12 text-slate-300" />
                    <p className="mt-3 text-sm text-slate-500">
                      门户未构建。点击右上 "Generate Portal" 调用 <code className="rounded bg-slate-100 px-1 text-xs">cdr.doc.generate</code>。
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "assets" && (
          <div className="flex h-full">
            <aside className="w-80 overflow-y-auto border-r border-slate-200 bg-white">
              {assets.length === 0 && (
                <p className="p-4 text-sm text-slate-400">
                  暂无 cognitive 资产 — 在工作空间运行 <code className="rounded bg-slate-100 px-1 text-xs">cdr.bootstrap</code>。
                </p>
              )}
              {assets.map((node) => (
                <div key={node.path} className="border-b border-slate-100">
                  <div className="flex items-center gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <Folder className="h-3.5 w-3.5" />
                    {node.name}
                    <span className="ml-auto rounded bg-slate-100 px-1.5 text-[10px] text-slate-500">
                      {node.children?.length ?? 0}
                    </span>
                  </div>
                  {node.children?.map((c) => (
                    <button
                      key={c.path}
                      type="button"
                      onClick={() => navigate(`/w/${workspaceId}/knowledge/asset?path=${encodeURIComponent(c.path)}`)}
                      className="flex w-full items-center gap-2 px-6 py-1.5 text-left text-xs text-slate-600 hover:bg-slate-50"
                    >
                      <FileCode className="h-3 w-3" />
                      <span className="truncate">{c.meta?.title ?? c.name}</span>
                      {c.meta?.repo && (
                        <span className="ml-auto rounded bg-slate-100 px-1.5 text-[10px] text-slate-500">{c.meta.repo}</span>
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </aside>
            <div className="flex-1 overflow-y-auto p-6">
              <AssetDetailPlaceholder />
              <p className="mt-4 text-xs text-slate-400">
                资产详情在 P3 后续 milestone（M3）渲染。M2-1 仅显示结构化资产树 + portal 嵌入。
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AssetDetailPlaceholder() {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
      <Search className="mx-auto h-8 w-8 text-slate-300" />
      <p className="mt-2">从左侧选一个 behavior / state-machine / domain 查看详情。</p>
    </div>
  );
}
