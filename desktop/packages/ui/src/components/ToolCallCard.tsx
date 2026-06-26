import { useState } from "react";
import { CheckCircle, ChevronDown, ChevronRight, XCircle, Wrench } from "lucide-react";
import type { AgentEvent } from "@dapei/desktop-contracts";

/**
 * ToolCallCard renders a tool call + result pair. The shape
 * is the AgentEvent union: { type: "tool:call"; name, input }
 * followed by { type: "tool:result"; name, output, ok }. M2-2
 * pairs them up by tool name (the agent emits tool:result
 * after tool:call for the same tool).
 */
export interface ToolCall {
  call: Extract<AgentEvent, { type: "tool:call" }>;
  result?: Extract<AgentEvent, { type: "tool:result" }>;
}

export interface ToolCallCardProps {
  tool: ToolCall;
}

export function ToolCallCard({ tool }: ToolCallCardProps) {
  const [open, setOpen] = useState(false);
  const ok = tool.result?.ok;

  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <Wrench className="h-3.5 w-3.5 text-slate-400" />
        <span className="font-mono font-medium text-slate-700">{tool.call.name}</span>
        {ok === true && <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />}
        {ok === false && <XCircle className="h-3.5 w-3.5 text-red-500" />}
        {!tool.result && <span className="ml-auto text-[10px] text-slate-400">running…</span>}
        {tool.result && (
          <span className="ml-auto text-[10px] text-slate-400">
            {Object.keys(tool.result.output as object | null ?? {}).length} fields
          </span>
        )}
      </button>
      {open && (
        <div className="border-t border-slate-100 px-3 py-2 text-xs">
          <div className="mb-1.5 font-semibold text-slate-500">input</div>
          <pre className="overflow-x-auto rounded bg-slate-50 p-2 font-mono text-[10px] text-slate-700">
            {JSON.stringify(tool.call.input, null, 2)}
          </pre>
          {tool.result && (
            <>
              <div className="mb-1.5 mt-2 font-semibold text-slate-500">output</div>
              <pre className="overflow-x-auto rounded bg-slate-50 p-2 font-mono text-[10px] text-slate-700">
                {JSON.stringify(tool.result.output, null, 2)}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}
