# Fonte de dados: portal do Diário Oficial de São Luís

Documentação nossa, escrita por tentativa e erro em 05/10/2026. O portal **não publica documentação de API**. Tudo abaixo foi observado lendo o JavaScript público do site (`/static/portal-public.js`) e fazendo requisições GET, uma por segundo no máximo. Se o portal mudar, refazer os testes e corrigir este arquivo.

Legenda: **confirmado** = vi a resposta real; **não verificado** = suposição ou algo que não testei.

## Resumo

- Base: `https://diariooficial.saoluis.ma.gov.br`. Sem login para os endpoints `/api/portal/*`; o `/api/editions` (sem `portal`) responde 401 e não foi usado.
- Edições até **02/10/2026** (nº 232). Em jul–set de 2026: **75 edições**, 3.951 páginas, 82 MB de PDF, ~17 milhões de caracteres de texto (16,9 M extraídos com o `unpdf`; o `pdftotext -layout` dá 24 M porque enche de espaços de alinhamento).
- Há dois "mundos" de edições, e eles se comportam de forma diferente (próxima seção).
- O PDF é a fonte confiável: tem texto de verdade e dá para extrair página por página (`unpdf` devolve uma lista por página; o `pdftotext` usa `\f`).

## Os dois mundos: `digital` e `legacy`

|                              | `digital` (sistema novo)                    | `legacy` (acervo)                              |
| ---------------------------- | ------------------------------------------- | ---------------------------------------------- |
| Desde                        | 01/10/2026 (nº 231); só 2 edições até agora | 1980 até 30/09/2026                            |
| Em jul–set/2026              | 0                                           | 75                                             |
| Matérias (atos já separados) | sim, com tipo e secretaria                  | **não** (`matters` devolve lista vazia)        |
| Texto pronto (`/txt`)        | sim, sem página                             | **não** (404)                                  |
| PDF                          | `/api/editions/{id}/pdf`                    | caminho direto em `/uploads/Digitalizados/...` |

Consequência: para jul–set só dá para contar com o PDF. As matérias servem de gabarito apenas nas edições 231 e 232 (121 matérias no total, segundo `/api/portal/stats`).

Os `id` dos dois mundos são independentes: `/api/portal/editions/134` é a edição digital 232; o id legado 14789 (edição 230 Extra) dá 404 nesse endpoint.

## Endpoints

### Listar edições por período (o principal)

`GET /api/portal/editions/unified-search` (confirmado)

