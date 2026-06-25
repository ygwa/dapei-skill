import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ensureDesktopApi } from "../lib/desktop-api.ts";

/** 监听 dapei:workspace:mutated，驱动 TanStack Query 局部失效 */
export function useDesktopPushInvalidation(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const api = ensureDesktopApi();
    const unsub = api.events.subscribe((event) => {
      if (event.channel === "dapei:workspace:mutated") {
        if (event.payload.keys?.some((k) => k.startsWith("feature"))) {
          void queryClient.invalidateQueries({ queryKey: ["features"] });
        }
        void queryClient.invalidateQueries({ queryKey: ["workspace"] });
        void queryClient.invalidateQueries({ queryKey: ["repos"] });
      }
      if (event.channel === "dapei:agent:event") {
        // M1: append to agent message store
      }
    });
    return unsub;
  }, [queryClient]);
}
