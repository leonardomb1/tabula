-- Extensions the schema depends on; run once at database creation.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS unaccent;

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'pt_unaccent') THEN
		CREATE TEXT SEARCH CONFIGURATION public.pt_unaccent (COPY = portuguese);
		ALTER TEXT SEARCH CONFIGURATION public.pt_unaccent
			ALTER MAPPING FOR hword, hword_part, word WITH unaccent, portuguese_stem;
	END IF;

	IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'en_unaccent') THEN
		CREATE TEXT SEARCH CONFIGURATION public.en_unaccent (COPY = english);
		ALTER TEXT SEARCH CONFIGURATION public.en_unaccent
			ALTER MAPPING FOR hword, hword_part, word WITH unaccent, english_stem;
	END IF;
END
$$;
