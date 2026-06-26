/// <reference types="vite/client" />

import type { DesktopApi } from "@dapei/desktop-contracts";

declare global {
  interface Window {
    dapei: DesktopApi;
  }
}

export {};
