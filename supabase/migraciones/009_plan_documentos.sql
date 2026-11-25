-- ControlAr · 009 · Portal de clientes, etapa 2: plan de obra y documentos (re-ejecutable)
--
--  * Plan de obra: cada rubro puede tener fecha de inicio y de fin previstas. Con los pesos del avance, el portal
--    dibuja la curva planificada al lado de la real (el cálculo de la curva lo hace la app).
--  * Documentos: la empresa sube planos, contratos, permisos, etc. y elige cuáles ve el cliente.
--  * portal_obra() suma las fechas del plan y los documentos visibles. Sigue sin importes ni datos internos.

-- ── Plan por rubro ──────────────────────────────────────────────────────────
alter table public.rubros add column if not exists inicio_plan date;
alter table public.rubros add column if not exists fin_plan date;
alter table public.rubros drop constraint if exists rubros_plan_check;
alter table public.rubros add constraint rubros_plan_check
  check ((inicio_plan is null) = (fin_plan is null) and (fin_plan is null or fin_plan >= inicio_plan));

-- ── Documentos ──────────────────────────────────────────────────────────────
create table if not exists public.documentos (
  id              bigint generated always as identity primary key,
  obra_id         bigint not null references public.obras(id) on delete cascade,
  adjunto_id      bigint not null references public.adjuntos(id) on delete cascade,
  titulo          text not null,
  categoria       text not null default 'otro'
                  check (categoria in ('plano', 'contrato', 'permiso', 'memoria', 'certificado', 'garantia', 'otro')),
  visible_cliente boolean not null default true,
  anulado         boolean not null default false,
  creado_por      uuid references public.perfiles(id),
  creado_en       timestamptz not null default now()
);
create index if not exists documentos_obra on public.documentos (obra_id);

alter table public.documentos enable row level security;
drop policy if exists documentos_leer on public.documentos;
create policy documentos_leer on public.documentos for select to authenticated
  using (public.puede_ver_obra(obra_id) or (public.cliente_en_obra(obra_id) and visible_cliente and not anulado));
revoke insert, update, delete, truncate on public.documentos from anon, authenticated;
revoke select on public.documentos from anon;
grant select on public.documentos to authenticated;

