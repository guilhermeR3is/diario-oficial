"use client";

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import type { SearchHit } from "@/search/search-hit";
import { Booklet } from "./booklet";
import { SourceDetail } from "./source-detail";

// no celular as fontes ficam numa fileira abaixo da resposta e abrem numa gaveta
export function SourcesStrip({
  sources,
  citations,
  notFound,
  active,
  open,
  onSelect,
  onOpenChange,
}: {
  sources: SearchHit[];
  citations: number[];
  notFound: boolean;
  active: number;
  open: boolean;
  onSelect: (n: number) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const source = sources[active - 1];
  return (
    <section aria-labelledby="strip-heading" className="flex flex-col gap-3">
      <h2 id="strip-heading" className="text-base font-semibold">
        {notFound ? "Trechos consultados" : "Fontes"}
        <span className="font-normal text-muted-foreground">
          {" "}
          · toque para ler o trecho
        </span>
      </h2>
      <ul className="flex flex-wrap gap-2 border-t-[1.5px] border-ink pb-2">
        {sources.map((hit, index) => {
          const n = index + 1;
          const cited = citations.includes(n);
          return (
            <li key={hit.chunkId}>
              <button
                type="button"
                onClick={() => onSelect(n)}
                aria-label={`Abrir a fonte ${n}${cited ? ", citada na resposta" : ""}: ${hit.title}`}
                className="group pt-[9px]"
              >
                <Booklet n={n} cited={cited} active={open && n === active} />
              </button>
            </li>
          );
        })}
      </ul>
      <Drawer open={open && Boolean(source)} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[88dvh] rounded-t-sm border-[1.5px] border-ink bg-white [&>div:first-child]:bg-ink-faint">
          <DrawerHeader className="sr-only">
            <DrawerTitle className="font-heading text-xl font-normal">
              Fonte {active}
            </DrawerTitle>
            <DrawerDescription>
              {citations.includes(active)
                ? "Citada na resposta."
                : "Consultada, mas não citada."}
            </DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pt-4 pb-8">
            {source && <SourceDetail source={source} n={active} />}
          </div>
        </DrawerContent>
      </Drawer>
    </section>
  );
}
