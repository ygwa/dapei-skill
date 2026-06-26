import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useDesktopPushInvalidation } from "../hooks/use-desktop-push.ts";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 }
  }
});

function PushBridge(): null {
  useDesktopPushInvalidation();
  return null;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <PushBridge />
      {children}
    </QueryClientProvider>
  );
}
