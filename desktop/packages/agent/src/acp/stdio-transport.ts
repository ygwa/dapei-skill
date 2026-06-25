import type { ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import type { JsonRpcNotification, JsonRpcRequest, JsonRpcResponse } from "@dapei/desktop-contracts";
import { isJsonRpcNotification, isJsonRpcRequest } from "@dapei/desktop-contracts";

export type NotificationHandler = (notification: JsonRpcNotification) => void;

/** stdio 行分隔 JSON-RPC 传输（ACP 默认通道） */
export class StdioJsonRpcTransport {
  private readonly pending = new Map<
    string | number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  private notificationHandler: NotificationHandler | null = null;
  private nextId = 1;

  constructor(private readonly child: ChildProcess) {
    if (!child.stdout) throw new Error("ACP child stdout missing");
    const rl = createInterface({ input: child.stdout });
    rl.on("line", (line) => this.handleLine(line.trim()));
    child.stderr?.on("data", (chunk) => {
      const text = String(chunk).trim();
      if (text) console.warn("[acp stderr]", text);
    });
  }

  onNotification(handler: NotificationHandler): void {
    this.notificationHandler = handler;
  }

  request<M extends string, P, R>(method: M, params?: P): Promise<R> {
    const id = this.nextId++;
    const payload: JsonRpcRequest<M, P> = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.write(payload);
    });
  }

  notify<M extends string, P>(method: M, params?: P): void {
    this.write({ jsonrpc: "2.0", method, params });
  }

  dispose(): void {
    this.child.kill();
  }

  private write(msg: unknown): void {
    if (!this.child.stdin?.writable) throw new Error("ACP child stdin not writable");
    this.child.stdin.write(`${JSON.stringify(msg)}\n`);
  }

  private handleLine(line: string): void {
    if (!line) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      console.warn("[acp] non-json line ignored:", line.slice(0, 120));
      return;
    }
    if (isJsonRpcNotification(parsed)) {
      this.notificationHandler?.(parsed);
      return;
    }
    if (isJsonRpcRequest(parsed)) return;
    const res = parsed as JsonRpcResponse;
    if (res && typeof res === "object" && "id" in res && res.id !== null) {
      const entry = this.pending.get(res.id as string | number);
      if (!entry) return;
      this.pending.delete(res.id as string | number);
      if ("error" in res && res.error) {
        entry.reject(new Error(res.error.message));
      } else {
        entry.resolve((res as { result: unknown }).result);
      }
    }
  }
}
