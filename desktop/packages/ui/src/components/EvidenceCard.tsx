import type { LucideIcon } from "lucide-react";
import { CheckCircle, AlertCircle, FileCode, Hash } from "lucide-react";

/**
 * EvidenceCard renders a single source[] entry from a
 * cognitive artifact (behavior.yaml or state-machine.yaml).
 * The shape is the M1 evidence contract: a file path +
 * optional line number + optional symbol_handle + optional
 * repo. M2-2 makes this visually a card; M3 will resolve
 * file/line into a real `vscode://` link.
 */
export interface EvidenceSource {
  file: string;
  line?: number;
  symbol_handle?: string;
  repo?: string;
}

export interface EvidenceCardProps {
  source: EvidenceSource;
  /** "fact" | "inference" | "unknown" — drives the badge. */
  kind?: "fact" | "inference" | "unknown";
  /** Optional label override. */
  label?: string;
}

const KIND_BADGE: Record<NonNullable<EvidenceCardProps["kind"]>, { label: string; className: string; icon: LucideIcon }> = {
  fact: { label: "事实", className: "bg-emerald-100 text-emerald-700", icon: CheckCircle },
  inference: { label: "推断", className: "bg-blue-100 text-blue-700", icon: AlertCircle },
  unknown: { label: "未验证", className: "bg-amber-100 text-amber-700", icon: AlertCircle }
};

export function EvidenceCard({ source, kind = "fact", label }: EvidenceCardProps) {
  const meta = KIND_BADGE[kind];
  const Icon = meta.icon;
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 text-xs">
      <div className="mb-1.5 flex items-center gap-2">
        <span className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${meta.className}`}>
          <Icon className="h-3 w-3" />
          {meta.label}
        </span>
        {label && <span className="font-semibold text-slate-700">{label}</span>}
      </div>
      <div className="space-y-1 font-mono text-slate-600">
        <div className="flex items-center gap-1.5">
          <FileCode className="h-3 w-3 text-slate-400" />
          <span className="truncate">{source.file}</span>
        </div>
        {source.line !== undefined && (
          <div className="flex items-center gap-1.5">
            <Hash className="h-3 w-3 text-slate-400" />
            <span>L{source.line}</span>
          </div>
        )}
        {source.symbol_handle && (
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-500">{source.symbol_handle}</span>
          </div>
        )}
        {source.repo && (
          <div className="text-[10px] text-slate-400">repo: {source.repo}</div>
        )}
      </div>
    </div>
  );
}