| Parâmetro                | Efeito observado                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start_date`, `end_date` | `YYYY-MM-DD`, inclusivos. Data inicial maior que a final: **400** com mensagem em português.                                                            |
| `limit`                  | Máximo **200** (1000 vira 200). `0` ou ausente: 21.                                                                                                     |
| `page`                   | Confirmado: com `limit=25`, as páginas 1 a 3 trouxeram 75 ids únicos, sem repetição; `page=4` e `page=99` devolvem lista vazia (200, sem erro).         |
| `year`                   | Combina com as datas (`year=2025` + datas de 2026 = 0 resultados).                                                                                      |
| `sort`                   | `date_asc`, `date_desc`, `relevance` e um valor inválido deram **a mesma ordem** (mais recente primeiro). Não confie em `sort`; ordene no nosso código. |
| `q`                      | Busca por texto. `q=merenda` em jul–set voltou 0; **não verificado** o que ele pesquisa (nome ou conteúdo).                                             |

Resposta: `{ editions, count, total, page, page_size, total_pages, search_cache_key }`. Cada edição **legacy** tem:

```json
{
  "id": 14789,
  "nome": "Diário Oficial - Edição nº 230/XLVI Extra",
  "data": "2026-09-30T00:00:00.000Z",
  "file_url": "/uploads/Digitalizados/2026/diario-oficial-edicao-n-230-xlvi.pdf",
  "pdf_download_url": "(igual a file_url)",
  "opcao_ocr": "pdf_unico",
  "ocr_status": "done",
  "ocr_length": 44534,
  "source": "legacy"
}
```

Campos de OCR (`ocr_*`, `match_*`) parecem do mecanismo de busca do próprio portal; **não verificado** o significado. `opcao_ocr` veio `pdf_unico` em 30 edições e `pendente` em 45, e o texto dos PDFs foi igual de bom nos dois casos.

### Listar edições recentes

`GET /api/portal/editions?limit=8` (confirmado). Os dois primeiros itens eram digitais (ids 134 e 131); os outros não inspecionei. Campos: `edition_number`, `edition_date`, `matter_count`, `pdf_download_url`, `txt_download_url`, `csv_download_url`, `portal_url`, `is_supplemental`.

`GET /api/portal/editions/archive?limit=200` (confirmado): 10.264 edições no total (52 páginas de 200), mistura os dois mundos, mais recente primeiro. Campos próprios: `edition_date`, `edition_number`, `portal_url`, `published_at`, `year`.

### Uma edição digital

- `GET /api/portal/editions/{id}`: `{ edition, matters, category_summary, count, total_count, pagination }`. Só traz 20 matérias por vez (`total_count` 45).
- `GET /api/portal/editions/{id}/matters`: todas as matérias de uma vez (76 na edição 231). Campos: `id`, `title`, `content` (HTML com estilos inline, pesado: 880 KB para 45 matérias), `matter_type`, `matter_type_name`, `secretaria`, `secretaria_acronym`, `secretaria_name`, `status`, `summary`, `created_at`. **Sem página.**
- `GET /api/portal/editions/{id}/txt`: texto simples com cabeçalho (total de publicações e categorias). **Sem quebra de página.**
- `/csv`: existe na listagem, **não testado**.

### Auxiliares (confirmado, só leitura)

- `/api/portal/stats`: `{ total_editions: 2, total_matters: 121, this_month: 2 }`. Conta só o mundo digital.
- `/api/portal/filters`: anos, tipos de ato (`all_types`) e secretarias (`all_secretarias`, 39).

### Não usados de propósito

`/api/portal/log-search` (registra buscas no servidor deles), `/api/editions` (exige login), qualquer POST.

## O PDF

Medido nas 75 edições de jul–set (todas baixaram com 200):

- Todas com texto extraível: mínimo de 2.806 caracteres por página, nenhuma imagem escaneada.
- Páginas por edição: de 4 a 158, mediana 50. Tamanho total 82 MB.
- Produtor `BRySignerPDF` (assinado digitalmente) nas legacy; `jsPDF` na digital 232.
- O `pdftotext` termina cada página com `\f`, inclusive a última. Ao dividir pelo `\f`, sobra um item vazio no fim (a edição de 9 páginas dá 10 itens).
- **Primeira comparação de extratores (8 edições, 520 itens do índice):** `pdftotext -layout` achou o título na página certa em 503 e perdeu 17; `pdftotext` sem `-layout` e `unpdf` acharam 520. O `-layout` junta as duas colunas na mesma linha. Essa comparação só olhava os títulos do índice e **não enxergava o corte no fim das linhas do corpo** (veja "Qualidade do texto" abaixo), então não serve de base para escolher o extrator.
- **Rodapé de cada página (3.951 de 3.951, extras incluídas):** cabeçalho do jornal (`SÃO LUÍS/MA * DIA * DATA   ANO XLVI * N.º 037 * ISSN ...`, com `* EDIÇÃO EXTRA *` nas extras) e nota de assinatura digital, que traz `N / M` (página / total). Esse `N / M` bate com a posição real da página e com o total em todas as páginas. No `pdftotext -raw` são 5 linhas (`SÃO LUÍS/MA ...`, `Este documento pode ser verificado ...`, `https://... N / M`, `Documento assinado ...`, `conforme ... TCE/MA.`); no `unpdf` eram 4. Ele fica no **fim** da página; a versão anterior deste arquivo dizia que "atravessa o texto", o que estava errado. Na última página o carimbo `Assinado digitalmente por ...` vem depois. Atos que citam edições antigas repetem o cabeçalho no meio do texto (14 páginas), então só o bloco que fecha a página pode ser removido.
- **Índice com número de página:** toda edição abre com um índice de 1 a 4 páginas; nas extras são só 3 ou 4 linhas. No `pdftotext -raw` cada item ocupa duas linhas, `TÍTULO DO ATO 23` e, embaixo, uma linha só de pontos (no `unpdf` vinha `TÍTULO 23.....`); um título longo pode ocupar mais de uma linha antes dos pontos. São 5.963 itens: uns 850 cabeçalhos de secretaria ou órgão e uns 5.100 atos. Procurando cada título, palavra por palavra, na página indicada (±1): **5.960 (99,95%) achados** com o `-raw`; com o `unpdf` eram 5.943, porque parte das falhas era texto cortado. Os 3 que faltam, sem causa investigada: o cabeçalho `SECRETARIA MUNICIPAL DA CRIANÇA E ASSISTÊNCIA SOCIAL - SEMCAS` (edição 1bc6820b), `TERMO DE APOSTILAMENTO AO CONTRATO N.º 52/2023-GAB/SEMIT` (edição 157) e uma `PORTARIA CONJUNTA` (edição 162).
- **Estrutura de um ato:** cabeçalho de seção opcional (`SECRETARIA MUNICIPAL DE ... - SIGLA`), título idêntico ao do índice, corpo e, no fim, `Publicado por: <nome>` e `Código identificador: <uuid>`. Com o `-raw`, 5.062 de 5.069 atos (99,9%) têm exatamente um código; isso também mostra que a ordem de leitura está íntegra. Itens do índice sem código e sem nenhum texto além do título (uns 890) são cabeçalhos de secretaria ou órgão, e é assim que o segmentador os reconhece, sem lista de nomes. O índice tem dois marcadores de órgão, `ÍNDICE - PREFEITURA MUNICIPAL DE SÃO LUÍS` (75, um por edição) e `ÍNDICE - PUBLICAÇÕES DE TERCEIROS` (34); no corpo eles aparecem sem o prefixo `ÍNDICE - `.
  - **Créditos da edição:** a última página de toda edição (75 de 75) traz um bloco que começa com `EXPEDIENTE` / `PREFEITURA DE SÃO LUÍS` (órgão, Imprensa Oficial, nomes, endereço), uma única vez. Sem cortá-lo ele grudava no último ato. O endereço sozinho **não** serve de marcador: editais o citam como local de entrega.
  - **Cabeçalho e título na mesma linha:** na edição 167, página 17, o texto traz `SECRETARIA MUNICIPAL DA FAZENDA - SEMFAZ ACÓRDÃO Nº 25/2026` numa linha só.
  - **Título citado dentro de um ato:** na edição 226, uma portaria diz `lotada na` e, na linha seguinte, `SECRETARIA MUNICIPAL DE SAÚDE - SEMUS, após cumprimento...`. Procurar o título solto cortava o ato no lugar errado e trocava a secretaria dos atos seguintes. Um título só vale se começa a linha (ou o título anterior) e a termina (ou precede o próximo título do índice).
  - **Resultado nas 75 edições:** 5.071 atos, todos com secretaria (34 distintas); 71 edições sem nenhum problema e 5 problemas em 4 edições: título não achado em 157 (`TERMO DE APOSTILAMENTO ...`), 162 (`PORTARIA CONJUNTA ...`) e 172 (o cabeçalho `SEMCAS`); ato sem código e ato com dois códigos na 167 (`EDITAL DE ABERTURA Nº 002/2024` e `EDITAL Nº 002/2024`). Quando um título não é achado, o texto dele cai no item vizinho: nas edições 157 e 162 o ato fica com o nome do cabeçalho da secretaria como título, e na 172 os atos seguintes herdam a secretaria anterior. Por isso a edição com problema precisa ser tratada como suspeita.
