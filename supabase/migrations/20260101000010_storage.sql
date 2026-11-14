-- =============================================================================
-- GB Eggs ERP — 0010 Storage bucket for the company logo
-- Public read (logos appear on printed invoices); only users with
-- settings:edit may upload, replace or delete files.
-- =============================================================================
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('branding', 'branding', true, 2097152, array['image/png','image/jpeg','image/webp','image/svg+xml'])
    on conflict (id) do nothing;

    execute $p$create policy "branding_read" on storage.objects for select using (bucket_id = 'branding')$p$;
    execute $p$create policy "branding_insert" on storage.objects for insert to authenticated
      with check (bucket_id = 'branding' and public.has_perm('settings', 'edit'))$p$;
    execute $p$create policy "branding_update" on storage.objects for update to authenticated
      using (bucket_id = 'branding' and public.has_perm('settings', 'edit'))$p$;
    execute $p$create policy "branding_delete" on storage.objects for delete to authenticated
      using (bucket_id = 'branding' and public.has_perm('settings', 'edit'))$p$;
  end if;
end;
$$;
