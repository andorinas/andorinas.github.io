-- ControlAr · 004 · Comprobantes y fotos (Supabase Storage)
-- Bucket privado. Ruta obligatoria: obra-<id>/<archivo>. Leer y subir requiere acceso a esa obra.
-- Los archivos no se pueden modificar ni borrar desde la app.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('adjuntos', 'adjuntos', false, 15728640,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public._obra_de_ruta(p_ruta text) returns bigint language sql immutable as $$
  select (substring(p_ruta from '^obra-(\d+)/'))::bigint;
$$;

drop policy if exists controlar_adjuntos_leer on storage.objects;
drop policy if exists controlar_adjuntos_subir on storage.objects;
create policy controlar_adjuntos_leer on storage.objects for select to authenticated
  using (bucket_id = 'adjuntos' and public.puede_ver_obra(public._obra_de_ruta(name)));
create policy controlar_adjuntos_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'adjuntos' and public.puede_ver_obra(public._obra_de_ruta(name)));

-- Registra el adjunto ya subido (verifica que el archivo exista en el bucket y sea de esa obra).
create or replace function public.registrar_adjunto(p_obra bigint, p_ruta text, p_nombre text, p_mime text, p_tamano bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  perform _exigir_obra(p_obra);
  if _obra_de_ruta(p_ruta) is distinct from p_obra then perform _error('Ruta de adjunto inválida'); end if;
  if not exists (select 1 from storage.objects where bucket_id = 'adjuntos' and name = p_ruta) then perform _error('El archivo no se subió'); end if;
  if p_mime not in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf') then perform _error('Formato no admitido'); end if;
  insert into adjuntos (obra_id, ruta, nombre, mime, tamano, subido_por)
  values (p_obra, p_ruta, left(coalesce(nullif(trim(p_nombre), ''), 'archivo'), 200), p_mime, p_tamano, auth.uid())
  on conflict (ruta) do update set nombre = excluded.nombre
  returning id into v_id;
  return v_id;
end $$;

-- Sólo el administrador puede borrar comprobantes (al eliminar una obra completa).
drop policy if exists controlar_adjuntos_borrar on storage.objects;
create policy controlar_adjuntos_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'adjuntos' and public.es_admin());
