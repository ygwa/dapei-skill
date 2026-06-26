import { FileArchive } from "lucide-react";

export function PlaceholderView({ title }: { title: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-slate-50 text-slate-400">
      <FileArchive className="mb-4 h-16 w-16 opacity-20" />
      <h2 className="mb-2 text-xl font-medium">{title}</h2>
      <p className="text-sm">M0 占位 — 后续接入引擎与 CDR 门户</p>
    </div>
  );
}
