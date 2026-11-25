-- ControlAr · 011 · Correcciones menores de la auditoría de QA del 25/11/2026 (re-ejecutable)
--
--  S-05  crear_documento no acepta archivos que ya son comprobantes de gastos/pagos/avances ni fotos.
--  S-06  Un registro ya anulado no se puede volver a anular (antes se pisaba el motivo original).
--  B2    Un gremio no puede mandar partes de un rubro desactivado.
--  B3    Partes y reclamos reenviados con la misma clave pero con otros datos se rechazan (como gastos y pagos).

-- ── S-05 · Documentos: sólo archivos que no son comprobantes ni fotos ───────
create or replace function public.crear_documento(p_obra bigint, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_adj bigint := nullif(p ->> 'adjunto_id', '')::bigint; v_cat text := coalesce(nullif(p ->> 'categoria', ''), 'otro');
begin
  if not puede_ver_obra(p_obra) then perform _error('No tenés acceso a esta obra o no existe'); end if;
  if v_adj is null or not exists (select 1 from adjuntos where id = v_adj and obra_id = p_obra) then perform _error('Subí el archivo del documento'); end if;
  if exists (select 1 from compromisos where adjunto_id = v_adj) or exists (select 1 from pagos where adjunto_id = v_adj)
     or exists (select 1 from avances where adjunto_id = v_adj) or exists (select 1 from fotos where adjunto_id = v_adj)
     or exists (select 1 from documentos where adjunto_id = v_adj and not anulado) then
    perform _error('Ese archivo ya está cargado como comprobante, foto o documento. Subilo de nuevo como documento.');
  end if;
  if v_cat not in ('plano', 'contrato', 'permiso', 'memoria', 'certificado', 'garantia', 'otro') then perform _error('Tipo de documento inválido'); end if;
  insert into documentos (obra_id, adjunto_id, titulo, categoria, visible_cliente, creado_por)
  values (p_obra, v_adj, _texto(p, 'titulo', 'Título', 150), v_cat, coalesce((p ->> 'visible_cliente')::boolean, true), auth.uid())
  returning id into v_id;
  perform _auditar(p_obra, 'documento', v_id, 'alta', null, p);
  return jsonb_build_object('id', v_id);
end $$;

-- ── S-06 · No re-anular ─────────────────────────────────────────────────────
-- Gastos, pagos y avances: el trigger impide cambiar el motivo de algo ya anulado (otras actualizaciones,
-- como recalcular la cotización, siguen permitidas).
create or replace function public._no_reanular() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.anulado and new.anulado and new.anulado_motivo is distinct from old.anulado_motivo then
    perform _error('Ese registro ya estaba anulado');
  end if;
  return new;
end $$;
revoke execute on function public._no_reanular() from public, anon, authenticated;
drop trigger if exists no_reanular on public.compromisos;
create trigger no_reanular before update of anulado_motivo on public.compromisos for each row execute function public._no_reanular();
drop trigger if exists no_reanular on public.pagos;
create trigger no_reanular before update of anulado_motivo on public.pagos for each row execute function public._no_reanular();
drop trigger if exists no_reanular on public.avances;
create trigger no_reanular before update of anulado_motivo on public.avances for each row execute function public._no_reanular();

create or replace function public.anular_novedad(p_id bigint, p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
declare n novedades;
begin
  select * into n from novedades where id = p_id;
  if not found or not puede_ver_obra(n.obra_id) then perform _error('Novedad inexistente o sin acceso'); end if;
  if n.anulada then perform _error('Esa novedad ya estaba quitada'); end if;
  update novedades set anulada = true where id = p_id;
  perform _auditar(n.obra_id, 'novedad', p_id, 'anulacion', null, null, left(nullif(trim(p_motivo), ''), 500));
end $$;

create or replace function public.anular_documento(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare d documentos;
begin
  select * into d from documentos where id = p_id;
  if not found or not puede_ver_obra(d.obra_id) then perform _error('Documento inexistente o sin acceso'); end if;
  if d.anulado then perform _error('Ese documento ya estaba quitado'); end if;
  update documentos set anulado = true where id = p_id;
  perform _auditar(d.obra_id, 'documento', p_id, 'anulacion');
end $$;

-- ── B2 + B3 · Partes de avance: rubro activo y huella de reenvío ────────────
alter table public.partes_avance add column if not exists clave_hash text;
alter table public.reclamos      add column if not exists clave_hash text;

create or replace function public.crear_parte_avance(p_rubro bigint, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r rubros; v_id bigint; v_pct double precision; v_fecha date; v_clave text := nullif(p ->> 'clave_idem', '');
  v_hash text := md5(p_rubro::text || (p - 'clave_idem')::text);
begin
  select * into r from rubros where id = p_rubro;
  if not found or not gremio_en_rubro(p_rubro) then perform _error('No tenés asignado ese rubro'); end if;
  v_id := _idem_existente('partes_avance', v_clave, v_hash);
  if v_id is not null then return jsonb_build_object('id', v_id, 'duplicado', true); end if;
  if not r.activo then perform _error('Ese rubro está desactivado: consultá con la empresa'); end if;
  v_fecha := _fecha(p ->> 'fecha', 'Fecha');
  begin v_pct := (p ->> 'porcentaje')::double precision; exception when others then v_pct := null; end;
  if v_pct is null or v_pct < 0 or v_pct > 100 then perform _error('El avance debe ser un porcentaje entre 0 y 100'); end if;
  insert into partes_avance (obra_id, rubro_id, fecha, porcentaje, comentario, clave_idem, clave_hash, creado_por)
  values (r.obra_id, p_rubro, v_fecha, v_pct, _texto_opt(p, 'comentario', 1000), v_clave, v_hash, auth.uid())
  returning id into v_id;
  perform _vincular_fotos(r.obra_id, p_rubro, p -> 'fotos', v_fecha, _texto_opt(p, 'comentario', 500), v_id);
  perform _auditar(r.obra_id, 'parte_avance', v_id, 'alta', null, jsonb_build_object('rubro_id', p_rubro, 'porcentaje', v_pct, 'fecha', v_fecha));
  return jsonb_build_object('id', v_id);
end $$;

-- Reclamos y consultas (misma lógica que 008) con huella de reenvío.
create or replace function public.crear_reclamo(p_obra bigint, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_rubro bigint := nullif(p ->> 'rubro_id', '')::bigint; v_dir text; v_gremio uuid; v_cliente uuid; v_id bigint;
  v_clave text := nullif(p ->> 'clave_idem', ''); v_hash text := md5(p_obra::text || (p - 'clave_idem')::text);
begin
  v_id := _idem_existente('reclamos', v_clave, v_hash);
  if v_id is not null then return jsonb_build_object('id', v_id, 'duplicado', true); end if;
  if puede_ver_obra(p_obra) then
    if v_rubro is not null and not exists (select 1 from rubros where id = v_rubro and obra_id = p_obra) then perform _error('El rubro no pertenece a esta obra'); end if;
    if nullif(p ->> 'cliente_id', '') is not null then
      v_dir := 'empresa_a_cliente';
      v_cliente := (p ->> 'cliente_id')::uuid;
      if not exists (select 1 from obra_clientes oc join perfiles pf on pf.id = oc.usuario_id
          where oc.usuario_id = v_cliente and oc.obra_id = p_obra and pf.rol = 'cliente') then
        perform _error('Elegí un cliente de esta obra');
      end if;
    else
      v_dir := 'empresa_a_gremio';
      v_gremio := nullif(p ->> 'gremio_id', '')::uuid;
      if v_gremio is null or not exists (select 1 from gremio_rubros gr join perfiles pf on pf.id = gr.usuario_id
          where gr.usuario_id = v_gremio and gr.obra_id = p_obra and pf.rol = 'gremio') then
        perform _error('Elegí un gremio asignado a esta obra');
      end if;
    end if;
  elsif gremio_en_obra(p_obra) then
    v_dir := 'gremio_a_empresa';
    v_gremio := auth.uid();
    if v_rubro is null or not gremio_en_rubro(v_rubro) then perform _error('Elegí uno de tus rubros'); end if;
  elsif cliente_en_obra(p_obra) then
    v_dir := 'cliente_a_empresa';
    v_cliente := auth.uid();
    v_rubro := null;
  else
    perform _error('No tenés acceso a esta obra o no existe');
  end if;
  insert into reclamos (obra_id, rubro_id, titulo, descripcion, direccion, gremio_id, cliente_id, clave_idem, clave_hash, creado_por)
  values (p_obra, v_rubro, _texto(p, 'titulo', 'Título del reclamo', 120), _texto_opt(p, 'descripcion', 2000), v_dir, v_gremio, v_cliente, v_clave, v_hash, auth.uid())
  returning id into v_id;
  perform _vincular_fotos(p_obra, v_rubro, p -> 'fotos', (now() at time zone 'America/Argentina/Buenos_Aires')::date,
    _texto_opt(p, 'titulo', 200), null, v_id);
  perform _auditar(p_obra, 'reclamo', v_id, 'alta', null, jsonb_build_object('direccion', v_dir, 'titulo', p ->> 'titulo'));
  return jsonb_build_object('id', v_id);
end $$;

-- ── Permisos de ejecución (mismos que antes) ───────────────────────────────
revoke execute on function public.crear_documento(bigint, jsonb), public.anular_novedad(bigint, text), public.anular_documento(bigint),
  public.crear_parte_avance(bigint, jsonb), public.crear_reclamo(bigint, jsonb) from public, anon;
grant execute on function public.crear_documento(bigint, jsonb), public.anular_novedad(bigint, text), public.anular_documento(bigint),
  public.crear_parte_avance(bigint, jsonb), public.crear_reclamo(bigint, jsonb) to authenticated;
