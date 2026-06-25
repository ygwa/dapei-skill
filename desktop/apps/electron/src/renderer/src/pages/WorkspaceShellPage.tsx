import { useEffect, useMemo } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import type { WorkspaceNavId } from "@dapei/desktop-ui";
import { WorkspaceLayout } from "@dapei/desktop-ui";
import { MOCK_FEATURES, workspaceDisplayName } from "../lib/mock-data.ts";
import { useUiStore } from "../stores/ui-store.ts";
import { DashboardView } from "./workspace/DashboardView.tsx";
import { FeatureListView } from "./workspace/FeatureListView.tsx";
import { FeatureWorkbenchView } from "./workspace/FeatureWorkbenchView.tsx";
import { PlaceholderView } from "./workspace/PlaceholderView.tsx";

const NAV_LABELS: Record<WorkspaceNavId, string> = {
  overview: "工作空间概览",
  features: "Features 执行区",
  knowledge: "业务知识图谱",
  architecture: "架构与决策",
  repos: "代码库基座",
  settings: "Workspace 设置"
};

function navFromPath(pathname: string): WorkspaceNavId {
  if (pathname.includes("/features")) return "features";
  if (pathname.includes("/knowledge")) return "knowledge";
  if (pathname.includes("/architecture")) return "architecture";
  if (pathname.includes("/repos")) return "repos";
  if (pathname.includes("/settings")) return "settings";
  return "overview";
}

function WorkspaceRoutes() {
  const { workspaceId = "" } = useParams();

  return (
    <Routes>
      <Route index element={<DashboardView />} />
      <Route path="features" element={<FeatureListView />} />
      <Route path="features/:featureId" element={<FeatureWorkbenchView />} />
      <Route path="knowledge" element={<PlaceholderView title="业务知识图谱" />} />
      <Route path="architecture" element={<PlaceholderView title="架构与决策 (ADR)" />} />
      <Route path="repos" element={<PlaceholderView title="代码库基座" />} />
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
  const workspaceName = workspaceDisplayName(workspaceId);

  const breadcrumbs = useMemo(() => {
    const base = [workspaceName];
    if (currentNav !== "overview") base.push(NAV_LABELS[currentNav]);
    return base;
  }, [workspaceName, currentNav]);

  const activeFeatures = useMemo(
    () => MOCK_FEATURES.map((f) => ({ id: f.id, name: f.name, active: f.active })),
    []
  );

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
