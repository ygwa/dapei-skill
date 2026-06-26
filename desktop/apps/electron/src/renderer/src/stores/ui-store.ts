import { create } from "zustand";
import type { AppDimension } from "@dapei/desktop-ui";

interface UiState {
  sidebarOpen: boolean;
  dimension: AppDimension;
  setSidebarOpen: (open: boolean) => void;
  setDimension: (d: AppDimension) => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: true,
  dimension: "workspace",
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setDimension: (dimension) => set({ dimension })
}));
