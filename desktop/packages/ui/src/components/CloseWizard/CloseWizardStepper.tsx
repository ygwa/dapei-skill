import type { WizardPreflight } from "./CloseWizardModal.tsx";

export type CloseWizardStep = "summary" | "select" | "preview" | "confirm" | "done";

const STEPS: Array<{ id: CloseWizardStep; label: string; index: number }> = [
  { id: "summary", label: "摘要", index: 1 },
  { id: "select", label: "勾选", index: 2 },
  { id: "preview", label: "预览", index: 3 },
  { id: "confirm", label: "确认", index: 4 }
];

interface CloseWizardStepperProps {
  currentStep: CloseWizardStep;
}

/**
 * Visual indicator for the 4-step Close wizard. The "done" step is
 * terminal and rendered separately (success banner in CloseWizardModal).
 */
export function CloseWizardStepper({ currentStep }: CloseWizardStepperProps) {
  const currentIndex = STEPS.find((s) => s.id === currentStep)?.index ?? 0;
  return (
    <ol className="flex items-center gap-2 text-xs" aria-label="Close wizard progress">
      {STEPS.map((step, i) => {
        const isComplete = step.index < currentIndex;
        const isCurrent = step.id === currentStep;
        const stepLiClass = `flex items-center gap-2${i < STEPS.length - 1 ? " after:mx-2 after:h-px after:w-8 after:bg-slate-200 after:content-['']" : ""}`;
        const stepDotClass = `flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-medium ${
          isComplete ? "border-emerald-500 bg-emerald-50 text-emerald-700"
            : isCurrent ? "border-indigo-500 bg-indigo-50 text-indigo-700"
            : "border-slate-200 bg-white text-slate-400"
        }`;
        const stepLabelClass = isCurrent ? "font-semibold text-slate-900" : "text-slate-500";
        return (
          <li key={step.id} className={stepLiClass}>
            <span className={stepDotClass} aria-current={isCurrent ? "step" : undefined}>
              {step.index}
            </span>
            <span className={stepLabelClass}>{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

interface CloseWizardSummaryProps {
  preflight: WizardPreflight;
}

/**
 * Step 1 of the Close wizard. Renders the feature summary block: name,
 * current stage, count of CDR assets that will be tagged by the auto-link.
 * No checkboxes — the user just confirms "yes, this is the feature I want
 * to close" before moving to the asset selection step.
 */
export function CloseWizardSummary({ preflight }: CloseWizardSummaryProps) {
  const archCount = preflight.architecture.items[0]?.candidates.length ?? 0;
  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-md border border-slate-200 bg-white p-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Feature</span>
          <span className="font-mono text-sm font-semibold text-slate-900">{preflight.feature}</span>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <dt className="text-slate-500">当前阶段</dt>
          <dd className="font-mono text-slate-700">
            {preflight.current_stage ?? <span className="italic text-slate-400">未开始</span>}
          </dd>
          <dt className="text-slate-500">将自动打标的认知资产</dt>
          <dd className="font-mono text-slate-700">{preflight.cdr_assets_tagged_preview} 条</dd>
        </dl>
      </div>

      <SectionApplicability
        title="决策日志"
        applicable={preflight.decisions.applicable}
        defaultSelected={preflight.decisions.default_selected}
        rationale={preflight.decisions.rationale}
      />
      <SectionApplicability
        title="架构笔记"
        applicable={preflight.architecture.applicable}
        defaultSelected={archCount}
        rationale={preflight.architecture.rationale}
      />
      <SectionApplicability
        title="报告"
        applicable={preflight.reports.applicable}
        defaultSelected={preflight.reports.default_selected}
        rationale={preflight.reports.rationale}
      />
      <SectionApplicability
        title="认知资产 unlink"
        applicable={preflight.cognitive.applicable}
        defaultSelected={0}
        rationale={preflight.cognitive.rationale}
      />
    </div>
  );
}

function SectionApplicability({
  title,
  applicable,
  defaultSelected,
  rationale
}: {
  title: string;
  applicable: boolean;
  defaultSelected: number;
  rationale: string;
}) {
  const dotClass = `mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
    applicable ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-400"
  }`;
  return (
    <div className="flex items-start gap-3 rounded-md border border-slate-100 bg-slate-50/50 p-2.5 text-xs">
      <span className={dotClass} aria-label={applicable ? "applicable" : "not applicable"}>
        {applicable ? "✓" : "·"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium text-slate-700">{title}</span>
          {applicable && defaultSelected > 0 && (
            <span className="font-mono text-[11px] text-slate-500">默认勾选 {defaultSelected}</span>
          )}
        </div>
        <p className="mt-0.5 text-slate-500">{rationale}</p>
      </div>
    </div>
  );
}