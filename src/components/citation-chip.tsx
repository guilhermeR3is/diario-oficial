import { cn } from "cn";
import { coverStyle } from "./cover";

export function CitationChip({
  n,
  label,
  active,
  onSelect,
}: {
  n: number;
  label: string;
  active: boolean;
  onSelect: (n: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(n)}
      aria-label={`Fonte ${n}: ${label}`}
      aria-pressed={active}
      style={coverStyle(n)}
      className={cn(
        "mx-0.5 inline-flex h-[1.45em] min-w-[1.45em] -translate-y-px items-center justify-center rounded-sm border-[1.5px] border-ink bg-[var(--cover)] px-1 align-middle font-heading text-[0.8em] leading-none text-[var(--cover-ink)] transition-[translate,box-shadow] duration-150 ease-out motion-reduce:transition-none hover:-translate-y-0.5 hover:shadow-[0_2px_3px_rgb(var(--shadow-ink)/0.25)]",
        active && "translate-y-0.5 shadow-[inset_0_0_0_1.5px_var(--ink)]",
      )}
    >
      {n}
    </button>
  );
}
