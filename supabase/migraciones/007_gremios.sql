-- ControlAr · 007 · Gremios: fotos de obra, partes de avance y reclamos (re-ejecutable)
--
-- Rol 'gremio' (electricista, plomero, etc.): el administrador le asigna rubros de una o más obras.
--  * Ve sólo sus rubros asignados, sus partes de avance, sus reclamos y sus fotos. NUNCA importes.
--  * Informa avances con fotos ("partes"): quedan pendientes hasta que la empresa los aprueba.
--  * Reclamos en ambos sentidos (gremio -> empresa y empresa -> gremio) con estado, fotos y conversación.
-- La empresa (admin / encargado de la obra) ve todo lo de la obra y suma fotos a la galería.

-- ── Rol nuevo ───────────────────────────────────────────────────────────────
alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check check (rol in ('pendiente', 'encargado', 'admin', 'gremio', 'cliente'));

-- ── Tablas ──────────────────────────────────────────────────────────────────
create table if not exists public.gremio_rubros (
  usuario_id uuid   not null references public.perfiles(id) on delete cascade,
  obra_id    bigint not null references public.obras(id) on delete cascade,
  rubro_id   bigint not null references public.rubros(id) on delete cascade,
  primary key (usuario_id, rubro_id)
);
create index if not exists gremio_rubros_obra on public.gremio_rubros (obra_id);

create table if not exists public.partes_avance (
  id             bigint generated always as identity primary key,
  obra_id        bigint not null references public.obras(id),
  rubro_id       bigint not null references public.rubros(id),
  fecha          date not null,
  porcentaje     double precision not null check (porcentaje >= 0 and porcentaje <= 100),
  comentario     text,
  estado         text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'rechazado')),
  motivo_revision text,
  revisado_por   uuid references public.perfiles(id),
  revisado_en    timestamptz,
  avance_id      bigint references public.avances(id),
  clave_idem     text unique,
  creado_por     uuid references public.perfiles(id),
  creado_en      timestamptz not null default now()
);
create index if not exists partes_obra on public.partes_avance (obra_id, estado);

create table if not exists public.reclamos (
  id              bigint generated always as identity primary key,
  obra_id         bigint not null references public.obras(id),
  rubro_id        bigint references public.rubros(id),
  titulo          text not null,
  descripcion     text,
  direccion       text not null check (direccion in ('gremio_a_empresa', 'empresa_a_gremio')),
  gremio_id       uuid references public.perfiles(id),   -- el gremio involucrado (autor o destinatario)
  estado          text not null default 'abierto' check (estado in ('abierto', 'en_curso', 'resuelto')),
  clave_idem      text unique,
  creado_por      uuid references public.perfiles(id),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create index if not exists reclamos_obra on public.reclamos (obra_id, estado);

create table if not exists public.reclamo_mensajes (
  id          bigint generated always as identity primary key,
  reclamo_id  bigint not null references public.reclamos(id) on delete cascade,
  texto       text,
  estado_nuevo text,
  creado_por  uuid references public.perfiles(id),
  creado_en   timestamptz not null default now()
);

-- Galería: toda foto de obra (de la empresa, de un parte o de un reclamo).
create table if not exists public.fotos (
  id          bigint generated always as identity primary key,
  obra_id     bigint not null references public.obras(id),
  rubro_id    bigint references public.rubros(id),
  adjunto_id  bigint not null references public.adjuntos(id),
  descripcion text,
  fecha       date not null,
  parte_id    bigint references public.partes_avance(id) on delete cascade,
  reclamo_id  bigint references public.reclamos(id) on delete cascade,
  mensaje_id  bigint references public.reclamo_mensajes(id) on delete cascade,
  creado_por  uuid references public.perfiles(id),
  creado_en   timestamptz not null default now()
);
create index if not exists fotos_obra on public.fotos (obra_id, fecha);

-- ── Ayudantes de permisos ───────────────────────────────────────────────────
create or replace function public.es_gremio() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles where id = auth.uid() and rol = 'gremio' and activo);
$$;

