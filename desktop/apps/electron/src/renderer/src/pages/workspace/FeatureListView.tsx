import { ArrowRight, Plus } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { MOCK_FEATURES } from "../../lib/mock-data.ts";

export function FeatureListView() {
  const { workspaceId = "" } = useParams();
  const navigate = useNavigate();

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
            className="flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            创建 Feature
          </button>
        </div>

        <div className="space-y-3">
          {MOCK_FEATURES.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => navigate(`/w/${workspaceId}/features/${f.id}`)}
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
                    {f.stage}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-500">{f.objective}</p>
              </div>
              <span className="ml-4 text-xs text-slate-400">{f.time}</span>
              <ArrowRight className="ml-3 h-4 w-4 text-slate-300 group-hover:text-indigo-500" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
