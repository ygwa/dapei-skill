/** node-pty 封装占位 */

export interface PtyBridge {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  dispose(): void;
}
