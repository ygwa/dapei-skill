import type { ReactNode } from "react";
import type { ActiveFeatureSummary, WorkspaceNavId } from "../types/navigation.ts";
import { GlobalSidebar } from "./GlobalSidebar.tsx";
import { TopBar } from "./TopBar.tsx";

export interface WorkspaceLayoutProps {
  workspaceName: string;
  breadcrumbs: string[];
  currentNav: WorkspaceNavId;
  sidebarOpen: boolean;
  activeFeatures?: ActiveFeatureSummary[];
  onNavChange: (id: WorkspaceNavId) => void;
  onFeatureSelect?: (featureId: string) => void;
  onToggleSidebar: () => void;
  onSettingsClick?: () => void;
  children: ReactNode;
}

export function WorkspaceLayout({
  workspaceName,
  breadcrumbs,
  currentNav,
  sidebarOpen,
  activeFeatures,
  onNavChange,
  onFeatureSelect,
  onToggleSidebar,
  onSettingsClick,
  children
}: WorkspaceLayoutProps) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-100 font-sans text-slate-900">
      {sidebarOpen && (
        <GlobalSidebar
          workspaceName={workspaceName}
          currentNav={currentNav}
          activeFeatures={activeFeatures}
          onNavChange={onNavChange}
          onFeatureSelect={onFeatureSelect}
          onSettingsClick={onSettingsClick}
        />
      )}

      <div className="z-10 flex min-w-0 flex-1 flex-col bg-white shadow-[-4px_0_15px_rgba(0,0,0,0.05)]">
        <TopBar breadcrumbs={breadcrumbs} onToggleSidebar={onToggleSidebar} />
        <div className="flex min-h-0 flex-1 flex-col bg-white">{children}</div>
      </div>
    </div>
  );
}
