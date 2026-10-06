-- O Postgres parte "1.746/2026" em dois tokens e lê "Nº", "N.º" e "N°" de formas diferentes; a mesma função roda no trecho e na pergunta.
CREATE FUNCTION normalize_act_numbers(input text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $$
  SELECT regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(input, '\m[Nn]\s?[.º°]{1,2}\s?(?=\d)', '', 'g'),
        '(\d)\.(?=\d+/\d{4})', '\1', 'g'),
      '(^|\D)0+(\d+/\d{4})', '\1\2', 'g'),
    '(\d+)/(\d{4})', '\1.\2', 'g')
$$;

-- AlterTable
ALTER TABLE "chunk" ADD COLUMN     "tsv" tsvector;

-- Coluna comum preenchida por trigger: uma coluna gerada faz o Prisma propor DROP DEFAULT, que o Postgres recusa
CREATE FUNCTION chunk_fill_tsv() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.tsv := to_tsvector('portuguese', normalize_act_numbers(NEW.text));
  RETURN NEW;
END
$$;

CREATE TRIGGER chunk_fill_tsv
BEFORE INSERT OR UPDATE OF "text" ON "chunk"
FOR EACH ROW EXECUTE FUNCTION chunk_fill_tsv();

UPDATE "chunk" SET "tsv" = to_tsvector('portuguese', normalize_act_numbers("text"));

-- CreateIndex
CREATE INDEX "chunk_tsv_idx" ON "chunk" USING GIN ("tsv");
