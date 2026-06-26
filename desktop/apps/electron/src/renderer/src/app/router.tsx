import { createHashRouter, Navigate } from "react-router-dom";
import { LauncherPage } from "../pages/LauncherPage.tsx";
import { WorkspaceShellPage } from "../pages/WorkspaceShellPage.tsx";

export const router = createHashRouter([
  { path: "/", element: <LauncherPage /> },
  { path: "/w/:workspaceId/*", element: <WorkspaceShellPage /> },
  { path: "*", element: <Navigate to="/" replace /> }
]);
