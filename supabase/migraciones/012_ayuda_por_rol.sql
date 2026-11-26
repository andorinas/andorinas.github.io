-- ControlAr · 012 · Ayuda por rol: videos e instructivo en un almacén privado (re-ejecutable)
--
-- Antes estaban en la página pública /ayuda y cualquiera veía todo. Ahora viven en el bucket privado 'ayuda',
-- organizados por carpeta, y cada usuario sólo puede abrir lo de su perfil (con enlaces temporales):
--   empresa/   → administradores y encargados (video de la empresa, obra de punta a punta, instructivo PDF)
--   gremios/   → gremios (y la empresa)
--   clientes/  → clientes (y la empresa)
-- Sólo el administrador sube, reemplaza o borra archivos.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ayuda', 'ayuda', false, 52428800, array['video/mp4', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ¿Puede el usuario actual abrir este archivo de ayuda? Depende de la carpeta y de su rol.
create or replace function public.puede_ver_ayuda(p_ruta text) returns boolean
language sql stable security definer set search_path = public as $$
  select case split_part(coalesce(p_ruta, ''), '/', 1)
    when 'empresa'  then public.es_usuario_activo()
    when 'gremios'  then public.es_usuario_activo() or public.es_gremio()
    when 'clientes' then public.es_usuario_activo() or public.es_cliente()
    else false end;
$$;

drop policy if exists controlar_ayuda_leer on storage.objects;
drop policy if exists controlar_ayuda_subir on storage.objects;
drop policy if exists controlar_ayuda_reemplazar on storage.objects;
drop policy if exists controlar_ayuda_borrar on storage.objects;
create policy controlar_ayuda_leer on storage.objects for select to authenticated
  using (bucket_id = 'ayuda' and public.puede_ver_ayuda(name));
create policy controlar_ayuda_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'ayuda' and public.es_admin() and split_part(name, '/', 1) in ('empresa', 'gremios', 'clientes'));
create policy controlar_ayuda_reemplazar on storage.objects for update to authenticated
  using (bucket_id = 'ayuda' and public.es_admin())
  with check (bucket_id = 'ayuda' and public.es_admin() and split_part(name, '/', 1) in ('empresa', 'gremios', 'clientes'));
create policy controlar_ayuda_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'ayuda' and public.es_admin());

revoke execute on function public.puede_ver_ayuda(text) from public, anon;
grant execute on function public.puede_ver_ayuda(text) to authenticated;
