export interface PortalServer {
  start(rootDir: string): Promise<{ url: string }>;
  stop(): Promise<void>;
}