create or replace function public.gremio_en_obra(p_obra bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select public.es_gremio() and exists (select 1 from gremio_rubros where usuario_id = auth.uid() and obra_id = p_obra);
$$;

create or replace function public.gremio_en_rubro(p_rubro bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select public.es_gremio() and exists (select 1 from gremio_rubros where usuario_id = auth.uid() and rubro_id = p_rubro);
$$;

-- Reclamo visible: la empresa de la obra, o el gremio involucrado.
create or replace function public.ve_reclamo(p_reclamo bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from reclamos r where r.id = p_reclamo
    and (public.puede_ver_obra(r.obra_id) or (public.es_gremio() and r.gremio_id = auth.uid())));
$$;

create or replace function public.ve_foto(p_foto bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from fotos f left join partes_avance pa on pa.id = f.parte_id where f.id = p_foto
    and (public.puede_ver_obra(f.obra_id)
         or (public.es_gremio() and (f.creado_por = auth.uid() or pa.creado_por = auth.uid()
             or (f.reclamo_id is not null and public.ve_reclamo(f.reclamo_id))))));
$$;

-- Archivo del bucket legible: empresa de la obra, o gremio si es una foto que puede ver.
create or replace function public.puede_leer_archivo(p_ruta text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.puede_ver_obra(public._obra_de_ruta(p_ruta))
    or (public.es_gremio() and exists (select 1 from adjuntos a join fotos f on f.adjunto_id = a.id
                                       where a.ruta = p_ruta and public.ve_foto(f.id)));
$$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.gremio_rubros    enable row level security;
alter table public.partes_avance    enable row level security;
alter table public.reclamos         enable row level security;
alter table public.reclamo_mensajes enable row level security;
alter table public.fotos            enable row level security;

drop policy if exists obras_leer on public.obras;
create policy obras_leer on public.obras for select to authenticated
  using (public.puede_ver_obra(id) or public.gremio_en_obra(id));
drop policy if exists rubros_leer on public.rubros;
create policy rubros_leer on public.rubros for select to authenticated
  using (public.puede_ver_obra(obra_id) or public.gremio_en_rubro(id));
drop policy if exists adjuntos_leer on public.adjuntos;
create policy adjuntos_leer on public.adjuntos for select to authenticated
  using (public.puede_ver_obra(obra_id) or (public.es_gremio() and exists (select 1 from fotos f where f.adjunto_id = adjuntos.id and public.ve_foto(f.id))));

drop policy if exists gremio_rubros_leer on public.gremio_rubros;
create policy gremio_rubros_leer on public.gremio_rubros for select to authenticated
  using (usuario_id = auth.uid() or public.puede_ver_obra(obra_id));
drop policy if exists partes_leer on public.partes_avance;
create policy partes_leer on public.partes_avance for select to authenticated
  using (public.puede_ver_obra(obra_id) or (public.es_gremio() and creado_por = auth.uid()));
drop policy if exists reclamos_leer on public.reclamos;
create policy reclamos_leer on public.reclamos for select to authenticated using (public.ve_reclamo(id));
drop policy if exists reclamo_mensajes_leer on public.reclamo_mensajes;
create policy reclamo_mensajes_leer on public.reclamo_mensajes for select to authenticated using (public.ve_reclamo(reclamo_id));
drop policy if exists fotos_leer on public.fotos;
create policy fotos_leer on public.fotos for select to authenticated using (public.ve_foto(id));

revoke insert, update, delete, truncate on public.gremio_rubros, public.partes_avance, public.reclamos, public.reclamo_mensajes, public.fotos from anon, authenticated;
revoke select on public.gremio_rubros, public.partes_avance, public.reclamos, public.reclamo_mensajes, public.fotos from anon;
grant select on public.gremio_rubros, public.partes_avance, public.reclamos, public.reclamo_mensajes, public.fotos to authenticated;

-- Almacenamiento: el gremio sube en las obras donde trabaja y lee sólo lo que puede ver.
drop policy if exists controlar_adjuntos_leer on storage.objects;
drop policy if exists controlar_adjuntos_subir on storage.objects;
create policy controlar_adjuntos_leer on storage.objects for select to authenticated
  using (bucket_id = 'adjuntos' and public.puede_leer_archivo(name));
create policy controlar_adjuntos_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'adjuntos' and (public.puede_ver_obra(public._obra_de_ruta(name)) or public.gremio_en_obra(public._obra_de_ruta(name))));

-- ── Funciones ───────────────────────────────────────────────────────────────
-- Registrar adjunto: ahora también para gremios en sus obras.
create or replace function public.registrar_adjunto(p_obra bigint, p_ruta text, p_nombre text, p_mime text, p_tamano bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not (puede_ver_obra(p_obra) or gremio_en_obra(p_obra)) then perform _error('No tenés acceso a esta obra o no existe'); end if;
  if _obra_de_ruta(p_ruta) is distinct from p_obra then perform _error('Ruta de adjunto inválida'); end if;
  if not exists (select 1 from storage.objects where bucket_id = 'adjuntos' and name = p_ruta) then perform _error('El archivo no se subió'); end if;
  if p_mime not in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf') then perform _error('Formato no admitido'); end if;
  insert into adjuntos (obra_id, ruta, nombre, mime, tamano, subido_por)
  values (p_obra, p_ruta, left(coalesce(nullif(trim(p_nombre), ''), 'archivo'), 200), p_mime, p_tamano, auth.uid())
  on conflict (ruta) do update set nombre = excluded.nombre
  returning id into v_id;
  return v_id;
end $$;

-- Vincula fotos ya subidas (adjuntos) a un parte / reclamo / galería. Sólo imágenes propias de esa obra.
create or replace function public._vincular_fotos(p_obra bigint, p_rubro bigint, p_fotos jsonb, p_fecha date, p_desc text,
  p_parte bigint default null, p_reclamo bigint default null, p_mensaje bigint default null) returns int
language plpgsql security definer set search_path = public as $$
declare x jsonb; v_adj adjuntos; n int := 0;
begin
  for x in select * from jsonb_array_elements(coalesce(p_fotos, '[]'::jsonb)) loop
    select * into v_adj from adjuntos where id = (x #>> '{}')::bigint;
    if v_adj.id is null or v_adj.obra_id <> p_obra or v_adj.subido_por is distinct from auth.uid() then perform _error('Foto inválida'); end if;
    if v_adj.mime not like 'image/%' then perform _error('Sólo se admiten fotos (JPG, PNG, WEBP, HEIC)'); end if;
    insert into fotos (obra_id, rubro_id, adjunto_id, descripcion, fecha, parte_id, reclamo_id, mensaje_id, creado_por)
    values (p_obra, p_rubro, v_adj.id, p_desc, p_fecha, p_parte, p_reclamo, p_mensaje, auth.uid());
    n := n + 1;
  end loop;
  return n;
end $$;

-- Galería: la empresa agrega fotos de la obra (opcionalmente de un rubro).
create or replace function public.agregar_fotos(p_obra bigint, p jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare v_rubro bigint := nullif(p ->> 'rubro_id', '')::bigint; v_fecha date; n int;
begin
  if not puede_ver_obra(p_obra) then perform _error('No tenés acceso a esta obra o no existe'); end if;
  if v_rubro is not null and not exists (select 1 from rubros where id = v_rubro and obra_id = p_obra) then perform _error('El rubro no pertenece a esta obra'); end if;
  v_fecha := coalesce(nullif(p ->> 'fecha', '')::date, (now() at time zone 'America/Argentina/Buenos_Aires')::date);
  if jsonb_array_length(coalesce(p -> 'fotos', '[]'::jsonb)) = 0 then perform _error('Elegí al menos una foto'); end if;
  n := _vincular_fotos(p_obra, v_rubro, p -> 'fotos', v_fecha, _texto_opt(p, 'descripcion', 500));
  perform _auditar(p_obra, 'fotos', p_obra, 'alta', null, jsonb_build_object('cantidad', n, 'rubro_id', v_rubro));
  return n;
end $$;

-- Parte de avance del gremio: queda pendiente hasta que la empresa lo revisa.
create or replace function public.crear_parte_avance(p_rubro bigint, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r rubros; v_id bigint; v_pct double precision; v_fecha date; v_clave text := nullif(p ->> 'clave_idem', '');
begin
  select * into r from rubros where id = p_rubro;
  if not found or not gremio_en_rubro(p_rubro) then perform _error('No tenés asignado ese rubro'); end if;
  if v_clave is not null then
    select id into v_id from partes_avance where clave_idem = v_clave and creado_por = auth.uid();
    if found then return jsonb_build_object('id', v_id, 'duplicado', true); end if;
  end if;
  v_fecha := _fecha(p ->> 'fecha', 'Fecha');
  begin v_pct := (p ->> 'porcentaje')::double precision; exception when others then v_pct := null; end;
  if v_pct is null or v_pct < 0 or v_pct > 100 then perform _error('El avance debe ser un porcentaje entre 0 y 100'); end if;
  insert into partes_avance (obra_id, rubro_id, fecha, porcentaje, comentario, clave_idem, creado_por)
  values (r.obra_id, p_rubro, v_fecha, v_pct, _texto_opt(p, 'comentario', 1000), v_clave, auth.uid())
  returning id into v_id;
  perform _vincular_fotos(r.obra_id, p_rubro, p -> 'fotos', v_fecha, _texto_opt(p, 'comentario', 500), v_id);
  perform _auditar(r.obra_id, 'parte_avance', v_id, 'alta', null, jsonb_build_object('rubro_id', p_rubro, 'porcentaje', v_pct, 'fecha', v_fecha));
  return jsonb_build_object('id', v_id);
end $$;

-- Revisión de la empresa: aprobar crea el avance oficial; rechazar exige motivo.
create or replace function public.revisar_parte(p_parte bigint, p_aprobar boolean, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pa partes_avance; v_av jsonb; v_m text := left(nullif(trim(p_motivo), ''), 500); v_quien text;
begin
  select * into pa from partes_avance where id = p_parte for update;
  if not found or not puede_ver_obra(pa.obra_id) then perform _error('Parte inexistente o sin acceso'); end if;
  if pa.estado <> 'pendiente' then perform _error('Ese parte ya fue revisado'); end if;
  if not p_aprobar then
    if v_m is null then perform _error('Indicá el motivo del rechazo'); end if;
    update partes_avance set estado = 'rechazado', motivo_revision = v_m, revisado_por = auth.uid(), revisado_en = now() where id = p_parte;
    perform _auditar(pa.obra_id, 'parte_avance', p_parte, 'rechazo', null, null, v_m);
    return jsonb_build_object('estado', 'rechazado');
  end if;
  select nombre into v_quien from perfiles where id = pa.creado_por;
  -- Usa la misma regla de avance oficial (vecinos en el tiempo, motivo si baja).
  v_av := cargar_avance(pa.rubro_id, jsonb_build_object('fecha', pa.fecha, 'porcentaje', pa.porcentaje,
    'comentario', concat('Parte de avance de ', coalesce(v_quien, 'gremio'), nullif(concat(': ', pa.comentario), ': ')),
    'motivo_baja', v_m));
  update partes_avance set estado = 'aprobado', motivo_revision = v_m, revisado_por = auth.uid(), revisado_en = now(),
    avance_id = (v_av ->> 'id')::bigint where id = p_parte;
  perform _auditar(pa.obra_id, 'parte_avance', p_parte, 'aprobacion', null, v_av, v_m);
  return jsonb_build_object('estado', 'aprobado', 'avance_id', (v_av ->> 'id')::bigint);
end $$;

-- Reclamos: el gremio reclama a la empresa (sobre sus rubros); la empresa reclama a un gremio de la obra.
create or replace function public.crear_reclamo(p_obra bigint, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_rubro bigint := nullif(p ->> 'rubro_id', '')::bigint; v_dir text; v_gremio uuid; v_id bigint; v_clave text := nullif(p ->> 'clave_idem', '');
begin
  if v_clave is not null then
    select id into v_id from reclamos where clave_idem = v_clave and creado_por = auth.uid();
    if found then return jsonb_build_object('id', v_id, 'duplicado', true); end if;
  end if;
  if puede_ver_obra(p_obra) then
    v_dir := 'empresa_a_gremio';
    v_gremio := nullif(p ->> 'gremio_id', '')::uuid;
    if v_gremio is null or not exists (select 1 from gremio_rubros gr join perfiles pf on pf.id = gr.usuario_id
        where gr.usuario_id = v_gremio and gr.obra_id = p_obra and pf.rol = 'gremio') then
      perform _error('Elegí un gremio asignado a esta obra');
    end if;
    if v_rubro is not null and not exists (select 1 from rubros where id = v_rubro and obra_id = p_obra) then perform _error('El rubro no pertenece a esta obra'); end if;
  elsif gremio_en_obra(p_obra) then
    v_dir := 'gremio_a_empresa';
    v_gremio := auth.uid();
    if v_rubro is null or not gremio_en_rubro(v_rubro) then perform _error('Elegí uno de tus rubros'); end if;
  else
    perform _error('No tenés acceso a esta obra o no existe');
  end if;
  insert into reclamos (obra_id, rubro_id, titulo, descripcion, direccion, gremio_id, clave_idem, creado_por)
  values (p_obra, v_rubro, _texto(p, 'titulo', 'Título del reclamo', 120), _texto_opt(p, 'descripcion', 2000), v_dir, v_gremio, v_clave, auth.uid())
  returning id into v_id;
  perform _vincular_fotos(p_obra, v_rubro, p -> 'fotos', (now() at time zone 'America/Argentina/Buenos_Aires')::date,
    _texto_opt(p, 'titulo', 200), null, v_id);
  perform _auditar(p_obra, 'reclamo', v_id, 'alta', null, jsonb_build_object('direccion', v_dir, 'titulo', p ->> 'titulo'));
  return jsonb_build_object('id', v_id);
end $$;

-- Respuesta / cambio de estado. Ambas partes pueden escribir y cambiar el estado; todo queda en la conversación.
create or replace function public.responder_reclamo(p_reclamo bigint, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r reclamos; v_txt text := _texto_opt(p, 'texto', 2000); v_estado text := nullif(p ->> 'estado', ''); v_msg bigint;
begin
  select * into r from reclamos where id = p_reclamo for update;
  if not found or not ve_reclamo(p_reclamo) then perform _error('Reclamo inexistente o sin acceso'); end if;
  if v_estado is not null and v_estado not in ('abierto', 'en_curso', 'resuelto') then perform _error('Estado inválido'); end if;
  if v_estado = r.estado then v_estado := null; end if;
  if v_txt is null and v_estado is null and jsonb_array_length(coalesce(p -> 'fotos', '[]'::jsonb)) = 0 then
    perform _error('Escribí una respuesta, adjuntá una foto o cambiá el estado');
  end if;
  insert into reclamo_mensajes (reclamo_id, texto, estado_nuevo, creado_por) values (p_reclamo, v_txt, v_estado, auth.uid())
  returning id into v_msg;
  perform _vincular_fotos(r.obra_id, r.rubro_id, p -> 'fotos', (now() at time zone 'America/Argentina/Buenos_Aires')::date, v_txt, null, p_reclamo, v_msg);
  update reclamos set estado = coalesce(v_estado, estado), actualizado_en = now() where id = p_reclamo;
  return jsonb_build_object('mensaje_id', v_msg, 'estado', coalesce(v_estado, r.estado));
end $$;

-- Asignación de rubros a un gremio (administrador). p_rubros: ids de rubros (pueden ser de varias obras).
create or replace function public.asignar_rubros_gremio(p_usuario uuid, p_rubros jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare x jsonb; n int := 0; v_obra bigint;
begin
  perform _exigir_admin();
  if not exists (select 1 from perfiles where id = p_usuario and rol = 'gremio') then perform _error('El usuario no es un gremio'); end if;
  delete from gremio_rubros where usuario_id = p_usuario;
  for x in select * from jsonb_array_elements(coalesce(p_rubros, '[]'::jsonb)) loop
    select obra_id into v_obra from rubros where id = (x #>> '{}')::bigint;
    if v_obra is null then perform _error('Rubro inexistente'); end if;
    insert into gremio_rubros (usuario_id, obra_id, rubro_id) values (p_usuario, v_obra, (x #>> '{}')::bigint) on conflict do nothing;
    n := n + 1;
  end loop;
  perform _auditar(null, 'usuario', 0, 'rubros_gremio', null, jsonb_build_object('usuario', p_usuario, 'rubros', p_rubros));
  return n;
end $$;

-- Nombres para mostrar quién escribió (también para gremios; sin emails).
create or replace function public.directorio() returns table (id uuid, nombre text)
language sql stable security definer set search_path = public as $$
  select p.id, p.nombre from perfiles p
  where (public.es_usuario_activo() or public.es_gremio()) and p.rol in ('admin', 'encargado', 'gremio');
$$;

-- ── Permisos de ejecución ───────────────────────────────────────────────────
revoke execute on function public.es_gremio(), public.gremio_en_obra(bigint), public.gremio_en_rubro(bigint), public.ve_reclamo(bigint),
  public.ve_foto(bigint), public.puede_leer_archivo(text), public._vincular_fotos(bigint, bigint, jsonb, date, text, bigint, bigint, bigint),
  public.agregar_fotos(bigint, jsonb), public.crear_parte_avance(bigint, jsonb), public.revisar_parte(bigint, boolean, text),
  public.crear_reclamo(bigint, jsonb), public.responder_reclamo(bigint, jsonb), public.asignar_rubros_gremio(uuid, jsonb),
  public.registrar_adjunto(bigint, text, text, text, bigint), public.directorio()
  from public, anon;
grant execute on function public.es_gremio(), public.gremio_en_obra(bigint), public.gremio_en_rubro(bigint), public.ve_reclamo(bigint),
  public.ve_foto(bigint), public.puede_leer_archivo(text),
  public.agregar_fotos(bigint, jsonb), public.crear_parte_avance(bigint, jsonb), public.revisar_parte(bigint, boolean, text),
  public.crear_reclamo(bigint, jsonb), public.responder_reclamo(bigint, jsonb), public.asignar_rubros_gremio(uuid, jsonb),
  public.registrar_adjunto(bigint, text, text, text, bigint), public.directorio()
  to authenticated;
revoke execute on function public._vincular_fotos(bigint, bigint, jsonb, date, text, bigint, bigint, bigint) from authenticated;
