import { useState } from "react";
import { ArrowLeft, ArrowRight, FileText, GitBranch, GitCommit, Zap } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import {
  CodeDiffViewer,
  MarkdownViewer,
  StageStepper
} from "@dapei/desktop-ui";
import {
  FEATURE_STAGES,
  MOCK_CHANGES,
  MOCK_DOCS,
  MOCK_FEATURES
} from "../../lib/mock-data.ts";

type ViewerState = { type: "doc" | "code"; id: string };

export function FeatureWorkbenchView() {
  const { workspaceId = "", featureId = "" } = useParams();
  const navigate = useNavigate();
  const feature = MOCK_FEATURES.find((f) => f.id === featureId) ?? MOCK_FEATURES[0];
  const [activeViewer, setActiveViewer] = useState<ViewerState>({ type: "doc", id: "d2" });

  const activeDoc = MOCK_DOCS.find((d) => d.id === activeViewer.id);
  const activeChange = MOCK_CHANGES.find((c) => c.id === activeViewer.id);

  const handleBack = () => {
    navigate(`/w/${workspaceId}`);
  };

  return (
    <div className="flex h-screen w-full flex-col bg-white">
      <header className="z-20 flex h-16 shrink-0 items-center border-b border-slate-200 bg-white px-6 shadow-sm">
        <div className="flex w-1/4 items-center">
          <button
            type="button"
            onClick={handleBack}
            className="mr-5 flex items-center rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            退出工作台
          </button>
          <div className="mr-5 h-5 w-px bg-slate-300" />
          <div className="flex items-center font-bold text-slate-800">
            <GitBranch className="mr-2 h-4 w-4 text-orange-500" />
            {feature.name}
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center">
          <StageStepper stages={FEATURE_STAGES} currentIndex={1} />
        </div>

        <div className="flex w-1/4 items-center justify-end">
          <span className="mr-4 flex items-center rounded-md border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-800">
            <span className="mr-2 h-2 w-2 animate-pulse rounded-full bg-orange-500" />
            Agent 在线 · 隔离区
          </span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 bg-slate-100/50">
        <aside className="z-10 flex w-[28rem] shrink-0 flex-col border-r border-slate-200 bg-white shadow-[4px_0_15px_rgba(0,0,0,0.03)]">
          <div className="flex h-[40%] shrink-0 flex-col border-b border-slate-200 bg-slate-50">
            <div className="flex items-center bg-slate-100/80 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-700">
              上下文交付物
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto p-3">
              <div>
                <div className="mb-2 px-2 text-[10px] font-bold uppercase text-slate-400">
                  架构与设计文档
                </div>
                {MOCK_DOCS.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => setActiveViewer({ type: "doc", id: doc.id })}
                    className={`flex w-full items-center rounded-md px-3 py-2 text-left transition-colors ${
                      activeViewer.id === doc.id
                        ? "bg-indigo-100 font-medium text-indigo-700"
                        : "text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    <FileText
                      className={`mr-3 h-4 w-4 ${
                        activeViewer.id === doc.id ? "text-indigo-500" : "text-slate-400"
                      }`}
                    />
                    <span className="truncate text-sm">{doc.title}</span>
                  </button>
                ))}
              </div>
              <div>
                <div className="mb-2 px-2 text-[10px] font-bold uppercase text-slate-400">代码 Diff</div>
                {MOCK_CHANGES.map((change) => (
                  <button
                    key={change.id}
                    type="button"
                    onClick={() => setActiveViewer({ type: "code", id: change.id })}
                    className={`flex w-full items-center rounded-md px-3 py-2 text-left transition-colors ${
                      activeViewer.id === change.id
                        ? "bg-emerald-100 font-medium text-emerald-800"
                        : "text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    <GitCommit
                      className={`mr-3 h-4 w-4 ${
                        activeViewer.id === change.id ? "text-emerald-600" : "text-slate-400"
                      }`}
                    />
                    <span className="truncate text-sm">{change.file.split("/").pop()}</span>
                    {change.status === "added" && (
                      <span className="ml-auto rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-500">
                        A
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-1 flex-col bg-white">
            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              <div className="flex flex-col items-end">
                <div className="max-w-[90%] rounded-xl rounded-tr-sm bg-indigo-600 p-4 text-sm leading-relaxed text-white shadow-sm">
                  @dapei 根据方案生成具体实现代码，注意引入 Redisson 锁。
                </div>
              </div>
              <div className="flex items-start">
                <div className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100">
                  <Zap className="h-4 w-4 text-indigo-600" />
                </div>
                <div className="flex-1">
                  <p className="rounded-xl rounded-tl-sm border border-slate-100 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
                    好的。已在沙盒中完成代码实现，主要修改了{" "}
                    <code className="rounded bg-slate-200 px-1 text-xs">CallbackController.java</code>
                    。请点击上方 Diff 进行评审。
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 bg-white p-4">
              <div className="relative">
                <textarea
                  placeholder="输入要求指挥 Agent..."
                  className="h-14 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 py-3 pl-4 pr-12 text-sm shadow-inner focus:border-indigo-400 focus:outline-none"
                />
                <button
                  type="button"
                  className="absolute bottom-2.5 right-2.5 rounded bg-indigo-600 p-1.5 text-white shadow-sm transition-colors hover:bg-indigo-700"
                >
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </aside>

        <main className="relative flex-1 bg-slate-100/50">
          {activeViewer.type === "doc" && activeDoc && <MarkdownViewer title={activeDoc.title} />}
          {activeViewer.type === "code" && activeChange && (
            <CodeDiffViewer file={activeChange.file} />
          )}
        </main>
      </div>
    </div>
  );
}
