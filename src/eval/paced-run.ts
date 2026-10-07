// duas falhas seguidas indicam cota esgotada ou chave inválida; seguir só gastaria o que resta
const MAX_CONSECUTIVE_FAILURES = 2;

export type PacedDeps<Item, Result> = {
  process: (item: Item) => Promise<Result | null>;
  save: (result: Result) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  onItem: (outcome: {
    item: Item;
    position: number;
    total: number;
    result: Result | null;
  }) => void;
};

export async function runPaced<Item, Result>(
  items: Item[],
  deps: PacedDeps<Item, Result>,
  pauseMs: number,
): Promise<{ saved: number; failed: number; stoppedEarly: boolean }> {
  let saved = 0;
  let failed = 0;
  let consecutiveFailures = 0;

  for (const [index, item] of items.entries()) {
    const startedAt = deps.now();
    const result = await deps.process(item);

    if (result) {
      await deps.save(result);
      saved += 1;
      consecutiveFailures = 0;
    } else {
      failed += 1;
      consecutiveFailures += 1;
    }
    deps.onItem({ item, position: index + 1, total: items.length, result });

    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      return { saved, failed, stoppedEarly: true };
    }
    // o limite da Groq é de tokens por minuto: a pausa conta a partir do início de cada item
    if (index < items.length - 1) {
      await deps.sleep(Math.max(0, pauseMs - (deps.now() - startedAt)));
    }
  }
  return { saved, failed, stoppedEarly: false };
}
