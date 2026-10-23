-- DA Ranch Vineyard App
-- 4 of 5. Private bucket for spray photos and recommendation screenshots.
-- Files are stored as {vineyard_id}/{spray_id}/{file}.
-- The bucket is private. A signed link is created at export time.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'spray-photos',
  'spray-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Upsert needs select, insert, and update. Delete lets a manager remove a bad photo.
drop policy if exists spray_photos_select on storage.objects;
create policy spray_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'spray-photos'
    and (select private.is_member(((storage.foldername(name))[1])::uuid))
  );

drop policy if exists spray_photos_insert on storage.objects;
create policy spray_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'spray-photos'
    and (select private.is_member(((storage.foldername(name))[1])::uuid))
  );

drop policy if exists spray_photos_update on storage.objects;
create policy spray_photos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'spray-photos'
    and (select private.is_member(((storage.foldername(name))[1])::uuid))
  )
  with check (
    bucket_id = 'spray-photos'
    and (select private.is_member(((storage.foldername(name))[1])::uuid))
  );

drop policy if exists spray_photos_delete on storage.objects;
create policy spray_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'spray-photos'
    and (
      (select private.is_manager(((storage.foldername(name))[1])::uuid))
      or (select private.is_developer(((storage.foldername(name))[1])::uuid))
    )
  );
