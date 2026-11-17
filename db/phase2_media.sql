-- Run once for an existing Phase 1 Supabase project; safe to repeat.
-- Add font MIME types without replacing existing restrictions, limits or visibility.
update storage.buckets
set allowed_mime_types = array(
  select distinct mime from unnest(allowed_mime_types || array['font/ttf','font/otf']) as mime
)
where id = 'marketing-media' and allowed_mime_types is not null;
-- A NULL list already allows all types and is intentionally left unchanged.
