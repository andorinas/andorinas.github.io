-- ControlAr · 008 · Portal de clientes (re-ejecutable)
--
-- Rol 'cliente': el dueño de la obra. El administrador lo asocia a sus obras.
--  * Sólo ve SU obra a través de portal_obra(): avance general y por rubro, evolución del avance, días de
--    trabajo y de lluvia (parte diario), novedades publicadas y las fotos que la empresa marcó como visibles.
--  * NUNCA ve importes, proveedores, presupuestos, gremios ni comentarios internos.
--  * Puede hacer consultas a la empresa (reusa reclamos: cliente_a_empresa / empresa_a_cliente) con fotos.
-- La empresa (admin / encargado de la obra) carga el parte diario, publica novedades y elige qué fotos ve el cliente.

-- ── Rol y columnas nuevas ───────────────────────────────────────────────────
alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check check (rol in ('pendiente', 'encargado', 'admin', 'gremio', 'cliente'));

alter table public.obras add column if not exists latitud double precision check (latitud between -90 and 90);
alter table public.obras add column if not exists longitud double precision check (longitud between -180 and 180);
alter table public.obras add column if not exists fecha_fin_prevista date;

-- ── Tablas ──────────────────────────────────────────────────────────────────
create table if not exists public.obra_clientes (
  obra_id    bigint not null references public.obras(id) on delete cascade,
  usuario_id uuid   not null references public.perfiles(id) on delete cascade,
  primary key (obra_id, usuario_id)
);
create index if not exists obra_clientes_usuario on public.obra_clientes (usuario_id);

-- Parte diario (libro de obra): un registro por obra y día.
create table if not exists public.partes_diarios (
  id             bigint generated always as identity primary key,
  obra_id        bigint not null references public.obras(id) on delete cascade,
  fecha          date not null,
  clima          text not null check (clima in ('sol', 'nublado', 'lluvia', 'tormenta')),
  trabajo        text not null check (trabajo in ('normal', 'parcial', 'no')),
  personal       int check (personal is null or (personal >= 0 and personal <= 500)),
  comentario     text,                      -- interno: el cliente no lo ve
  creado_por     uuid references public.perfiles(id),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (obra_id, fecha)
);

-- Novedades que la empresa publica (con fotos opcionales).
create table if not exists public.novedades (
  id              bigint generated always as identity primary key,
  obra_id         bigint not null references public.obras(id) on delete cascade,
  fecha           date not null,
  titulo          text not null,
  texto           text,
  visible_cliente boolean not null default true,
  anulada         boolean not null default false,
  creado_por      uuid references public.perfiles(id),
  creado_en       timestamptz not null default now()
);
create index if not exists novedades_obra on public.novedades (obra_id, fecha);

alter table public.fotos add column if not exists visible_cliente boolean not null default false;
alter table public.fotos add column if not exists novedad_id bigint references public.novedades(id) on delete cascade;

-- Consultas del cliente: mismas tablas que los reclamos de gremios.
alter table public.reclamos add column if not exists cliente_id uuid references public.perfiles(id);
alter table public.reclamos drop constraint if exists reclamos_direccion_check;
alter table public.reclamos add constraint reclamos_direccion_check
  check (direccion in ('gremio_a_empresa', 'empresa_a_gremio', 'cliente_a_empresa', 'empresa_a_cliente'));

-- ── Ayudantes de permisos ───────────────────────────────────────────────────
create or replace function public.es_cliente() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles where id = auth.uid() and rol = 'cliente' and activo);
$$;

