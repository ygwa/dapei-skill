import { useEffect, useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import { CloseWizardStepper, type CloseWizardStep, CloseWizardSummary } from "./CloseWizardStepper.tsx";
import { ArtifactCheckbox, ArtifactCheckboxGroup } from "./ArtifactCheckbox.tsx";

/**
 * The minimum shape of preflight data the wizard needs. Mirrors
 * `desktop/packages/services/src/feature/types.ts#ClosePreflight`
 * without importing it directly (UI package does not depend on the
 * services package — types are duplicated as a structural type).
 *
 * Keep this in sync with the ClosePreflight type. The wizard treats
 * it as data-only and never mutates the fields.
 */
export interface WizardPreflight {
  feature: string;
  current_stage: string | null;
  cdr_assets_tagged_preview: number;
  decisions: {
    items: Array<{ source_present: boolean; default_target_path: string; preview: string }>;
    default_selected: number;
    display_order: number;
    applicable: boolean;
    rationale: string;
  };
  architecture: {
    items: Array<{ candidates: Array<{ source_path: string; target_path: string }> }>;
    default_selected: number;
    display_order: number;
    applicable: boolean;
    rationale: string;
  };
  reports: {
    items: Array<{ candidates: Array<{ rel_path: string; title: string; preview_excerpt?: string }> }>;
    default_selected: number;
    display_order: number;
    applicable: boolean;
    rationale: string;
  };
  cognitive: {
    items: Array<{ candidates: Array<{ kind: "behavior" | "state-machine" | "domain" | "business-rule" | "capability-map"; id: string; repo?: string }> }>;
    default_selected: number;
    display_order: number;
    applicable: boolean;
    rationale: string;
  };
}

export interface CloseWizardPayload {
  feature: string;
  confirmed: true;
  force?: boolean;
  promote_artifacts?: {
    decisions?: { skip?: boolean; target_path?: string };
    architecture?: { entries: Array<{ source_path: string; target_path: string }> };
    cognitive?: { unlink: Array<{ kind: "behavior" | "state-machine" | "domain" | "business-rule" | "capability-map"; id: string; repo?: string }> };
    reports?: { copy_paths: string[] };
  };
}

interface CloseWizardModalProps {
  open: boolean;
  preflight: WizardPreflight | null;
  /** Loading state for `prepareClose`. The modal shows a skeleton. */
  loading?: boolean;
  /** Error from `prepareClose`. The modal shows the error and a retry button. */
  loadError?: { code: string; message: string } | null;
  /** Called when the user clicks "Retry" after a load error. */
  onRetry?: () => void;
  /** Called when the user confirms the close. The parent is responsible
   * for invoking `feature.closeWithPromote` and handling the response. */
  onConfirm: (payload: CloseWizardPayload) => void;
  /** Called when the user dismisses the modal at any step (cancel button,
   * X button, Escape key, click on backdrop). The wizard state is reset. */
  onCancel: () => void;
}

/**
 * The 4-step Close Feature modal. Step 1 (summary) shows what will
 * happen; step 2 (select) lets the user tick which artifacts to
 * promote; step 3 (preview) shows the final payload as JSON-like text;
 * step 4 (confirm) shows the engine's success banner.
 *
 * State is held inside the modal so the parent component does not
 * need to track which checkboxes are ticked. The wizard self-resets
 * when `open` goes false.
 */
export function CloseWizardModal({
  open,
  preflight,
  loading = false,
  loadError = null,
  onRetry,
  onConfirm,
  onCancel
}: CloseWizardModalProps) {
  const [step, setStep] = useState<CloseWizardStep>("summary");

  // Decisions / architecture / cognitive unlink / reports — each
  // tracked as a Set of stable keys. The wizard self-resets when the
  // modal closes.
  const [decisionsChecked, setDecisionsChecked] = useState<boolean>(false);
  const [archChecked, setArchChecked] = useState<Set<string>>(new Set());
  const [reportsChecked, setReportsChecked] = useState<Set<string>>(new Set());
  const [cognitiveChecked, setCognitiveChecked] = useState<Set<string>>(new Set());

  // Reset state whenever the modal opens or the underlying preflight
  // changes (e.g. user re-runs `prepareClose`).
  useEffect(() => {
    if (!open) return;
    setStep("summary");
    setDecisionsChecked(preflight?.decisions.default_selected === 1);
    setArchChecked(new Set());
    const reports = preflight?.reports.items[0]?.candidates ?? [];
    setReportsChecked(new Set(reports.filter((_, i) => i < (preflight?.reports.default_selected ?? 0)).map((r) => r.rel_path)));
    setCognitiveChecked(new Set());
  }, [open, preflight]);

  // Esc key dismisses
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && step !== "confirm") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, step, onCancel]);

  if (!open) return null;

  const handleConfirm = (): void => {
    if (!preflight) return;
    const promote_artifacts: CloseWizardPayload["promote_artifacts"] = {};
    // decisions
    if (!decisionsChecked && preflight.decisions.items[0]) {
      promote_artifacts.decisions = { skip: true };
    } else if (preflight.decisions.items[0]?.default_target_path) {
      promote_artifacts.decisions = { target_path: preflight.decisions.items[0].default_target_path };
    }
    // architecture
    const archEntries = (preflight.architecture.items[0]?.candidates ?? []).filter((c) => archChecked.has(c.source_path));
    if (archEntries.length > 0) promote_artifacts.architecture = { entries: archEntries };
    // reports
    const reportPaths = (preflight.reports.items[0]?.candidates ?? []).filter((c) => reportsChecked.has(c.rel_path)).map((c) => c.rel_path);
    if (reportPaths.length > 0) promote_artifacts.reports = { copy_paths: reportPaths };
    // cognitive unlink
    const unlinkEntries = (preflight.cognitive.items[0]?.candidates ?? []).filter((c) => cognitiveChecked.has(`${c.kind}::${c.id}`));
    if (unlinkEntries.length > 0) promote_artifacts.cognitive = { unlink: unlinkEntries };
    onConfirm({
      feature: preflight.feature,
      confirmed: true,
      promote_artifacts: Object.keys(promote_artifacts).length > 0 ? promote_artifacts : undefined
    });
    setStep("done");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Close feature ${preflight?.feature ?? ""}`}
      onClick={(e) => {
        if (e.target === e.currentTarget && step !== "done") onCancel();
      }}
    >
      <div className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              关闭 Feature
              <span className="ml-2 font-mono text-xs font-normal text-slate-500">{preflight?.feature ?? ""}</span>
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              回写选中的资产到 workspace 维度（<code className="font-mono text-[11px]">docs/decisions/</code>、<code className="font-mono text-[11px]">docs/architecture/</code>、<code className="font-mono text-[11px]">docs/feature-impact/</code>）
            </p>
          </div>
<button
        type="button"
        onClick={onCancel}
        aria-label="关闭"
        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      >
        <X className="h-4 w-4" />
      </button>
    </header>

    <div className="border-b border-slate-100 px-5 py-2.5">
      <CloseWizardStepper currentStep={step} />
    </div>

    <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
      {loading && (
        <div className="space-y-2 text-xs text-slate-500">
          <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
        </div>
      )}

      {!loading && loadError && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs">
          <div className="mb-1 flex items-center gap-2 text-amber-700">
            <AlertTriangle className="h-4 w-4" />
            <span className="font-semibold">加载 preflight 失败</span>
          </div>
          <p className="text-slate-700">
            <code className="font-mono">{loadError.code}</code>: {loadError.message}
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 rounded border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
            >
              重试
            </button>
          )}
        </div>
      )}

      {!loading && !loadError && preflight && step === "summary" && <CloseWizardSummary preflight={preflight} />}

      {!loading && !loadError && preflight && step === "select" && (
        <SelectStep
          preflight={preflight}
          decisionsChecked={decisionsChecked}
          onToggleDecisions={() => setDecisionsChecked((v) => !v)}
          archChecked={archChecked}
          onToggleArch={(sourcePath) => {
            setArchChecked((prev) => {
              const next = new Set(prev);
              if (next.has(sourcePath)) next.delete(sourcePath);
              else next.add(sourcePath);
              return next;
            });
          }}
          reportsChecked={reportsChecked}
          onToggleReport={(relPath) => {
            setReportsChecked((prev) => {
              const next = new Set(prev);
              if (next.has(relPath)) next.delete(relPath);
              else next.add(relPath);
              return next;
            });
          }}
          cognitiveChecked={cognitiveChecked}
          onToggleCognitive={(key) => {
            setCognitiveChecked((prev) => {
              const next = new Set(prev);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              return next;
            });
          }}
        />
      )}

      {!loading && !loadError && preflight && step === "preview" && (
        <PreviewStep
          preflight={preflight}
          decisionsChecked={decisionsChecked}
          archChecked={archChecked}
          reportsChecked={reportsChecked}
          cognitiveChecked={cognitiveChecked}
        />
      )}

      {!loading && !loadError && preflight && step === "confirm" && (
        <ConfirmStep preflight={preflight} />
      )}

      {!loading && !loadError && step === "done" && (
        <div className="space-y-2 text-sm">
          <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-emerald-800">
            <p className="font-semibold">关闭请求已发送</p>
            <p className="mt-1 text-xs">
              引擎正在执行 feature.close。请关注 toast / banner 提示。
            </p>
          </div>
        </div>
      )}
    </div>

    <footer className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-5 py-3">
      <span className="text-[11px] text-slate-500">
        {step === "summary" ? "步骤 1/4 — 概览" : step === "select" ? "步骤 2/4 — 资产勾选" : step === "preview" ? "步骤 3/4 — 预览" : step === "done" ? "完成" : "步骤 4/4 — 确认"}
      </span>
      <div className="flex items-center gap-2">
        {step !== "done" && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            取消
          </button>
        )}
        {step === "summary" && (
          <button
            type="button"
            disabled={!preflight || loading || Boolean(loadError)}
            onClick={() => setStep("select")}
            className={
              preflight && !loading && !loadError
                ? "rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                : "cursor-not-allowed rounded bg-slate-300 px-3 py-1.5 text-xs font-medium text-white"
            }
          >
            下一步：勾选资产
          </button>
        )}
        {step === "select" && (
          <button
            type="button"
            disabled={!preflight}
            onClick={() => setStep("preview")}
            className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
          >
            下一步：预览
          </button>
        )}
        {step === "preview" && (
          <button
            type="button"
            disabled={!preflight}
            onClick={() => setStep("confirm")}
            className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
          >
            下一步：确认
          </button>
        )}
        {step === "confirm" && (
          <button
            type="button"
            onClick={handleConfirm}
            data-testid="close-wizard-confirm"
            className="rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
          >
            确认关闭（不可撤销）
          </button>
        )}
        {step === "done" && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded bg-slate-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
          >
            完成
          </button>
        )}
      </div>
    </footer>
  </div>
</div>
  );
}

// ---- step bodies (kept local for cohesion) ------------------------------

function SelectStep({
  preflight,
  decisionsChecked,
  onToggleDecisions,
  archChecked,
  onToggleArch,
  reportsChecked,
  onToggleReport,
  cognitiveChecked,
  onToggleCognitive
}: {
  preflight: WizardPreflight;
  decisionsChecked: boolean;
  onToggleDecisions: () => void;
  archChecked: Set<string>;
  onToggleArch: (key: string) => void;
  reportsChecked: Set<string>;
  onToggleReport: (key: string) => void;
  cognitiveChecked: Set<string>;
  onToggleCognitive: (key: string) => void;
}) {
  const decisions = preflight.decisions.items;
  const archCandidates = preflight.architecture.items[0]?.candidates ?? [];
  const reportCandidates = preflight.reports.items[0]?.candidates ?? [];
  const cognitiveCandidates = preflight.cognitive.items[0]?.candidates ?? [];

  return (
    <div className="space-y-5">
      <ArtifactCheckboxGroup
        title="决策日志"
        rationale={preflight.decisions.rationale}
        count={decisions.length}
        selectedCount={decisionsChecked ? decisions.length : 0}
        onToggleAll={(selectAll) => onToggleDecisions()}
      >
        {decisions.map((d, i) => (
          <ArtifactCheckbox
            key={`decision-${i}`}
            checked={decisionsChecked}
            onToggle={onToggleDecisions}
            label={d.default_target_path.split("/").pop() ?? "decision-log"}
            description="复制 memory/decision-log.md 到 docs/decisions/<feature>-decisions.md"
            path={d.default_target_path}
            preview={d.preview}
          />
        ))}
      </ArtifactCheckboxGroup>

      <ArtifactCheckboxGroup
        title="架构笔记"
        rationale={preflight.architecture.rationale}
        count={archCandidates.length}
        selectedCount={archChecked.size}
        onToggleAll={(selectAll) => {
          if (selectAll) {
            archCandidates.forEach((c) => onToggleArch(c.source_path));
          } else {
            [...archChecked].forEach((k) => onToggleArch(k));
          }
        }}
      >
        {archCandidates.map((c) => (
          <ArtifactCheckbox
            key={c.source_path}
            checked={archChecked.has(c.source_path)}
            onToggle={() => onToggleArch(c.source_path)}
            label={c.source_path.split("/").pop() ?? c.source_path}
            description={`复制 ${c.source_path} → ${c.target_path}`}
            path={`${c.source_path} → ${c.target_path}`}
          />
        ))}
      </ArtifactCheckboxGroup>

      <ArtifactCheckboxGroup
        title="报告"
        rationale={preflight.reports.rationale}
        count={reportCandidates.length}
        selectedCount={reportsChecked.size}
        onToggleAll={(selectAll) => {
          if (selectAll) {
            reportCandidates.forEach((c) => onToggleReport(c.rel_path));
          } else {
            [...reportsChecked].forEach((k) => onToggleReport(k));
          }
        }}
      >
        {reportCandidates.map((r) => (
          <ArtifactCheckbox
            key={r.rel_path}
            checked={reportsChecked.has(r.rel_path)}
            onToggle={() => onToggleReport(r.rel_path)}
            label={r.title}
            description={`复制到 docs/feature-impact/${preflight.feature}/`}
            path={r.rel_path}
            {...(r.preview_excerpt ? { preview: r.preview_excerpt } : {})}
          />
        ))}
      </ArtifactCheckboxGroup>

      <ArtifactCheckboxGroup
        title="认知资产 unlink"
        rationale={preflight.cognitive.rationale}
        count={cognitiveCandidates.length}
        selectedCount={cognitiveChecked.size}
        onToggleAll={(selectAll) => {
          if (selectAll) {
            cognitiveCandidates.forEach((c) => onToggleCognitive(`${c.kind}::${c.id}`));
          } else {
            [...cognitiveChecked].forEach((k) => onToggleCognitive(k));
          }
        }}
      >
        {cognitiveCandidates.map((c) => (
          <ArtifactCheckbox
            key={`${c.kind}::${c.id}`}
            checked={cognitiveChecked.has(`${c.kind}::${c.id}`)}
            onToggle={() => onToggleCognitive(`${c.kind}::${c.id}`)}
            label={`${c.kind}:${c.id}`}
            description="从 created_by_feature 标签中清除"
            path={c.repo ?? ""}
          />
        ))}
      </ArtifactCheckboxGroup>
    </div>
  );
}

function PreviewStep({
  preflight,
  decisionsChecked,
  archChecked,
  reportsChecked,
  cognitiveChecked
}: {
  preflight: WizardPreflight;
  decisionsChecked: boolean;
  archChecked: Set<string>;
  reportsChecked: Set<string>;
  cognitiveChecked: Set<string>;
}) {
  const archEntries = (preflight.architecture.items[0]?.candidates ?? []).filter((c) => archChecked.has(c.source_path));
  const reportPaths = (preflight.reports.items[0]?.candidates ?? []).filter((c) => reportsChecked.has(c.rel_path)).map((c) => c.rel_path);
  const unlinkEntries = (preflight.cognitive.items[0]?.candidates ?? []).filter((c) => cognitiveChecked.has(`${c.kind}::${c.id}`));

  const payload: CloseWizardPayload["promote_artifacts"] = {};
  if (!decisionsChecked && preflight.decisions.items[0]) {
    payload.decisions = { skip: true };
  } else if (preflight.decisions.items[0]?.default_target_path) {
    payload.decisions = { target_path: preflight.decisions.items[0].default_target_path };
  }
  if (archEntries.length > 0) payload.architecture = { entries: archEntries };
  if (reportPaths.length > 0) payload.reports = { copy_paths: reportPaths };
  if (unlinkEntries.length > 0) payload.cognitive = { unlink: unlinkEntries };

  return (
    <div className="space-y-3 text-xs">
      <p className="text-slate-600">
        以下 payload 将随 <code className="font-mono text-[11px]">feature.close</code> 一起发出。引擎端 <code className="font-mono text-[11px]">promote_artifacts</code> 校验通过后会按本次勾选回写。
      </p>
      <pre className="max-h-72 overflow-auto rounded-md border border-slate-200 bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100">
        {JSON.stringify(payload, null, 2)}
      </pre>
      <ul className="space-y-1 text-[11px] text-slate-500">
        <li>· decision-log: {decisionsChecked ? "复制" : "跳过"}</li>
        <li>· architecture: {archEntries.length} 个文件</li>
        <li>· reports: {reportPaths.length} 个文件</li>
        <li>· cognitive unlink: {unlinkEntries.length} 个资产</li>
        <li>· cdr.feature.link 自动调用（不可关闭）</li>
      </ul>
    </div>
  );
}

function ConfirmStep({ preflight }: { preflight: WizardPreflight }) {
  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
        <p className="font-semibold">即将执行 — 不可撤销</p>
        <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-amber-700">
          <li>删除 feature worktree（<code className="font-mono text-[11px]">features/{preflight.feature}/repos/*</code>）</li>
          <li>写入 <code className="font-mono text-[11px]">docs/decisions/{preflight.feature}-decisions.md</code></li>
          <li>写入 <code className="font-mono text-[11px]">docs/feature-impact/{preflight.feature}.md</code></li>
          <li>（如勾选）写入 <code className="font-mono text-[11px]">docs/architecture/*</code></li>
          <li>（如勾选）复制 <code className="font-mono text-[11px]">reports/*</code> 到 <code className="font-mono text-[11px]">docs/feature-impact/{preflight.feature}/</code></li>
          <li>（如勾选）清除认知资产 <code className="font-mono text-[11px]">created_by_feature</code> 标签</li>
          <li>自动调 <code className="font-mono text-[11px]">cdr.feature.link</code>（不可关闭）</li>
        </ul>
      </div>
      <p className="text-xs text-slate-600">
        引擎已强制要求 <code className="font-mono text-[11px]">confirmed: true</code>（acceptance 闸门，ADR-0010 / feature.close confirmGate）。如果你还没准备好，可以点取消回到 feature。
      </p>
    </div>
  );
}