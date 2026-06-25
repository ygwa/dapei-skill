export interface PortalBuilder {
  build(workspaceRoot: string): Promise<{ outputDir: string }>;
}
