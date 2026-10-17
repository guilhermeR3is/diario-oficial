export function SiteHeader() {
  return (
    <header className="bg-band text-band-foreground border-b-2 border-ink">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-4 py-4 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
        <h1 className="font-heading text-[1.75rem] leading-none tracking-[-0.01em] sm:text-[2rem]">
          Pergunte ao Diário Oficial
        </h1>
        <p className="text-sm leading-snug text-band-ink-soft lg:text-right">
          Projeto independente de portfólio, sem vínculo com a Prefeitura de São
          Luís · diários de jan–set/2026
        </p>
      </div>
    </header>
  );
}