- **Tipos de ato:** 147 prefixos de título diferentes. Os mais comuns (aproximado): Portaria ~2.300 (com SEMAD), Extrato ~770, Nomeação ~500, Decreto ~230, Ata ~130, Termo ~130, Exoneração ~130. Nomeação e Exoneração (~12% dos atos) não têm número.
- **Tamanho dos atos** (5.071 atos, medido com o `-raw`): mediana 1.470 caracteres, percentil 90 de 4.579, percentil 99 de 25.116, máximo 137.912 (um edital único de 78 páginas), mínimo 148. 14,9% passam de 3.000 caracteres (754) e 31,4% ficam abaixo de 1.000 (1.590); 255 passam de 10.000. 37,2% (1.887) têm texto em mais de uma página. Pela regra da D4 (3.200 caracteres, 400 de sobreposição) saem ~7.822 trechos; com 2.000 e 250 seriam ~10.168. Em caracteres, não em tokens.
- **Qualidade do texto por extrator** (medido em 05/10/2026 nas 3.876 páginas que não são a última de cada edição, comparando `unpdf`, `pdftotext` (modo padrão e `-raw`) e PyMuPDF como árbitro):
  - O `unpdf` **perde o fim de algumas linhas**: `Contratos` sai `Con`, `Municipal` sai `Mun`, `Lei n°` sai `Lei n`. São 5.256 palavras cortadas e 12,5 mil caracteres (0,21% das palavras). O `pdf.js` 6.4.299, mais novo que o embutido no `unpdf` (6.1.200), corta do mesmo jeito, então não é questão de versão. A página desenhada mostra a palavra inteira.
  - O `unpdf` também cola palavras onde a fonte muda (`servidorJORDACH`, `LUÍS,no`): ~8,4 mil casos, dos quais ~1,4 mil só com minúsculas (`osubitem`), que nenhuma regra separa com segurança.
  - Nos tokens em que `unpdf` e `pdftotext` discordam, o PyMuPDF também tem 15,7% dos que só o `unpdf` produz e 97,4% dos que só o `pdftotext` produz: o `unpdf` é o que destoa.
  - **Distância de cada extrator para o PyMuPDF**, somando tokens a mais e tokens que faltam nas mesmas páginas: `unpdf` 38.182; `pdftotext` padrão 2.928; **`pdftotext -raw` 57**, em 2,4 milhões de tokens. O modo padrão espalha o cabeçalho no topo da página e remove o hífen de palavras quebradas no fim da linha (`lavra-se` vira `lavrase`); o `-raw` mantém a ordem do arquivo e não remove hífens. Por isso o extrator escolhido é `pdftotext -raw`.
  - O `-raw` devolve ligaduras (`Oﬁcial`, 40 mil `ﬁ`, mais `ﬀ`, `ﬂ` e `ﬃ`), 17 espaços de largura zero e ~130 símbolos de lista de fontes privadas (U+F0B7 e outros). O NFKC inteiro não serve para as ligaduras, porque também troca `º` por `o`; `normalizeGlyphs` troca só elas e trata os outros dois.
  - A última página de cada edição tem um carimbo de assinatura digital ("Assinado digitalmente por ...") que só o `pdftotext` lê.
  - Páginas de duas colunas: **não verificado** no corpus todo; nas páginas que li era coluna única.
