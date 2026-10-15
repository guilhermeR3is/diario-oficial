import { cn } from "cn";
import { coverStyle } from "./cover";

// o folheto pendurado no cordão: preenchido quando a resposta o cita, só contornado quando foi apenas consultado
export function Booklet({
  n,
  cited,
  active,
}: {
  n: number;
  cited: boolean;
  active: boolean;
}) {
  return (
    <span
      aria-hidden
      style={coverStyle(n)}
      className={cn(
        "relative flex h-14 w-11 items-center justify-center rounded-sm border-[1.5px] border-ink font-heading text-xl transition-[translate,box-shadow] duration-200 ease-out motion-reduce:transition-none",
        "before:absolute before:-top-[9px] before:left-1/2 before:h-2 before:w-[1.5px] before:-translate-x-1/2 before:bg-ink",
        cited
          ? "bg-[var(--cover)] text-[var(--cover-ink)]"
          : "border-dashed bg-white text-ink",
        active
          ? "translate-y-2 shadow-[0_6px_10px_-4px_rgb(var(--shadow-ink)/0.45)]"
          : "group-hover:translate-y-1",
      )}
    >
      {n}
    </span>
  );
}
