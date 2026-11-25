-- ControlAr · 010 · Correcciones de la auditoría de QA del 25/11/2026 (re-ejecutable)
--
--  QA-02  directorio(): clientes y gremios sólo ven nombres de la empresa (y el cliente, de los otros clientes de SU obra).
--  QA-03  Un gremio al que se le quitan los rubros de una obra deja de ver y responder sus reclamos y fotos.
--  QA-04  registrar_adjunto no permite tomar ni renombrar un archivo que subió otra persona.
--  QA-05  Fechas de gastos, pagos, avances, partes, novedades y fotos: no posteriores a hoy ni más de un año
--         anteriores al inicio de la obra (control central por trigger, vale para toda forma de alta o edición).

-- ── QA-02 · Directorio de nombres según rol ────────────────────────────────
create or replace function public.directorio() returns table (id uuid, nombre text)
language sql stable security definer set search_path = public as $$
  -- La empresa (administrador / encargado) ve a todos.
  select p.id, p.nombre from perfiles p
  where public.es_usuario_activo() and p.rol in ('admin', 'encargado', 'gremio', 'cliente')
  union
  -- Gremios y clientes: el personal de la empresa y ellos mismos.
  select p.id, p.nombre from perfiles p
  where (public.es_gremio() or public.es_cliente()) and (p.rol in ('admin', 'encargado') or p.id = auth.uid())
  union
  -- Cliente: los otros clientes de sus mismas obras (p. ej. dos dueños de la misma casa).
  select p.id, p.nombre from perfiles p
  where public.es_cliente() and p.rol = 'cliente' and exists (
    select 1 from obra_clientes a join obra_clientes b on b.obra_id = a.obra_id
    where a.usuario_id = auth.uid() and b.usuario_id = p.id);
$$;

-- ── QA-03 · El gremio sólo ve reclamos y fotos de obras donde sigue asignado ─
create or replace function public.ve_reclamo(p_reclamo bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from reclamos r where r.id = p_reclamo
    and (public.puede_ver_obra(r.obra_id)
         or (public.es_gremio() and r.gremio_id = auth.uid() and public.gremio_en_obra(r.obra_id))
         or (public.es_cliente() and r.cliente_id = auth.uid() and public.cliente_en_obra(r.obra_id))));
$$;

create or replace function public.ve_foto(p_foto bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from fotos f left join partes_avance pa on pa.id = f.parte_id
    left join novedades n on n.id = f.novedad_id where f.id = p_foto
    and (public.puede_ver_obra(f.obra_id)
         or (public.es_gremio() and public.gremio_en_obra(f.obra_id) and (f.creado_por = auth.uid() or pa.creado_por = auth.uid()
             or (f.reclamo_id is not null and public.ve_reclamo(f.reclamo_id))))
         or (public.es_cliente() and (
             (public.cliente_en_obra(f.obra_id) and f.visible_cliente and (n.id is null or (n.visible_cliente and not n.anulada)))
             or (f.reclamo_id is not null and public.ve_reclamo(f.reclamo_id))))));
$$;

-- ── QA-04 · Un adjunto sólo lo registra (o renombra) quien lo subió ─────────
create or replace function public.registrar_adjunto(p_obra bigint, p_ruta text, p_nombre text, p_mime text, p_tamano bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not (puede_ver_obra(p_obra) or gremio_en_obra(p_obra) or cliente_en_obra(p_obra)) then perform _error('No tenés acceso a esta obra o no existe'); end if;
  if _obra_de_ruta(p_ruta) is distinct from p_obra then perform _error('Ruta de adjunto inválida'); end if;
  if not exists (select 1 from storage.objects where bucket_id = 'adjuntos' and name = p_ruta) then perform _error('El archivo no se subió'); end if;
  if exists (select 1 from adjuntos where ruta = p_ruta and subido_por is distinct from auth.uid()) then perform _error('Ruta de adjunto inválida'); end if;
  if p_mime not in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf') then perform _error('Formato no admitido'); end if;
  if es_cliente() and p_mime not like 'image/%' then perform _error('Sólo se admiten fotos (JPG, PNG, WEBP, HEIC)'); end if;
  insert into adjuntos (obra_id, ruta, nombre, mime, tamano, subido_por)
  values (p_obra, p_ruta, left(coalesce(nullif(trim(p_nombre), ''), 'archivo'), 200), p_mime, p_tamano, auth.uid())
  on conflict (ruta) do update set nombre = excluded.nombre
  returning id into v_id;
  return v_id;
end $$;

-- ── QA-05 · Fechas razonables en los registros de obra ─────────────────────
create or replace function public._validar_fecha_registro() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_inicio date; v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_campo text := coalesce(TG_ARGV[0], 'Fecha');
begin
  -- Editar otros datos de un registro viejo no exige revalidar su fecha.
  if TG_OP = 'UPDATE' and new.fecha is not distinct from old.fecha then return new; end if;
  if new.fecha > v_hoy then perform _error(v_campo || ': no puede ser posterior a hoy'); end if;
  select fecha_inicio into v_inicio from obras where id = new.obra_id;
  if v_inicio is not null and new.fecha < v_inicio - 365 then
    perform _error(v_campo || ': es más de un año anterior al inicio de la obra (' || to_char(v_inicio, 'DD/MM/YYYY') || ')');
  end if;
  return new;
end $$;
revoke execute on function public._validar_fecha_registro() from public, anon, authenticated;

drop trigger if exists fecha_valida on public.compromisos;
create trigger fecha_valida before insert or update of fecha on public.compromisos
  for each row execute function public._validar_fecha_registro('Fecha del gasto');
drop trigger if exists fecha_valida on public.pagos;
create trigger fecha_valida before insert or update of fecha on public.pagos
  for each row execute function public._validar_fecha_registro('Fecha del pago');
drop trigger if exists fecha_valida on public.avances;
create trigger fecha_valida before insert or update of fecha on public.avances
  for each row execute function public._validar_fecha_registro('Fecha del avance');
drop trigger if exists fecha_valida on public.partes_avance;
create trigger fecha_valida before insert or update of fecha on public.partes_avance
  for each row execute function public._validar_fecha_registro('Fecha del parte');
drop trigger if exists fecha_valida on public.novedades;
create trigger fecha_valida before insert or update of fecha on public.novedades
  for each row execute function public._validar_fecha_registro('Fecha de la novedad');
drop trigger if exists fecha_valida on public.fotos;
create trigger fecha_valida before insert or update of fecha on public.fotos
  for each row execute function public._validar_fecha_registro('Fecha de la foto');

-- ── Permisos de ejecución (mismos que antes) ───────────────────────────────
revoke execute on function public.directorio(), public.ve_reclamo(bigint), public.ve_foto(bigint),
  public.registrar_adjunto(bigint, text, text, text, bigint) from public, anon;
grant execute on function public.directorio(), public.ve_reclamo(bigint), public.ve_foto(bigint),
  public.registrar_adjunto(bigint, text, text, text, bigint) to authenticated;
