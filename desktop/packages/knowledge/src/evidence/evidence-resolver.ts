export interface EvidenceSource {
  file: string;
  line: number;
  repo: string;
  symbol_handle?: string;
}

export interface EvidenceResolver {
  resolve(workspaceRoot: string, source: EvidenceSource): string;
}
