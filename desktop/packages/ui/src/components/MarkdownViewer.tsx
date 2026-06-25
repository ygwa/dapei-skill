import { AlignLeft } from "lucide-react";

export interface MarkdownViewerProps {
  title: string;
  badge?: string;
}

export function MarkdownViewer({ title, badge = "AI Generated" }: MarkdownViewerProps) {
  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-slate-100 px-8">
        <div className="flex items-center text-sm font-medium text-slate-600">
          <AlignLeft className="mr-2 h-4 w-4 text-indigo-500" />
          {title}
        </div>
        <span className="rounded border border-indigo-100 bg-indigo-50 px-2 py-1 text-xs text-indigo-600">
          {badge}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-10 lg:p-16">
        <article className="prose-dapei mx-auto max-w-3xl">
          <h1>方案设计: 支付回调幂等改造</h1>
          <p>
            基于前一阶段的现状分析，当前 <code>mall-payment</code> 的回调接口存在数据库并发写入导致的状态不一致风险。本方案提出使用
            Redis 分布式锁结合唯一索引进行改造。
          </p>

          <pre className="code-block">
            {`Webhook -> API Gateway -> PaymentService
   |
   |-- 1. Check Redis Lock (key: req.biz_id)
   |      |-- [Locked] -> Return "Processing"
   |      |-- [Acquired] -> Continue
   |
   |-- 2. Check DB status (status == PAYING?)
   |      |-- [No] -> Return "Success"
   |      |-- [Yes] -> Update DB & State Machine`}
          </pre>

          <div className="agent-hint">
            <p>
              <strong>Agent 提示:</strong> 此方案已通过架构规则校验，未发现明显阻碍。点击左侧的
              &quot;进入实现阶段&quot; 将开始代码修改。
            </p>
          </div>
        </article>
      </div>
    </div>
  );
}
