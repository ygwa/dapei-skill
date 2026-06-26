import { CheckCircle } from "lucide-react";

export interface StageStepperProps {
  stages: string[];
  currentIndex: number;
}

export function StageStepper({ stages, currentIndex }: StageStepperProps) {
  return (
    <div className="flex w-full max-w-2xl items-center space-x-2 md:space-x-4">
      {stages.map((stage, idx) => (
        <span key={stage} className="flex flex-1 items-center">
          <span
            className={`flex items-center ${
              idx === currentIndex
                ? "font-bold text-indigo-600"
                : idx < currentIndex
                  ? "text-slate-600"
                  : "text-slate-400"
            }`}
          >
            {idx < currentIndex ? (
              <CheckCircle className="mr-1.5 h-4 w-4" />
            ) : (
              <span
                className={`mr-1.5 h-4 w-4 rounded-full border-2 ${
                  idx === currentIndex ? "border-indigo-600" : "border-slate-300"
                }`}
              />
            )}
            <span className="hidden text-sm lg:inline">{stage}</span>
          </span>
          {idx < stages.length - 1 && (
            <span
              className={`mx-2 h-px max-w-[80px] flex-1 ${
                idx < currentIndex ? "bg-indigo-300" : "bg-slate-200"
              }`}
            />
          )}
        </span>
      ))}
    </div>
  );
}
