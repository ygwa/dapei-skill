import { ChevronRight, Search, Sidebar } from "lucide-react";

export interface TopBarProps {
  breadcrumbs: string[];
  onToggleSidebar?: () => void;
  onSearchClick?: () => void;
}

export function TopBar({ breadcrumbs, onToggleSidebar, onSearchClick }: TopBarProps) {
  return (
    <div className="flex h-14 shrink-0 select-none items-center justify-between border-b border-slate-200 bg-white px-4">
      <div className="flex items-center space-x-2">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="mr-1 rounded-md p-1.5 text-slate-400 hover:bg-slate-100"
          >
            <Sidebar className="h-4 w-4" />
          </button>
        )}
        <div className="flex items-center text-sm font-medium">
          {breadcrumbs.map((bc, idx) => (
            <span key={`${bc}-${idx}`} className="flex items-center">
              <span
                className={
                  idx === breadcrumbs.length - 1
                    ? "text-slate-800"
                    : "cursor-pointer text-slate-500 hover:text-slate-800"
                }
              >
                {bc}
              </span>
              {idx < breadcrumbs.length - 1 && (
                <ChevronRight className="mx-1 h-4 w-4 text-slate-300" />
              )}
            </span>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={onSearchClick}
        className="flex w-64 cursor-text items-center rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-400 shadow-inner transition-colors hover:border-slate-300"
      >
        <Search className="mr-2 h-3.5 w-3.5" /> 搜索 (⌘K)
      </button>
    </div>
  );
}