- O caminho do PDF varia: `/uploads/Digitalizados/2026/diario-oficial-edicao-n-230-xlvi.pdf`, `.../edicao-n-199-xlvi.pdf` e até caminhos com nome aleatório (`/uploads/Digitalizados/diario_oficial/31566/4mIS2YEaK5f...pdf`). Não montar o caminho; usar `file_url`. As 75 URLs de jul–set são únicas.
- O campo `nome` tem seis formatos: `Diário Oficial - Edição nº N/XLVI` (25), `diario_oficial_N_XLVI.pdf` (33), `Edição nº N/XLVI` (7), `... Extra` com e sem prefixo (5 + 3) e `... - Extra.pdf` (1). O portal os padroniza na tela, e o nosso cliente faz o mesmo (`normalizeTitle`).
- O número das edições vai de 156 a 230 em jul–set, sem lacunas. Edições extras têm número próprio (9 delas) e podem cair na mesma data de outra (13 datas repetidas). Por isso a data sozinha não identifica a edição.

## Querido Diário (plano B, não usado)

São Luís (2111300) está lá, com `https://api.queridodiario.org.br`, mas a coleta termina em **11/05/2026** e o `.txt` também não separa páginas. A documentação oficial ainda cita o domínio antigo `api.queridodiario.ok.org.br`, que falhou no handshake TLS aqui. Serve para conferir o conteúdo de fev–mai, nada além disso.

## Pendências e riscos

- **Termos de uso: não verificado.** Não há `robots.txt` (404) nem página de termos. Decisão do usuário: não entrar em contato com o portal. Mantemos o uso leve (uma chamada por segundo, `User-Agent` identificado, só GET, só os endpoints públicos que o site usa).
- API sem contrato: pode mudar sem aviso. Se a ingestão quebrar, refazer os testes acima.
- Não sei se o acervo legacy de jul–set recebe correções depois (edições substituídas). Para a ingestão, o `contentHash` do PDF do plano cobre isso.
- Não testei o rate limit real do servidor. A ingestão de jul–set fez 76 requisições em 75 s (uma por segundo) e não houve nenhum erro; baixar a mesma edição duas vezes deu bytes idênticos nas 75.
- `pdftotext` (Poppler): a lista de programas da imagem `ubuntu-24.04` do GitHub Actions (versão 20260927) **não o cita**; não sei se a lista é completa. O `pdftotext` é o extrator do chunking: o `pnpm chunk` roda no computador do usuário (`brew install poppler`) e o CI instala `poppler-utils` com `apt-get` (**não verificado** até o primeiro push). Na Vercel não é necessário. O `unpdf` continua só na contagem de páginas da ingestão.

## Espaço no banco (medido em Postgres 17 + pgvector 0.8 de teste, 6.437 trechos de ~2.500 caracteres)

| Item                                            | MB       |
| ----------------------------------------------- | -------- |
| Texto bruto (UTF-8)                             | 16,6     |
| Texto guardado (o Postgres comprime sozinho)    | 11,3     |
| Coluna `tsvector` guardada + índice GIN         | 18 + 8,4 |
| Texto + `tsvector` + GIN, total                 | 39,4     |
| Vetor 384 dimensões + HNSW                      | 23,3     |
| Vetor 768 dimensões + HNSW                      | 51,9     |
| Vetor 1024 dimensões + HNSW                     | 85,4     |
| Vetor `halfvec` 768 (2 bytes por número) + HNSW | 23,3     |

Vetores medidos com números aleatórios (o tamanho do índice não depende dos valores, mas a qualidade da busca com `halfvec` **não foi medida**). Se os trechos forem menores que 2.500 caracteres, o número de vetores sobe na mesma proporção. Limite do Neon Free: 1 GB por projeto (página de planos, sem data; **não verificado** como o Neon conta histórico e ramos).
