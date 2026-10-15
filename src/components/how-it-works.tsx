const REPOSITORY_URL = "https://github.com/guilhermeR3is/diario-oficial";

export function HowItWorks() {
  return (
    <footer className="mt-auto border-t-2 border-ink bg-white">
      <div className="mx-auto grid max-w-[1440px] gap-8 px-4 py-10 sm:px-8 lg:grid-cols-12">
        <div className="flex flex-col gap-3 lg:col-span-7">
          <h2 className="font-heading text-xl font-normal">Como funciona</h2>
          <p className="max-w-[58ch] leading-relaxed">
            A pergunta é procurada nos 7.926 trechos das 75 edições por dois
            caminhos ao mesmo tempo: pelo sentido (encontra “merenda” em
            “alimentação escolar”) e pelas palavras exatas (encontra “Portaria
            nº 1.346/2026”). Os seis melhores trechos vão para um modelo de
            linguagem, que só pode responder com base neles, precisa citar cada
            afirmação e diz “não encontrei” quando eles não bastam.
          </p>
          <a href={REPOSITORY_URL} className="w-fit font-semibold underline">
            Código e documentação no GitHub
          </a>
        </div>
        <div className="flex flex-col gap-3 lg:col-span-5">
          <h3 className="font-semibold">
            Quantas vezes o trecho certo veio entre os 5 primeiros
          </h3>
          <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1">
            <dt className="font-heading text-2xl">97%</dt>
            <dd>busca híbrida (sentido e palavras), a usada aqui</dd>
            <dt className="font-heading text-2xl">80%</dt>
            <dd>só palavras exatas</dd>
            <dt className="font-heading text-2xl">77%</dt>
            <dd>só sentido</dd>
          </dl>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Medido em 35 perguntas de teste com resposta conhecida, escritas
            pelo Claude (a IA que ajudou a construir o projeto), e não por
            usuários.
          </p>
        </div>
      </div>
    </footer>
  );
}
