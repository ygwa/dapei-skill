import { FileCode2 } from "lucide-react";

export interface CodeDiffViewerProps {
  file: string;
}

export function CodeDiffViewer({ file }: CodeDiffViewerProps) {
  return (
    <div className="flex h-full flex-col bg-[#1e1e1e] text-slate-300">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#333] bg-[#252526] px-8">
        <div className="flex items-center font-mono text-sm text-slate-300">
          <FileCode2 className="mr-2 h-4 w-4 text-emerald-500" />
          {file}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6 font-mono text-sm leading-relaxed">
        <div className="mx-auto max-w-5xl overflow-hidden rounded border border-[#333] bg-[#1e1e1e]">
          <DiffLine n={42} kind="context">
            {"    public String handleCallback(PaymentReq req) {"}
          </DiffLine>
          <DiffLine n={44} kind="remove">
            {"        Order order = orderService.findById(req.getOrderId());"}
          </DiffLine>
          <DiffLine n={44} kind="add">
            {'        RLock lock = redissonClient.getLock("pay_cb_" + req.getBizId());'}
          </DiffLine>
          <DiffLine n={45} kind="add">
            {"        if (!lock.tryLock(3, TimeUnit.SECONDS)) {"}
          </DiffLine>
        </div>
      </div>
    </div>
  );
}

function DiffLine({
  n,
  kind,
  children
}: {
  n: number;
  kind: "context" | "remove" | "add";
  children: string;
}) {
  const rowClass =
    kind === "remove"
      ? "bg-red-900/20"
      : kind === "add"
        ? "bg-emerald-900/20"
        : "hover:bg-[#2a2d2e]";

  const textClass =
    kind === "remove" ? "text-red-300" : kind === "add" ? "text-emerald-300" : "text-slate-400";

  return (
    <div className={`flex ${rowClass}`}>
      <div className="w-12 select-none border-r border-[#333] pr-4 text-right text-slate-600">{n}</div>
      <div className={`pl-4 ${textClass}`}>
        {kind === "remove" && <span className="mr-2 text-red-500">-</span>}
        {kind === "add" && <span className="mr-2 text-emerald-500">+</span>}
        <span className={kind === "remove" ? "bg-red-900/40" : kind === "add" ? "bg-emerald-900/40" : ""}>
          {children}
        </span>
      </div>
    </div>
  );
}
