import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import type { WorkspaceNavId } from "@dapei/desktop-ui";
import { WorkspaceLayout } from "@dapei/desktop-ui";
import { useUiStore } from "../stores/ui-store.ts";
import { ensureDesktopApi } from "../lib/desktop-api.ts";
import { queryKeys } from "../lib/query-keys.ts";
import { DashboardView } from "./workspace/DashboardView.tsx";
import { FeatureListView } from "./workspace/FeatureListView.tsx";
import { FeatureWorkbenchView } from "./workspace/FeatureWorkbenchView.tsx";
import { PlaceholderView } from "./workspace/PlaceholderView.tsx";
import { ReposView } from "./workspace/ReposView.tsx";
import { KnowledgeView } from "./workspace/KnowledgeView.tsx";

const NAV_LABELS: Record<WorkspaceNavId, string> = {
  overview: "工作空间概览",
  features: "Features 执行区",
  knowledge: "业务知识图谱",
  architecture: "架构与决策",
  repos: "代码库基座",
  settings: "Workspace 设置"
};

function navFromPath(pathname: string | undefined): WorkspaceNavId {
  const p = pathname ?? "";
  if (p.includes("/features")) return "features";
  if (p.includes("/knowledge")) return "knowledge";
  if (p.includes("/architecture")) return "architecture";
  if (p.includes("/repos")) return "repos";
  if (p.includes("/settings")) return "settings";
  return "overview";
}

function WorkspaceRoutes() {
  const { workspaceId = "" } = useParams();

  return (
    <Routes>
      <Route index element={<DashboardView />} />
      <Route path="features" element={<FeatureListView />} />
      <Route path="features/:featureId" element={<FeatureWorkbenchView />} />
      <Route path="knowledge" element={<KnowledgeView />} />
      <Route path="architecture" element={<PlaceholderView title="架构与决策 (ADR)" />} />
      <Route path="repos" element={<ReposView />} />
      <Route path="settings" element={<PlaceholderView title="Workspace 设置" />} />
      <Route path="*" element={<Navigate to={`/w/${workspaceId}`} replace />} />
    </Routes>
  );
}

export function WorkspaceShellPage() {
  const { workspaceId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const setDimension = useUiStore((s) => s.setDimension);

  const isFeatureWorkbench = /\/features\/[^/]+$/.test(location.pathname);
  const currentNav = navFromPath(location.pathname);
  const workspaceName = decodeURIComponent(workspaceId).split(/[/\\]/).filter(Boolean).pop() ?? workspaceId;

  const featuresQuery = useQuery({
    queryKey: queryKeys.features.list(workspaceId),
    queryFn: () => ensureDesktopApi().features.list()
  });
  const activeFeatures = useMemo(
    () => (featuresQuery.data ?? []).slice(0, 5).map((f) => ({ id: f.name, name: f.name, active: f.active })),
    [featuresQuery.data]
  );

  const breadcrumbs = useMemo(() => {
    const base = [workspaceName];
    if (currentNav !== "overview") base.push(NAV_LABELS[currentNav]);
    return base;
  }, [workspaceName, currentNav]);

  useEffect(() => {
    setDimension(isFeatureWorkbench ? "feature" : "workspace");
  }, [isFeatureWorkbench, setDimension]);

  if (isFeatureWorkbench) {
    return <FeatureWorkbenchView />;
  }

  const goNav = (id: WorkspaceNavId) => {
    const paths: Record<WorkspaceNavId, string> = {
      overview: `/w/${workspaceId}`,
      features: `/w/${workspaceId}/features`,
      knowledge: `/w/${workspaceId}/knowledge`,
      architecture: `/w/${workspaceId}/architecture`,
      repos: `/w/${workspaceId}/repos`,
      settings: `/w/${workspaceId}/settings`
    };
    navigate(paths[id]);
  };

  return (
    <WorkspaceLayout
      workspaceName={workspaceName}
      breadcrumbs={breadcrumbs}
      currentNav={currentNav}
      sidebarOpen={sidebarOpen}
      activeFeatures={activeFeatures}
      onNavChange={goNav}
      onFeatureSelect={(id) => navigate(`/w/${workspaceId}/features/${id}`)}
      onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
      onSettingsClick={() => goNav("settings")}
    >
      <WorkspaceRoutes />
    </WorkspaceLayout>
  );
}
