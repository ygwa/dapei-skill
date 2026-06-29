import { Check, Square, FileText } from "lucide-react";

interface ArtifactCheckboxBaseProps {
  checked: boolean;
  onToggle: () => void;
  label: string;
  description?: string;
  /** Optional path/source string to display in monospace. */
  path?: string;
  disabled?: boolean;
  /** Optional preview excerpt. */
  preview?: string;
}

/**
 * A single checkbox row for an artifact in the wizard's selection step.
 * Used for decisions / architecture / reports / cognitive sections — the
 * shape is the same across all 4 sections, only the icon and label text
 * vary.
 */
export function ArtifactCheckbox({
  checked,
  onToggle,
  label,
  description,
  path,
  disabled = false,
  preview
}: ArtifactCheckboxBaseProps) {
  return (
    <label
      className={
        `flex items-start gap-2.5 rounded-md border p-2.5 text-xs transition-colors ${
          checked ? "border-indigo-300 bg-indigo-50/50" : "border-slate-200 bg-white hover:bg-slate-50"
        }${disabled ? " cursor-not-allowed opacity-50" : " cursor-pointer"}`
      }
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault();
          if (!disabled) onToggle();
        }}
        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-slate-300 bg-white"
      >
        {checked && <Check className="h-3 w-3 text-indigo-600" />}
        {!checked && <Square className="h-3 w-3 text-transparent" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium text-slate-800">{label}</span>
        </div>
        {description && <p className="mt-0.5 text-slate-500">{description}</p>}
        {path && (
          <p className="mt-1 truncate font-mono text-[11px] text-slate-500" title={path}>
            {path}
          </p>
        )}
        {preview && (
          <div className="mt-1.5 rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
            <FileText className="mr-1 inline h-3 w-3 text-slate-400" />
            <span className="line-clamp-2">{preview}</span>
          </div>
        )}
      </div>
    </label>
  );
}

/**
 * Container for a section's checkbox list with a header row that
 * includes a "select all / clear all" bulk action. Used by the
 * wizard's "select" step for each of the 4 promote_artifacts
 * sub-sections.
 */
interface ArtifactCheckboxGroupProps {
  title: string;
  rationale: string;
  count: number;
  selectedCount: number;
  onToggleAll: (selectAll: boolean) => void;
  children: React.ReactNode;
}

export function ArtifactCheckboxGroup({
  title,
  rationale,
  count,
  selectedCount,
  onToggleAll,
  children
}: ArtifactCheckboxGroupProps) {
  const allSelected = count > 0 && selectedCount === count;
  return (
    <section className="space-y-2">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          <p className="mt-0.5 text-xs text-slate-500">{rationale}</p>
        </div>
        {count > 0 && (
          <button
            type="button"
            onClick={() => onToggleAll(!allSelected)}
            className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700"
          >
            {allSelected ? "全不选" : "全选"}
          </button>
        )}
      </header>
      <div className="space-y-1.5">{children}</div>
      {count === 0 && (
        <div className="rounded-md border border-dashed border-slate-200 bg-slate-50/30 p-3 text-center text-xs text-slate-400">
          无候选
        </div>
      )}
    </section>
  );
}