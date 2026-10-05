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
- `pdftotext -layout` separa as páginas por `\f`. Ao dividir pelo `\f`, sobra um item vazio no fim (a edição de 9 páginas dá 10 itens).
- **Extrator (testado em 8 edições, 520 itens do índice):** `pdftotext -layout` achou o título na página certa em 503 e perdeu 17; `pdftotext` sem `-layout` e `unpdf` acharam 520 (todos). O `-layout` junta as duas colunas na mesma linha. Na página 3 da edição 230, o `unpdf` leu a coluna da esquerda inteira antes da direita e o `pdftotext` intercalou blocos (uma página só; não é prova geral). Tempo: ~2 s para as 8 edições nos dois; `unpdf` é JavaScript puro (sem programa externo).
- Cada página tem um cabeçalho com `SÃO LUÍS/MA * DIA * DATA   ANO XLVI * N.º 037 * ISSN ...`, que atravessa o texto e precisa sair dos trechos.
- **Índice com número de página:** as edições abrem com um índice (`TÍTULO DO ATO ..... 23`). Num teste rápido em 8 edições, o título apareceu na página indicada em 529 de 558 itens (95%). As falhas são em parte a própria linha "ÍNDICE" e títulos com formatação diferente. É o candidato a gabarito para o segmentador (Fase 3).
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
- `pdftotext` (Poppler): a lista de programas da imagem `ubuntu-24.04` do GitHub Actions (versão 20260927) **não o cita**; não sei se a lista é completa. Na Vercel não é necessário, porque a ingestão roda no computador do usuário. Usando `unpdf` o problema some.

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
