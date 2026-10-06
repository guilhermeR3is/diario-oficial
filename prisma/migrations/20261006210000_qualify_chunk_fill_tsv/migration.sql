-- pg_dump e pg_restore rodam com search_path vazio, e o trigger não achava a função sem o esquema
CREATE OR REPLACE FUNCTION chunk_fill_tsv() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.tsv := to_tsvector('portuguese', public.normalize_act_numbers(NEW.text));
  RETURN NEW;
END
$$;