-- El cliente puede abrir el archivo de un documento visible de su obra.
create or replace function public.ve_documento_archivo(p_ruta text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.es_cliente() and exists (select 1 from adjuntos a join documentos d on d.adjunto_id = a.id
    where a.ruta = p_ruta and d.visible_cliente and not d.anulado and public.cliente_en_obra(d.obra_id));
$$;

create or replace function public.puede_leer_archivo(p_ruta text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.puede_ver_obra(public._obra_de_ruta(p_ruta))
    or ((public.es_gremio() or public.es_cliente()) and exists (select 1 from adjuntos a join fotos f on f.adjunto_id = a.id
                                       where a.ruta = p_ruta and public.ve_foto(f.id)))
    or public.ve_documento_archivo(p_ruta);
$$;

drop policy if exists adjuntos_leer on public.adjuntos;
create policy adjuntos_leer on public.adjuntos for select to authenticated
  using (public.puede_ver_obra(obra_id)
         or ((public.es_gremio() or public.es_cliente())
             and exists (select 1 from fotos f where f.adjunto_id = adjuntos.id and public.ve_foto(f.id)))
         or public.ve_documento_archivo(ruta));

-- ── Funciones ───────────────────────────────────────────────────────────────
-- p: {"rubros": [{"id": 1, "inicio": "2026-06-01", "fin": "2026-07-15"}, ...]}. Sin fechas = sin planificar. Administrador.
create or replace function public.definir_plan(p_obra bigint, p jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare x jsonb; v rubros; v_ini date; v_fin date; n int := 0; v_antes jsonb;
begin
  perform _exigir_admin(); perform _exigir_obra(p_obra);
  select jsonb_agg(jsonb_build_object('id', id, 'inicio', inicio_plan, 'fin', fin_plan)) into v_antes from rubros where obra_id = p_obra;
  for x in select * from jsonb_array_elements(coalesce(p -> 'rubros', '[]'::jsonb)) loop
    select * into v from rubros where id = nullif(x ->> 'id', '')::bigint and obra_id = p_obra;
    if not found then perform _error('El rubro no pertenece a esta obra'); end if;
    v_ini := case when nullif(x ->> 'inicio', '') is null then null else _fecha(x ->> 'inicio', v.nombre || ' · inicio') end;
    v_fin := case when nullif(x ->> 'fin', '') is null then null else _fecha(x ->> 'fin', v.nombre || ' · fin') end;
    if (v_ini is null) <> (v_fin is null) then perform _error(v.nombre || ': indicá inicio y fin, o dejá las dos vacías'); end if;
    if v_fin < v_ini then perform _error(v.nombre || ': el fin es anterior al inicio'); end if;
    update rubros set inicio_plan = v_ini, fin_plan = v_fin where id = v.id;
    n := n + 1;
  end loop;
  perform _auditar(p_obra, 'obra', p_obra, 'plan_obra', v_antes, p);
  return n;
end $$;

-- p: {adjunto_id, titulo, categoria, visible_cliente}. El archivo se sube antes con registrar_adjunto.
create or replace function public.crear_documento(p_obra bigint, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_adj bigint := nullif(p ->> 'adjunto_id', '')::bigint; v_cat text := coalesce(nullif(p ->> 'categoria', ''), 'otro');
begin
  if not puede_ver_obra(p_obra) then perform _error('No tenés acceso a esta obra o no existe'); end if;
  if v_adj is null or not exists (select 1 from adjuntos where id = v_adj and obra_id = p_obra) then perform _error('Subí el archivo del documento'); end if;
  if v_cat not in ('plano', 'contrato', 'permiso', 'memoria', 'certificado', 'garantia', 'otro') then perform _error('Tipo de documento inválido'); end if;
  insert into documentos (obra_id, adjunto_id, titulo, categoria, visible_cliente, creado_por)
  values (p_obra, v_adj, _texto(p, 'titulo', 'Título', 150), v_cat, coalesce((p ->> 'visible_cliente')::boolean, true), auth.uid())
  returning id into v_id;
  perform _auditar(p_obra, 'documento', v_id, 'alta', null, p);
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.marcar_documento_cliente(p_id bigint, p_visible boolean) returns void
language plpgsql security definer set search_path = public as $$
declare d documentos;
begin
  select * into d from documentos where id = p_id;
  if not found or not puede_ver_obra(d.obra_id) then perform _error('Documento inexistente o sin acceso'); end if;
  update documentos set visible_cliente = coalesce(p_visible, false) where id = p_id;
  perform _auditar(d.obra_id, 'documento', p_id, case when p_visible then 'visible_cliente' else 'oculto_cliente' end);
end $$;

-- Quitar: queda en la base (auditoría) pero deja de mostrarse.
create or replace function public.anular_documento(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare d documentos;
begin
  select * into d from documentos where id = p_id;
  if not found or not puede_ver_obra(d.obra_id) then perform _error('Documento inexistente o sin acceso'); end if;
  update documentos set anulado = true where id = p_id;
  perform _auditar(d.obra_id, 'documento', p_id, 'anulacion');
end $$;

-- Portal: igual que en 008, más las fechas del plan por rubro y los documentos visibles.
create or replace function public.portal_obra(p_obra bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o obras; v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date; v jsonb;
begin
  if not (cliente_en_obra(p_obra) or puede_ver_obra(p_obra)) then perform _error('No tenés acceso a esta obra o no existe'); end if;
  select * into o from obras where id = p_obra;
  with r as (select id, nombre, peso, orden, inicio_plan, fin_plan from rubros where obra_id = p_obra and activo),
  pond as (select count(*) filter (where peso is null) = 0 and count(*) > 0 and abs(coalesce(sum(peso), 0) - 100) <= 0.0101 as ok from r),
  ult as (select distinct on (rubro_id) rubro_id, porcentaje, fecha from avances
          where obra_id = p_obra and not anulado and fecha <= v_hoy order by rubro_id, fecha desc, id desc),
  fechas as (
    select distinct d::date as d from (
      select (date_trunc('month', g) + interval '1 month - 1 day') as d
      from generate_series(date_trunc('month', o.fecha_inicio::timestamp), date_trunc('month', v_hoy::timestamp), interval '1 month') g
      union all select v_hoy::timestamp) s
    where d::date >= o.fecha_inicio and d::date <= v_hoy),
  serie as (
    select f.d, (select case when (select ok from pond) then round((sum(r.peso * coalesce(a.porcentaje, 0)) / 100)::numeric, 2) end
                 from r left join lateral (select porcentaje from avances av where av.rubro_id = r.id and not av.anulado and av.fecha <= f.d
                                            order by av.fecha desc, av.id desc limit 1) a on true) as avance
    from fechas f)
  select jsonb_build_object(
    'obra', jsonb_build_object('id', o.id, 'nombre', o.nombre, 'ubicacion', o.ubicacion, 'estado', o.estado,
      'fecha_inicio', o.fecha_inicio, 'fecha_fin_prevista', o.fecha_fin_prevista, 'latitud', o.latitud, 'longitud', o.longitud),
    'hoy', v_hoy,
    'ponderado', (select ok from pond),
    'avance_general', (select case when (select ok from pond) then round((sum(r.peso * coalesce(u.porcentaje, 0)) / 100)::numeric, 2) end
                       from r left join ult u on u.rubro_id = r.id),
    'rubros', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'nombre', r.nombre, 'peso', r.peso,
                         'avance', u.porcentaje, 'fecha', u.fecha, 'inicio_plan', r.inicio_plan, 'fin_plan', r.fin_plan) order by r.orden, r.id)
                        from r left join ult u on u.rubro_id = r.id), '[]'::jsonb),
    'serie', coalesce((select jsonb_agg(jsonb_build_object('fecha', s.d, 'avance', s.avance) order by s.d) from serie s), '[]'::jsonb),
    -- historial de avance por etapa (sólo fecha y %; sin comentarios ni usuarios) para el informe mensual
    'historial', coalesce((select jsonb_agg(jsonb_build_object('rubro_id', av.rubro_id, 'fecha', av.fecha, 'porcentaje', av.porcentaje)
                        order by av.fecha, av.id) from avances av join r on r.id = av.rubro_id
                        where av.obra_id = p_obra and not av.anulado and av.fecha <= v_hoy), '[]'::jsonb),
    'dias', coalesce((select jsonb_agg(jsonb_build_object('fecha', pd.fecha, 'clima', pd.clima, 'trabajo', pd.trabajo, 'personal', pd.personal)
                        order by pd.fecha) from partes_diarios pd where pd.obra_id = p_obra), '[]'::jsonb),
    'novedades', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'fecha', n.fecha, 'titulo', n.titulo, 'texto', n.texto)
                        order by n.fecha desc, n.id desc)
                        from novedades n where n.obra_id = p_obra and n.visible_cliente and not n.anulada), '[]'::jsonb),
    'fotos', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'ruta', a.ruta, 'fecha', f.fecha, 'descripcion', f.descripcion,
                         'rubro', rr.nombre, 'novedad_id', f.novedad_id) order by f.fecha desc, f.id desc)
                       from fotos f join adjuntos a on a.id = f.adjunto_id left join rubros rr on rr.id = f.rubro_id
                       left join novedades n on n.id = f.novedad_id
                       where f.obra_id = p_obra and f.visible_cliente and (n.id is null or (n.visible_cliente and not n.anulada))), '[]'::jsonb),
    'documentos', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'titulo', d.titulo, 'categoria', d.categoria,
                         'fecha', (d.creado_en at time zone 'America/Argentina/Buenos_Aires')::date, 'ruta', a.ruta, 'nombre', a.nombre,
                         'mime', a.mime, 'tamano', a.tamano)
                         order by array_position(array['plano','contrato','permiso','memoria','certificado','garantia','otro'], d.categoria), d.creado_en desc, d.id)
                       from documentos d join adjuntos a on a.id = d.adjunto_id
                       where d.obra_id = p_obra and d.visible_cliente and not d.anulado), '[]'::jsonb)
  ) into v;
  return v;
