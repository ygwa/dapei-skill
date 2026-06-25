import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText, GitBranch, Loader2, MessageSquare, Send, X } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { MarkdownViewer, StageStepper } from "@dapei/desktop-ui";
import type { AgentEvent, DesktopPushEvent } from "@dapei/desktop-contracts";
import { ensureDesktopApi } from "../../lib/desktop-api.ts";
import { queryKeys } from "../../lib/query-keys.ts";

const STAGES = ["现状分析", "方案设计", "任务分解", "实现", "本地验证", "评审", "验收"];

interface ChatMessage {
  id: string;
  kind: "user" | "assistant" | "tool" | "system";
  text: string;
  meta?: { toolName?: string; toolOk?: boolean };
  ts: number;
}

export function FeatureWorkbenchView() {
  const { workspaceId = "", featureId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspacePath = decodeURIComponent(workspaceId);
  const [activeDoc, setActiveDoc] = useState<string>("01-current-state");
  const [confirmingStage, setConfirmingStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [backendLabel, setBackendLabel] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);

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

  const backendsQuery = useQuery({
    queryKey: queryKeys.agent.backends(),
    queryFn: () => ensureDesktopApi().agent.listBackends()
  });

  useEffect(() => {
    const handler = (push: DesktopPushEvent) => {
      if (push.channel !== "dapei:agent:event") return;
      const e = push.payload;
      if (e.type === "session:ready") {
        if (e.sessionId === sessionId || !sessionId) {
          setSessionId(e.sessionId);
          setMessages((prev) => [...prev, { id: cryptoId(), kind: "system", text: `Agent session ready (${e.sessionId.slice(0, 8)}…)`, ts: Date.now() }]);
        }
      } else if (e.type === "session:closed") {
        setMessages((prev) => [...prev, { id: cryptoId(), kind: "system", text: `Session closed`, ts: Date.now() }]);
      } else if (e.type === "message:user") {
        setMessages((prev) => [...prev, { id: cryptoId(), kind: "user", text: e.text, ts: Date.now() }]);
      } else if (e.type === "message:assistant") {
        setMessages((prev) => [...prev, { id: cryptoId(), kind: "assistant", text: e.text, ts: Date.now() }]);
      } else if (e.type === "tool:call") {
        setMessages((prev) => [...prev, { id: cryptoId(), kind: "tool", text: `→ ${e.name}`, meta: { toolName: e.name }, ts: Date.now() }]);
      } else if (e.type === "tool:result") {
        setMessages((prev) => prev.map((m) => m.meta?.toolName === e.name && m.kind === "tool" ? { ...m, text: `${m.text} ${e.ok ? "✓" : "✗"}`, meta: { ...m.meta, toolOk: e.ok } } : m));
      } else if (e.type === "capability:invoked") {
        setMessages((prev) => [...prev, { id: cryptoId(), kind: "system", text: `capability: ${e.id} ${e.ok ? "✓" : "✗"}`, ts: Date.now() }]);
      }
    };
    const unsub = window.dapei?.events?.subscribe(handler);
    return () => {
      unsub?.();
    };
  }, [sessionId]);

  const attachMutation = useMutation({
    mutationFn: async () => {
      const backends = backendsQuery.data ?? (await ensureDesktopApi().agent.listBackends());
      const first = backends.find((b) => b.installed) ?? backends[0];
      if (!first) throw new Error("no agent backend available");
      setBackendLabel(first.label);
      return ensureDesktopApi().agent.attach({ backendId: first.id, cwd: workspacePath, feature: featureId });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        setError(result.error?.message ?? "attach failed");
        return;
      }
      if (result.sessionId) setSessionId(result.sessionId);
    },
    onError: (err: Error) => setError(err.message)
  });

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!sessionId) throw new Error("no session");
      return ensureDesktopApi().agent.send(sessionId, text);
    },
    onError: (err: Error) => setError(err.message)
  });

  const runStageMutation = useMutation({
    mutationFn: async (stage: string) => ensureDesktopApi().features.runStage(featureId, stage, true),
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

        <div className="flex w-1/4 items-center justify-end gap-2">
          {sessionId ? (
            <span className="flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800">
              <span className="mr-2 h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              {backendLabel || "Agent 在线"}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => attachMutation.mutate()}
              disabled={attachMutation.isPending}
              className="flex items-center rounded-md border border-orange-300 bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-800 hover:bg-orange-100 disabled:opacity-50"
            >
              {attachMutation.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Attach Agent
            </button>
          )}
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
            <div className="flex items-center justify-between bg-slate-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-700">
              <span className="flex items-center">
                <MessageSquare className="mr-2 h-3.5 w-3.5" />
                Agent 对话
              </span>
              {sessionId && (
                <button
                  type="button"
                  onClick={() => ensureDesktopApi().agent.detach(sessionId)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                  title="Detach"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
              {messages.length === 0 && (
                <p className="rounded-md border border-dashed border-slate-300 p-3 text-center text-xs text-slate-400">
                  {sessionId ? "等待 Agent 回应…" : "点击右上 'Attach Agent' 启动"}
                </p>
              )}
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={
                    m.kind === "user"
                      ? "ml-auto max-w-[90%] rounded-xl rounded-tr-sm bg-indigo-600 p-3 text-white shadow-sm"
                      : m.kind === "assistant"
                        ? "mr-auto max-w-[90%] rounded-xl rounded-tl-sm border border-slate-200 bg-slate-50 p-3 text-slate-700"
                        : m.kind === "tool"
                          ? "mx-auto max-w-[90%] rounded-md border border-slate-200 bg-white px-2 py-1 text-center font-mono text-xs text-slate-500"
                          : "mx-auto max-w-[90%] rounded-md bg-amber-50 px-2 py-1 text-center text-xs text-amber-700"
                  }
                >
                  {m.text}
                </div>
              ))}
            </div>
            <div className="border-t border-slate-100 bg-white p-3">
              <div className="relative">
                <textarea
                  placeholder={sessionId ? "输入 @dapei 指令…" : "先 attach Agent"}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && chatInput && sessionId) {
                      e.preventDefault();
                      sendMutation.mutate(chatInput);
                      setChatInput("");
                    }
                  }}
                  className="h-12 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 py-2 pl-3 pr-10 text-sm shadow-inner focus:border-indigo-400 focus:outline-none disabled:opacity-50"
                  disabled={!sessionId}
                />
                <button
                  type="button"
                  disabled={!sessionId || !chatInput || sendMutation.isPending}
                  onClick={() => {
                    if (chatInput) {
                      sendMutation.mutate(chatInput);
                      setChatInput("");
                    }
                  }}
                  className="absolute bottom-2 right-2 rounded bg-indigo-600 p-1.5 text-white shadow-sm hover:bg-indigo-700 disabled:bg-slate-300"
                >
                  <Send className="h-4 w-4" />
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
            </div>
          </div>
        </main>
      </div>

      {confirmingStage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-semibold text-slate-800">推进到 "{confirmingStage}"</h2>
            <p className="mb-4 text-sm text-slate-500">
              进入下一阶段前，请确认本阶段产物已就绪。引擎会执行 <code className="rounded bg-slate-100 px-1 text-xs">workflow.runStage</code>。
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

function cryptoId(): string {
  return Math.random().toString(36).slice(2, 10);
}
