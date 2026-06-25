import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import type { AppDimension } from "./dimension.ts";

export interface AppShellProps {
  title: string;
  dimension?: AppDimension;
  children: ReactNode;
}

export function AppShell({ title, dimension = "workspace", children }: AppShellProps) {
  return (
    <div className="flex h-full min-h-screen flex-col bg-slate-50 text-slate-900">
      <header className="flex h-12 items-center border-b border-slate-200 bg-white px-4">
        <h1 className="text-sm font-semibold">{title}</h1>
        <span
          className={cn(
            "ml-3 rounded-md px-2 py-0.5 text-xs font-medium",
            dimension === "workspace" ? "bg-blue-100 text-blue-800" : "bg-orange-100 text-orange-800"
          )}
        >
          {dimension === "workspace" ? "Workspace 维度" : "Feature 维度"}
        </span>
      </header>
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