create or replace function public.cliente_en_obra(p_obra bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select public.es_cliente() and exists (select 1 from obra_clientes where usuario_id = auth.uid() and obra_id = p_obra);
$$;

-- Reclamo / consulta visible: la empresa de la obra, o el gremio o cliente involucrado.
create or replace function public.ve_reclamo(p_reclamo bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from reclamos r where r.id = p_reclamo
    and (public.puede_ver_obra(r.obra_id)
         or (public.es_gremio() and r.gremio_id = auth.uid())
         or (public.es_cliente() and r.cliente_id = auth.uid() and public.cliente_en_obra(r.obra_id))));
$$;

create or replace function public.ve_foto(p_foto bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from fotos f left join partes_avance pa on pa.id = f.parte_id
    left join novedades n on n.id = f.novedad_id where f.id = p_foto
    and (public.puede_ver_obra(f.obra_id)
         or (public.es_gremio() and (f.creado_por = auth.uid() or pa.creado_por = auth.uid()
             or (f.reclamo_id is not null and public.ve_reclamo(f.reclamo_id))))
         or (public.es_cliente() and (
             (public.cliente_en_obra(f.obra_id) and f.visible_cliente and (n.id is null or (n.visible_cliente and not n.anulada)))
             or (f.reclamo_id is not null and public.ve_reclamo(f.reclamo_id))))));
$$;

create or replace function public.puede_leer_archivo(p_ruta text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.puede_ver_obra(public._obra_de_ruta(p_ruta))
    or ((public.es_gremio() or public.es_cliente()) and exists (select 1 from adjuntos a join fotos f on f.adjunto_id = a.id
                                       where a.ruta = p_ruta and public.ve_foto(f.id)));
$$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.obra_clientes  enable row level security;
alter table public.partes_diarios enable row level security;
alter table public.novedades      enable row level security;

drop policy if exists obras_leer on public.obras;
create policy obras_leer on public.obras for select to authenticated
  using (public.puede_ver_obra(id) or public.gremio_en_obra(id) or public.cliente_en_obra(id));
drop policy if exists adjuntos_leer on public.adjuntos;
create policy adjuntos_leer on public.adjuntos for select to authenticated
  using (public.puede_ver_obra(obra_id) or ((public.es_gremio() or public.es_cliente())
         and exists (select 1 from fotos f where f.adjunto_id = adjuntos.id and public.ve_foto(f.id))));

drop policy if exists obra_clientes_leer on public.obra_clientes;
create policy obra_clientes_leer on public.obra_clientes for select to authenticated
  using (usuario_id = auth.uid() or public.puede_ver_obra(obra_id));
-- El parte diario y las novedades completas son de la empresa; el cliente los recibe filtrados por portal_obra().
drop policy if exists partes_diarios_leer on public.partes_diarios;
create policy partes_diarios_leer on public.partes_diarios for select to authenticated using (public.puede_ver_obra(obra_id));
drop policy if exists novedades_leer on public.novedades;
create policy novedades_leer on public.novedades for select to authenticated
  using (public.puede_ver_obra(obra_id) or (public.cliente_en_obra(obra_id) and visible_cliente and not anulada));

revoke insert, update, delete, truncate on public.obra_clientes, public.partes_diarios, public.novedades from anon, authenticated;
revoke select on public.obra_clientes, public.partes_diarios, public.novedades from anon;
grant select on public.obra_clientes, public.partes_diarios, public.novedades to authenticated;

-- Almacenamiento: el cliente sube fotos sólo para sus consultas, en sus obras.
drop policy if exists controlar_adjuntos_subir on storage.objects;
create policy controlar_adjuntos_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'adjuntos' and (public.puede_ver_obra(public._obra_de_ruta(name))
    or public.gremio_en_obra(public._obra_de_ruta(name)) or public.cliente_en_obra(public._obra_de_ruta(name))));

-- ── Funciones ───────────────────────────────────────────────────────────────
create or replace function public.registrar_adjunto(p_obra bigint, p_ruta text, p_nombre text, p_mime text, p_tamano bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not (puede_ver_obra(p_obra) or gremio_en_obra(p_obra) or cliente_en_obra(p_obra)) then perform _error('No tenés acceso a esta obra o no existe'); end if;
  if _obra_de_ruta(p_ruta) is distinct from p_obra then perform _error('Ruta de adjunto inválida'); end if;
  if not exists (select 1 from storage.objects where bucket_id = 'adjuntos' and name = p_ruta) then perform _error('El archivo no se subió'); end if;
  if p_mime not in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf') then perform _error('Formato no admitido'); end if;
  if es_cliente() and p_mime not like 'image/%' then perform _error('Sólo se admiten fotos (JPG, PNG, WEBP, HEIC)'); end if;
  insert into adjuntos (obra_id, ruta, nombre, mime, tamano, subido_por)
  values (p_obra, p_ruta, left(coalesce(nullif(trim(p_nombre), ''), 'archivo'), 200), p_mime, p_tamano, auth.uid())
  on conflict (ruta) do update set nombre = excluded.nombre
  returning id into v_id;
  return v_id;
end $$;

-- Usuarios: suma el rol 'cliente' (misma lógica que antes).
create or replace function public.actualizar_usuario(p_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v perfiles; o jsonb;
begin
  perform _exigir_admin();
  select * into v from perfiles where id = p_id;
  if not found then perform _error('Usuario inexistente'); end if;
  if p ? 'rol' then
    if p ->> 'rol' not in ('pendiente', 'encargado', 'admin', 'gremio', 'cliente') then perform _error('Rol inválido'); end if;
    if p_id = auth.uid() and p ->> 'rol' <> 'admin' then perform _error('No podés quitarte el rol de administrador'); end if;
    update perfiles set rol = p ->> 'rol' where id = p_id;
  end if;
  if p ? 'activo' then
    if p_id = auth.uid() and not (p ->> 'activo')::boolean then perform _error('No podés desactivar tu propio usuario'); end if;
    update perfiles set activo = (p ->> 'activo')::boolean where id = p_id;
  end if;
  if p ? 'nombre' then update perfiles set nombre = left(trim(p ->> 'nombre'), 80) where id = p_id; end if;
  if p ? 'obras' then
    delete from obra_usuarios where usuario_id = p_id;
    for o in select * from jsonb_array_elements(p -> 'obras') loop
      insert into obra_usuarios (obra_id, usuario_id) values (o::text::bigint, p_id) on conflict do nothing;
    end loop;
  end if;
  perform _auditar(null, 'usuario', 0, 'modificacion', to_jsonb(v), p);
end $$;

-- Obras de un cliente (administrador). p_obras: ids de obras.
create or replace function public.asignar_obras_cliente(p_usuario uuid, p_obras jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare x jsonb; n int := 0;
begin
  perform _exigir_admin();
  if not exists (select 1 from perfiles where id = p_usuario and rol = 'cliente') then perform _error('El usuario no es un cliente'); end if;
  delete from obra_clientes where usuario_id = p_usuario;
  for x in select * from jsonb_array_elements(coalesce(p_obras, '[]'::jsonb)) loop
    if not exists (select 1 from obras where id = (x #>> '{}')::bigint) then perform _error('Obra inexistente'); end if;
    insert into obra_clientes (obra_id, usuario_id) values ((x #>> '{}')::bigint, p_usuario) on conflict do nothing;
    n := n + 1;
  end loop;
  perform _auditar(null, 'usuario', 0, 'obras_cliente', null, jsonb_build_object('usuario', p_usuario, 'obras', p_obras));
  return n;
end $$;

-- Datos de la obra para el portal: ubicación (para la lluvia) y entrega prevista. Administrador.
create or replace function public.definir_datos_portal(p_obra bigint, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v obras; v_lat double precision; v_lon double precision;
begin
  perform _exigir_admin();
  select * into v from obras where id = p_obra;
  if not found then perform _error('Obra inexistente'); end if;
  if p ? 'latitud' or p ? 'longitud' then
    begin
      v_lat := nullif(p ->> 'latitud', '')::double precision;
      v_lon := nullif(p ->> 'longitud', '')::double precision;
    exception when others then perform _error('Coordenadas inválidas');
    end;
    if (v_lat is null) <> (v_lon is null) then perform _error('Indicá latitud y longitud'); end if;
    if v_lat is not null and (v_lat not between -90 and 90 or v_lon not between -180 and 180) then perform _error('Coordenadas inválidas'); end if;
    update obras set latitud = v_lat, longitud = v_lon where id = p_obra;
  end if;
  if p ? 'fecha_fin_prevista' then
    update obras set fecha_fin_prevista = case when nullif(p ->> 'fecha_fin_prevista', '') is null then null
      else _fecha(p ->> 'fecha_fin_prevista', 'Entrega prevista') end where id = p_obra;
  end if;
  perform _auditar(p_obra, 'obra', p_obra, 'datos_portal', to_jsonb(v), p);
end $$;

-- Parte diario: un registro por día; volver a guardar el mismo día lo reemplaza.
create or replace function public.guardar_parte_diario(p_obra bigint, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_fecha date; v_clima text := p ->> 'clima'; v_trabajo text := p ->> 'trabajo'; v_pers int; v_id bigint;
begin
  if not puede_ver_obra(p_obra) then perform _error('No tenés acceso a esta obra o no existe'); end if;
  v_fecha := _fecha(p ->> 'fecha', 'Fecha');
  if v_fecha > (now() at time zone 'America/Argentina/Buenos_Aires')::date then perform _error('La fecha no puede ser futura'); end if;
  if v_clima is null or v_clima not in ('sol', 'nublado', 'lluvia', 'tormenta') then perform _error('Elegí el clima del día'); end if;
  if v_trabajo is null or v_trabajo not in ('normal', 'parcial', 'no') then perform _error('Indicá si se trabajó'); end if;
  begin v_pers := nullif(p ->> 'personal', '')::int; exception when others then perform _error('Cantidad de personal inválida'); end;
  if v_pers is not null and (v_pers < 0 or v_pers > 500) then perform _error('Cantidad de personal inválida'); end if;
  insert into partes_diarios (obra_id, fecha, clima, trabajo, personal, comentario, creado_por)
  values (p_obra, v_fecha, v_clima, v_trabajo, v_pers, _texto_opt(p, 'comentario', 1000), auth.uid())
  on conflict (obra_id, fecha) do update set clima = excluded.clima, trabajo = excluded.trabajo, personal = excluded.personal,
    comentario = excluded.comentario, actualizado_en = now()
  returning id into v_id;
  perform _auditar(p_obra, 'parte_diario', v_id, 'guardado', null, jsonb_build_object('fecha', v_fecha, 'clima', v_clima, 'trabajo', v_trabajo));
  return jsonb_build_object('id', v_id);
end $$;

-- Novedad (con fotos opcionales). Las fotos de una novedad visible quedan visibles para el cliente.
create or replace function public.crear_novedad(p_obra bigint, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_fecha date; v_vis boolean := coalesce((p ->> 'visible_cliente')::boolean, true); v_ids bigint[];
begin
  if not puede_ver_obra(p_obra) then perform _error('No tenés acceso a esta obra o no existe'); end if;
  v_fecha := coalesce(nullif(p ->> 'fecha', '')::date, (now() at time zone 'America/Argentina/Buenos_Aires')::date);
  insert into novedades (obra_id, fecha, titulo, texto, visible_cliente, creado_por)
  values (p_obra, v_fecha, _texto(p, 'titulo', 'Título', 120), _texto_opt(p, 'texto', 3000), v_vis, auth.uid())
  returning id into v_id;
  select coalesce(array_agg((x #>> '{}')::bigint), '{}') into v_ids from jsonb_array_elements(coalesce(p -> 'fotos', '[]'::jsonb)) x;
  perform _vincular_fotos(p_obra, null, p -> 'fotos', v_fecha, _texto_opt(p, 'titulo', 200));
  update fotos set novedad_id = v_id, visible_cliente = v_vis
  where obra_id = p_obra and adjunto_id = any(v_ids) and novedad_id is null and creado_por = auth.uid();
  perform _auditar(p_obra, 'novedad', v_id, 'alta', null, jsonb_build_object('titulo', p ->> 'titulo', 'visible_cliente', v_vis));
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.anular_novedad(p_id bigint, p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
declare n novedades;
begin
  select * into n from novedades where id = p_id;
  if not found or not puede_ver_obra(n.obra_id) then perform _error('Novedad inexistente o sin acceso'); end if;
  update novedades set anulada = true where id = p_id;
  perform _auditar(n.obra_id, 'novedad', p_id, 'anulacion', null, null, left(nullif(trim(p_motivo), ''), 500));
end $$;

-- Mostrar u ocultar una foto al cliente.
create or replace function public.marcar_foto_cliente(p_foto bigint, p_visible boolean) returns void
language plpgsql security definer set search_path = public as $$
declare f fotos;
begin
  select * into f from fotos where id = p_foto;
  if not found or not puede_ver_obra(f.obra_id) then perform _error('Foto inexistente o sin acceso'); end if;
  update fotos set visible_cliente = coalesce(p_visible, false) where id = p_foto;
  perform _auditar(f.obra_id, 'foto', p_foto, case when p_visible then 'visible_cliente' else 'oculta_cliente' end);
end $$;

-- Reclamos y consultas: empresa ↔ gremio y empresa ↔ cliente.
create or replace function public.crear_reclamo(p_obra bigint, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_rubro bigint := nullif(p ->> 'rubro_id', '')::bigint; v_dir text; v_gremio uuid; v_cliente uuid; v_id bigint;
  v_clave text := nullif(p ->> 'clave_idem', '');
begin
  if v_clave is not null then
    select id into v_id from reclamos where clave_idem = v_clave and creado_por = auth.uid();
    if found then return jsonb_build_object('id', v_id, 'duplicado', true); end if;
  end if;
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
  insert into reclamos (obra_id, rubro_id, titulo, descripcion, direccion, gremio_id, cliente_id, clave_idem, creado_por)
  values (p_obra, v_rubro, _texto(p, 'titulo', 'Título del reclamo', 120), _texto_opt(p, 'descripcion', 2000), v_dir, v_gremio, v_cliente, v_clave, auth.uid())
  returning id into v_id;
  perform _vincular_fotos(p_obra, v_rubro, p -> 'fotos', (now() at time zone 'America/Argentina/Buenos_Aires')::date,
    _texto_opt(p, 'titulo', 200), null, v_id);
  perform _auditar(p_obra, 'reclamo', v_id, 'alta', null, jsonb_build_object('direccion', v_dir, 'titulo', p ->> 'titulo'));
  return jsonb_build_object('id', v_id);
end $$;

-- Nombres para mostrar quién escribió (sin emails). El cliente ve los nombres de la empresa y de los otros clientes de su obra.
create or replace function public.directorio() returns table (id uuid, nombre text)
language sql stable security definer set search_path = public as $$
  select p.id, p.nombre from perfiles p
  where (public.es_usuario_activo() or public.es_gremio() or public.es_cliente())
    and p.rol in ('admin', 'encargado', 'gremio', 'cliente');
$$;

-- Lo que ve el cliente de su obra (también lo usa la empresa para "Ver como cliente"). Sin importes ni datos internos.
create or replace function public.portal_obra(p_obra bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o obras; v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date; v jsonb;
begin
  if not (cliente_en_obra(p_obra) or puede_ver_obra(p_obra)) then perform _error('No tenés acceso a esta obra o no existe'); end if;
  select * into o from obras where id = p_obra;
  with r as (select id, nombre, peso, orden from rubros where obra_id = p_obra and activo),
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
                         'avance', u.porcentaje, 'fecha', u.fecha) order by r.orden, r.id)
                        from r left join ult u on u.rubro_id = r.id), '[]'::jsonb),
    'serie', coalesce((select jsonb_agg(jsonb_build_object('fecha', s.d, 'avance', s.avance) order by s.d) from serie s), '[]'::jsonb),
    'dias', coalesce((select jsonb_agg(jsonb_build_object('fecha', pd.fecha, 'clima', pd.clima, 'trabajo', pd.trabajo, 'personal', pd.personal)
                        order by pd.fecha) from partes_diarios pd where pd.obra_id = p_obra), '[]'::jsonb),
    'novedades', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'fecha', n.fecha, 'titulo', n.titulo, 'texto', n.texto)
                        order by n.fecha desc, n.id desc)
                        from novedades n where n.obra_id = p_obra and n.visible_cliente and not n.anulada), '[]'::jsonb),
    'fotos', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'ruta', a.ruta, 'fecha', f.fecha, 'descripcion', f.descripcion,
                         'rubro', rr.nombre, 'novedad_id', f.novedad_id) order by f.fecha desc, f.id desc)
                       from fotos f join adjuntos a on a.id = f.adjunto_id left join rubros rr on rr.id = f.rubro_id
                       left join novedades n on n.id = f.novedad_id
                       where f.obra_id = p_obra and f.visible_cliente and (n.id is null or (n.visible_cliente and not n.anulada))), '[]'::jsonb)
  ) into v;
  return v;
end $$;

-- ── Permisos de ejecución ───────────────────────────────────────────────────
revoke execute on function public.es_cliente(), public.cliente_en_obra(bigint), public.ve_reclamo(bigint), public.ve_foto(bigint),
  public.puede_leer_archivo(text), public.registrar_adjunto(bigint, text, text, text, bigint), public.actualizar_usuario(uuid, jsonb),
  public.asignar_obras_cliente(uuid, jsonb), public.definir_datos_portal(bigint, jsonb), public.guardar_parte_diario(bigint, jsonb),
  public.crear_novedad(bigint, jsonb), public.anular_novedad(bigint, text), public.marcar_foto_cliente(bigint, boolean),
  public.crear_reclamo(bigint, jsonb), public.directorio(), public.portal_obra(bigint)
  from public, anon;
grant execute on function public.es_cliente(), public.cliente_en_obra(bigint), public.ve_reclamo(bigint), public.ve_foto(bigint),
  public.puede_leer_archivo(text), public.registrar_adjunto(bigint, text, text, text, bigint), public.actualizar_usuario(uuid, jsonb),
  public.asignar_obras_cliente(uuid, jsonb), public.definir_datos_portal(bigint, jsonb), public.guardar_parte_diario(bigint, jsonb),
  public.crear_novedad(bigint, jsonb), public.anular_novedad(bigint, text), public.marcar_foto_cliente(bigint, boolean),
  public.crear_reclamo(bigint, jsonb), public.directorio(), public.portal_obra(bigint)
  to authenticated;
