import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

/**
 * Local static-file server for the dapei CDR portal. M2-1 wires
 * this up: a workspace's portal at
 * `<workspaceRoot>/.dapei/docs-portal/.vitepress/dist/` is served
 * on a 127.0.0.1-only random port. The renderer gets the URL
 * via dapei:knowledge:portalUrl and loads it in a BrowserView.
 *
 * Security:
 *  - binds 127.0.0.1 only (never 0.0.0.0)
 *  - path traversal blocked: any URL containing '..' or
 *    resolving outside rootDir returns 404
 *  - CSP + X-Content-Type-Options + X-Frame-Options on
 *    every response
 *  - long-lived per workspace; main process stops the
 *    server on quit or workspace switch
 */
const PORTAL_RELATIVE = ".dapei/docs-portal/.vitepress/dist";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

function setSecurityHeaders(res: ServerResponse): void {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self' 'unsafe-inline' 'unsafe-eval'; img-src 'self' data: https:; connect-src 'self'"
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
}

function safeJoin(rootDir: string, urlPath: string): string | null {
  // Reject any path that escapes rootDir
  const cleaned = urlPath.split("?")[0]?.split("#")[0] ?? "/";
  const decoded = decodeURIComponent(cleaned);
  if (decoded.includes("..")) return null;
  const full = normalize(resolve(join(rootDir, decoded)));
  if (!full.startsWith(rootDir)) return null;
  return full;
}

export interface StaticServer {
  url: string;
  port: number;
  stop(): Promise<void>;
}

/**
 * Start a local server for the workspace's portal. Returns
 * the URL and a stop() handle. If the portal directory does
 * not exist (e.g., cdr.doc.generate has never been run),
 * the server still starts; the renderer shows an empty
 * state with a "Generate" button.
 */
export async function startStaticServer(workspaceRoot: string): Promise<StaticServer> {
  const rootDir = resolve(join(workspaceRoot, PORTAL_RELATIVE));
  const rootExists = existsSync(rootDir) && statSync(rootDir).isDirectory();
  // We serve the directory even if it doesn't exist; the
  // handler returns a friendly placeholder for missing
  // paths so the UI can show "no portal yet".

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    setSecurityHeaders(res);
    const path = safeJoin(rootDir, req.url ?? "/");
    if (path === null) {
      res.statusCode = 400;
      res.end("bad path");
      return;
    }
    if (!rootExists) {
      res.statusCode = 503;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(
        `<!doctype html><html><head><meta charset="utf-8"><title>Portal not built</title>` +
        `<style>body{font-family:system-ui;padding:2rem;color:#475569}</style></head>` +
        `<body><h1>Portal not built yet</h1><p>Run <code>cdr.doc.generate</code> from the engine to build the portal at <code>${PORTAL_RELATIVE}</code>.</p></body></html>`
      );
      return;
    }
    // Try the file; fall back to index.html for SPA-style routes
    let target = path;
    try {
      const stat = statSync(target);
      if (stat.isDirectory()) target = join(target, "index.html");
    } catch {
      target = join(rootDir, "index.html");
    }
    try {
      const data = readFileSync(target);
      const ext = extname(target).toLowerCase();
      res.setHeader("Content-Type", MIME[ext] ?? "application/octet-stream");
      res.statusCode = 200;
      res.end(data);
    } catch {
      res.statusCode = 404;
      res.end("not found");
    }
  });

  return new Promise<StaticServer>((resolveStart, rejectStart) => {
    server.on("error", rejectStart);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        rejectStart(new Error("failed to bind portal server"));
        return;
      }
      const port = addr.port;
      const url = `http://127.0.0.1:${port}/`;
      resolveStart({
        url,
        port,
        async stop() {
          return new Promise<void>((resolveStop) => {
            server.close(() => resolveStop());
          });
        }
      });
    });
  });
}
