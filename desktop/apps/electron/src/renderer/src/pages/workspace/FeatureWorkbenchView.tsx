import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, FileText, GitBranch, Loader2, Zap } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { CodeDiffViewer, MarkdownViewer, StageStepper } from "@dapei/desktop-ui";
import { ensureDesktopApi } from "../../lib/desktop-api.ts";
import { queryKeys } from "../../lib/query-keys.ts";

const STAGES = [
  "现状分析",
  "方案设计",
  "任务分解",
  "实现",
  "本地验证",
  "评审",
  "验收"
];

export function FeatureWorkbenchView() {
  const { workspaceId = "", featureId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspacePath = decodeURIComponent(workspaceId);
  const [activeDoc, setActiveDoc] = useState<string>("01-current-state");
  const [confirmingStage, setConfirmingStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: queryKeys.features.stage(workspaceId, featureId),
    queryFn: () => ensureDesktopApi().features.status(featureId)
  });
  const currentStage = statusQuery.data?.stage ?? null;
  const currentIndex = currentStage ? STAGES.findIndex((s) => s === currentStage) : -1;

  const backlogQuery = useQuery({
    queryKey: queryKeys.features.tasks(workspaceId, featureId),
    queryFn: () => ensureDesktopApi().features.tasks(featureId)
  });
  const backlog = backlogQuery.data?.text ?? "";

  const contextQuery = useQuery({
    queryKey: queryKeys.features.context(workspaceId, featureId, currentStage ?? "general"),
    queryFn: () => ensureDesktopApi().features.context(featureId, currentStage ?? "general"),
    enabled: false
  });

  const runStageMutation = useMutation({
    mutationFn: async (stage: string) =>
      ensureDesktopApi().features.runStage(featureId, stage, true),
    onSuccess: (result) => {
      if (!result.ok) {
        setError(result.error?.message ?? "runStage failed");
        return;
      }
      setConfirmingStage(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.features.stage(workspaceId, featureId) });
    },
    onError: (err: Error) => setError(err.message)
  });

  useEffect(() => {
    setError(null);
  }, [featureId]);

  return (
    <div className="flex h-screen w-full flex-col bg-white">
      <header className="z-20 flex h-16 shrink-0 items-center border-b border-slate-200 bg-white px-6 shadow-sm">
        <div className="flex w-1/4 items-center">
          <button
            type="button"
            onClick={() => navigate(`/w/${workspaceId}`)}
            className="mr-5 flex items-center rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            退出工作台
          </button>
          <div className="mr-5 h-5 w-px bg-slate-300" />
          <div className="flex items-center font-bold text-slate-800">
            <GitBranch className="mr-2 h-4 w-4 text-orange-500" />
            {featureId}
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center overflow-x-auto">
          <StageStepper stages={STAGES} currentIndex={currentIndex} />
        </div>

        <div className="flex w-1/4 items-center justify-end">
          <span className="mr-4 flex items-center rounded-md border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-800">
            <span className="mr-2 h-2 w-2 animate-pulse rounded-full bg-orange-500" />
            Feature 维度 · 隔离中
          </span>
        </div>
      </header>

      {error && (
        <div className="border-b border-red-200 bg-red-50 px-6 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="flex min-h-0 flex-1 bg-slate-100/50">
        <aside className="z-10 flex w-[24rem] shrink-0 flex-col border-r border-slate-200 bg-white">
          <div className="flex h-1/2 shrink-0 flex-col border-b border-slate-200">
            <div className="flex items-center bg-slate-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-700">
              Feature 上下文
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <div className="mb-2 px-2 text-[10px] font-bold uppercase text-slate-400">交付文档</div>
              {["01-current-state", "02-gap-analysis", "03-business-design", "04-technical-design", "05-task-breakdown", "06-acceptance"].map((doc) => (
                <button
                  key={doc}
                  type="button"
                  onClick={() => setActiveDoc(doc)}
                  className={`flex w-full items-center rounded-md px-3 py-2 text-left transition-colors ${
                    activeDoc === doc
                      ? "bg-indigo-100 font-medium text-indigo-700"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <FileText className={`mr-3 h-4 w-4 ${activeDoc === doc ? "text-indigo-500" : "text-slate-400"}`} />
                  <span className="truncate text-sm">{doc}.md</span>
                </button>
              ))}
              <div className="mt-4 mb-2 px-2 text-[10px] font-bold uppercase text-slate-400">Backlog</div>
              <pre className="whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-xs text-slate-700">
{backlog || "(empty)"}
              </pre>
            </div>
          </div>

          <div className="flex flex-1 flex-col bg-white">
            <div className="flex items-center bg-slate-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-700">
              Agent 指挥台 (M1-6)
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm text-slate-500">
              <p className="rounded-md border border-dashed border-slate-300 p-3 text-center text-xs">
                Agent-Share v1 在 M1-6 接入。当前 P5 仅展示阶段闸门与状态。
              </p>
            </div>
            <div className="border-t border-slate-100 bg-white p-4">
              <div className="relative">
                <textarea
                  placeholder="M1-6 接入..."
                  className="h-12 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 py-2 pl-3 pr-10 text-sm shadow-inner focus:border-indigo-400 focus:outline-none"
                  disabled
                />
                <button
                  type="button"
                  disabled
                  className="absolute bottom-2 right-2 rounded bg-slate-300 p-1.5 text-white"
                >
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </aside>

        <main className="relative flex flex-1 flex-col">
          <div className="flex-1 overflow-y-auto">
            <MarkdownViewer title={`features/${featureId}/docs/${activeDoc}.md`} />
          </div>

          <div className="border-t border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Inspector
            </div>
            <div className="space-y-3 p-4">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
                <div className="mb-1 font-semibold text-slate-700">当前阶段</div>
                <div className="font-mono text-slate-600">
                  {currentStage ?? "(未开始)"}
                  {currentStage && currentIndex >= 0 && ` (${currentIndex + 1} / ${STAGES.length})`}
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-semibold text-slate-700">推进阶段</div>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {STAGES.map((stage, idx) => {
                    const isCurrent = stage === currentStage;
                    const isPast = currentIndex >= 0 && idx < currentIndex;
                    const isNext = currentIndex >= 0 && idx === currentIndex + 1;
                    return (
                      <button
                        key={stage}
                        type="button"
                        disabled={!isNext || runStageMutation.isPending}
                        onClick={() => setConfirmingStage(stage)}
                        className={`rounded-md border px-3 py-2 text-left text-xs ${
                          isCurrent
                            ? "border-indigo-400 bg-indigo-50 font-bold text-indigo-700"
                            : isPast
                              ? "border-slate-200 bg-slate-50 text-slate-400 line-through"
                              : isNext
                                ? "border-indigo-300 bg-white text-slate-700 hover:border-indigo-500"
                                : "border-slate-200 bg-white text-slate-400"
                        }`}
                      >
                        {stage}
                      </button>
                    );
                  })}
                </div>
              </div>

              {contextQuery.data && (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
                  <div className="mb-1 font-semibold text-slate-700">context.build 产物</div>
                  <div className="font-mono text-slate-600">{contextQuery.data.runtimeContext}</div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {confirmingStage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-semibold text-slate-800">推进到 "{confirmingStage}"</h2>
            <p className="mb-4 text-sm text-slate-500">
              进入下一阶段前，请确认本阶段产物已就绪（context/runtime-context.md / reports/feature-progress.md / tasks/backlog.md）。
              引擎会执行 <code className="rounded bg-slate-100 px-1 text-xs">workflow.runStage</code>。
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-200 px-3 py-1.5 text-sm"
                onClick={() => setConfirmingStage(null)}
                disabled={runStageMutation.isPending}
              >
                取消
              </button>
              <button
                type="button"
                className="flex items-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                onClick={() => runStageMutation.mutate(confirmingStage)}
                disabled={runStageMutation.isPending}
              >
                {runStageMutation.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                确认推进
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
