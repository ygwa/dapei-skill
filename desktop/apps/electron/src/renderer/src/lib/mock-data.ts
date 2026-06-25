export interface MockFeature {
  id: string;
  name: string;
  objective: string;
  stage: string;
  active: boolean;
  time: string;
}

export interface MockAdr {
  id: string;
  title: string;
  status: "Accepted" | "Proposed";
  date: string;
}

export interface MockDoc {
  id: string;
  title: string;
  type: string;
  stage: string;
}

export interface MockChange {
  id: string;
  file: string;
  status: "modified" | "added";
}

export const MOCK_FEATURES: MockFeature[] = [
  {
    id: "f1",
    name: "payment-refactor",
    objective: "重构支付网关以支持幂等回调",
    stage: "implementation",
    active: true,
    time: "2小时前"
  },
  {
    id: "f2",
    name: "auth-overhaul",
    objective: "迁移至 OAuth2.0 体系",
    stage: "solution-design",
    active: false,
    time: "1天前"
  }
];

export const MOCK_ADRS: MockAdr[] = [
  {
    id: "adr1",
    title: "ADR-012: 支付回调采用 Redis 分布式锁",
    status: "Accepted",
    date: "2023-10-24"
  },
  {
    id: "adr2",
    title: "ADR-011: 订单状态机拆分为独立模块",
    status: "Proposed",
    date: "2023-10-20"
  }
];

export const MOCK_DOCS: MockDoc[] = [
  { id: "d1", title: "payment-callback-analysis.md", type: "markdown", stage: "analyze-current" },
  { id: "d2", title: "solution-design.md", type: "markdown", stage: "solution-design" },
  { id: "d3", title: "implementation-plan.md", type: "markdown", stage: "implementation" }
];

export const MOCK_CHANGES: MockChange[] = [
  { id: "c1", file: "mall-payment/src/CallbackController.java", status: "modified" },
  { id: "c2", file: "mall-order/src/OrderStateMachine.java", status: "added" }
];

export const FEATURE_STAGES = ["现状分析", "方案设计", "代码实现", "测试验证", "评审验收"];

export function workspaceDisplayName(workspaceId: string): string {
  if (workspaceId === "demo") return "mall-core";
  return workspaceId;
}
