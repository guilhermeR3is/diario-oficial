"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SearchHit } from "@/search/search-hit";
import { Booklet } from "./booklet";
import { COVER_COUNT } from "./cover";
import { SourceDetail } from "./source-detail";

export type SourcesView =
  | { kind: "empty" }
  | { kind: "searching" }
  // a resposta saiu sem nenhum trecho: a busca não achou nada parecido
  | { kind: "none" }
  | {
      kind: "ready";
      sources: SearchHit[];
      citations: number[];
      notFound: boolean;
    };

export function SourcesPanel({
  view,
  active,
  onSelect,
}: {
  view: SourcesView;
  active: number;
  onSelect: (n: number) => void;
}) {
  return (
    <section
      aria-labelledby="sources-heading"
      className="flex max-h-[calc(100dvh-2rem)] flex-col gap-4 rounded-sm border-[1.5px] border-ink bg-white p-5"
    >
      <h2 id="sources-heading" className="font-heading text-xl font-normal">
        {view.kind === "ready" && view.notFound
          ? "Trechos consultados"
          : "Fontes"}
      </h2>
      {view.kind !== "ready" ? (
        <>
          <Cord>
            {Array.from({ length: COVER_COUNT }, (_, i) => (
              <span key={i} className="pt-[9px] opacity-40">
                <Booklet n={i + 1} cited={false} active={false} />
              </span>
            ))}
          </Cord>
          <p className="max-w-[44ch] text-sm leading-relaxed text-muted-foreground">
            {view.kind === "searching"
              ? "Procurando os trechos mais próximos nos 7.926 trechos das 75 edições…"
              : view.kind === "none"
                ? "Nenhum trecho dos diários se parece com esta pergunta, então não há fonte para mostrar."
                : "Cada resposta traz até seis trechos dos diários. Cada número na resposta abre o seu folheto aqui: o texto original, a edição, a data e a página."}
          </p>
        </>
      ) : (
        <Tabs
          value={String(active)}
          onValueChange={(value) => onSelect(Number(value))}
          // sem espaço entre as abas e o trecho: o folheto ativo desce até encostar na faixa da sua cor
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          <p className="mb-3 text-sm text-muted-foreground">
            {view.notFound
              ? "Nenhum destes trechos responde à pergunta; eles são os mais próximos que a busca achou."
              : "Folheto cheio: citado na resposta. Tracejado: consultado, mas não citado."}
          </p>
          <TabsList
            aria-label="Fontes da resposta"
            className="w-full items-start justify-start gap-2 rounded-none border-t-[1.5px] border-ink bg-transparent p-0 pb-2 group-data-horizontal/tabs:h-auto"
          >
            {view.sources.map((source, index) => {
              const n = index + 1;
              const cited = view.citations.includes(n);
              return (
                <TabsTrigger
                  key={source.chunkId}
                  value={String(n)}
                  aria-label={`Fonte ${n}${cited ? ", citada na resposta" : ""}: ${source.title}`}
                  className="group h-auto flex-none rounded-none border-0 bg-transparent p-0 pt-[9px] shadow-none after:hidden focus-visible:ring-0 data-active:bg-transparent data-active:shadow-none"
                >
                  <Booklet n={n} cited={cited} active={n === active} />
                </TabsTrigger>
              );
            })}
          </TabsList>
          {view.sources.map((source, index) => (
            <TabsContent
              key={source.chunkId}
              value={String(index + 1)}
              className="min-h-0 flex-1 overflow-y-auto pr-2 pb-10 [mask-image:linear-gradient(to_bottom,black_calc(100%-2.5rem),transparent)]"
            >
              <SourceDetail source={source} n={index + 1} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </section>
  );
}

export function Cord({ children }: { children: React.ReactNode }) {
  return (
    <div aria-hidden className="flex gap-2 border-t-[1.5px] border-ink pb-2">
      {children}
    </div>
  );
}