end $$;

-- Respaldo descargable desde la app: suma las tablas de gremios, clientes y documentos.
create or replace function public.exportar_respaldo() returns jsonb
language plpgsql security definer set search_path = public as $$
declare t text; v jsonb; res jsonb := jsonb_build_object('generado', now(), 'version', 2);
begin
  perform _exigir_admin();
  foreach t in array array['perfiles','obras','obra_usuarios','rubros_catalogo','rubros','tipos_gasto','proveedores','cotizaciones',
    'adjuntos','presupuestos','compromisos','pagos','avances','auditoria',
    'gremio_rubros','partes_avance','reclamos','reclamo_mensajes','fotos',
    'obra_clientes','partes_diarios','novedades','documentos'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x', t) into v;
    res := res || jsonb_build_object(t, v);
  end loop;
  perform _auditar(null, 'sistema', 0, 'descarga_respaldo');
  return res;
end $$;

-- ── Permisos de ejecución ───────────────────────────────────────────────────
revoke execute on function public.ve_documento_archivo(text), public.puede_leer_archivo(text), public.definir_plan(bigint, jsonb),
  public.crear_documento(bigint, jsonb), public.marcar_documento_cliente(bigint, boolean), public.anular_documento(bigint),
  public.portal_obra(bigint)
  from public, anon;
grant execute on function public.ve_documento_archivo(text), public.puede_leer_archivo(text), public.definir_plan(bigint, jsonb),
  public.crear_documento(bigint, jsonb), public.marcar_documento_cliente(bigint, boolean), public.anular_documento(bigint),
  public.portal_obra(bigint)
  to authenticated;
