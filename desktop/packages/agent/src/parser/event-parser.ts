/** stdout / PTY 行 → AgentEvent（实现阶段填入） */

export interface EventParser {
  parseLine(line: string): void;
  flush(): void;
}
