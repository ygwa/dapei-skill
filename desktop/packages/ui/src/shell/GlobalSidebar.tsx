import {
  BookOpen,
  ChevronRight,
  FileArchive,
  GitPullRequest,
  LayoutDashboard,
  Library,
  PlayCircle,
  Settings
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ActiveFeatureSummary, WorkspaceNavId } from "../types/navigation.ts";

interface NavItem {
  id: WorkspaceNavId;
  icon: LucideIcon;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "overview", icon: LayoutDashboard, label: "工作空间概览" },
  { id: "features", icon: GitPullRequest, label: "Features 执行区" },
  { id: "knowledge", icon: BookOpen, label: "业务知识图谱" },
  { id: "architecture", icon: FileArchive, label: "架构与决策 (ADR)" },
  { id: "repos", icon: Library, label: "代码库基座" }
];

export interface GlobalSidebarProps {
  workspaceName: string;
  workspaceSubtitle?: string;
  currentNav: WorkspaceNavId;
  activeFeatures?: ActiveFeatureSummary[];
  onNavChange: (id: WorkspaceNavId) => void;
  onFeatureSelect?: (featureId: string) => void;
  onSettingsClick?: () => void;
}

export function GlobalSidebar({
  workspaceName,
  workspaceSubtitle = "大培 Workspace",
  currentNav,
  activeFeatures = [],
  onNavChange,
  onFeatureSelect,
  onSettingsClick
}: GlobalSidebarProps) {
  return (
    <div className="flex h-full w-64 shrink-0 flex-col bg-[#1e293b] text-slate-300 transition-all duration-300">
      <div className="flex h-14 cursor-pointer items-center border-b border-slate-700/50 px-4 transition-colors hover:bg-slate-800">
        <div className="mr-3 flex h-6 w-6 items-center justify-center rounded bg-indigo-500 text-xs font-bold text-white">
          {workspaceName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-100">{workspaceName}</div>
          <div className="truncate text-[10px] text-slate-500">{workspaceSubtitle}</div>
        </div>
        <ChevronRight className="h-4 w-4 text-slate-500" />
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        <div className="space-y-1 px-3">
          {NAV_ITEMS.map((item) => {
            const isActive = currentNav === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavChange(item.id)}
                className={`flex w-full cursor-pointer items-center rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "hover:bg-slate-800 hover:text-slate-100"
                }`}
              >
                <Icon
                  className={`mr-3 h-4 w-4 ${isActive ? "text-indigo-200" : "text-slate-400"}`}
                />
                {item.label}
              </button>
            );
          })}
        </div>

        {activeFeatures.length > 0 && (
          <div className="mt-8 px-3">
            <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
              活跃的 Features
            </div>
            <div className="space-y-1">
              {activeFeatures.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onFeatureSelect?.(f.id)}
                  className="group flex w-full cursor-pointer items-center rounded-lg px-3 py-1.5 text-left text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
                >
                  {f.active ? (
                    <span className="mr-3 h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                  ) : (
                    <span className="mr-3 h-2 w-2 rounded-full bg-slate-600" />
                  )}
                  <span className="flex-1 truncate">{f.name}</span>
                  <PlayCircle className="h-3.5 w-3.5 text-slate-500 opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-slate-700/50 p-4">
        <button
          type="button"
          onClick={onSettingsClick}
          className="flex w-full cursor-pointer items-center rounded-lg px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
        >
          <Settings className="mr-3 h-4 w-4" /> Workspace 设置
        </button>
      </div>
    </div>
  );
}
