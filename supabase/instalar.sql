-- ControlAr · instalación completa en Supabase (ejecutar UNA sola vez en un proyecto nuevo)
-- 1) Reemplazá TU-EMAIL@EJEMPLO.COM (al final) por el email de quien va a administrar la app.
-- 2) Pegá todo en Supabase → SQL Editor → Run.
-- Generado por: npm run sql

-- ════════ 001_esquema.sql ════════
-- ControlAr · 001 · Esquema
-- Importes en CENTAVOS (bigint). Cotizaciones en ARS por 1 USD (double precision).
-- Nada se borra: los movimientos se anulan y toda corrección queda en auditoria.

create table public.perfiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  nombre     text not null default '',
  rol        text not null default 'pendiente' check (rol in ('pendiente', 'encargado', 'admin')),
  activo     boolean not null default true,
  creado_en  timestamptz not null default now()
);

-- Configuración interna (p. ej. admin_email). No es legible desde la app.
create table public.configuracion (
  clave text primary key,
  valor text
);

create table public.obras (
  id                bigint generated always as identity primary key,
  nombre            text not null,
  ubicacion         text,
  fecha_inicio      date not null,
  estado            text not null default 'en_curso' check (estado in ('planificada', 'en_curso', 'pausada', 'finalizada')),
  cotizacion_manual double precision check (cotizacion_manual is null or cotizacion_manual > 0),
  creado_por        uuid references public.perfiles(id),
  creado_en         timestamptz not null default now()
);

create table public.obra_usuarios (
  obra_id    bigint not null references public.obras(id) on delete cascade,
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  primary key (obra_id, usuario_id)
);

create table public.rubros_catalogo (
  id     bigint generated always as identity primary key,
  nombre text not null,
  orden  int not null default 100
);
create unique index rubros_catalogo_nombre on public.rubros_catalogo (lower(nombre));

create table public.rubros (
  id      bigint generated always as identity primary key,
  obra_id bigint not null references public.obras(id),
  nombre  text not null,
  orden   int not null default 100,
  peso    double precision check (peso is null or (peso >= 0 and peso <= 100)),
  activo  boolean not null default true
);
create unique index rubros_obra_nombre on public.rubros (obra_id, lower(nombre));

create table public.tipos_gasto (
  id      bigint generated always as identity primary key,
  nombre  text not null,
  sistema boolean not null default false,
  orden   int not null default 100
);
create unique index tipos_gasto_nombre on public.tipos_gasto (lower(nombre));

create table public.proveedores (
  id     bigint generated always as identity primary key,
  nombre text not null
);
create unique index proveedores_nombre on public.proveedores (lower(nombre));

-- Cotización BNA dólar billete VENTA cargada a mano por el administrador.
-- Historial preservado: corregir una fecha deja la fila anterior con vigente = false.
create table public.cotizaciones (
  id         bigint generated always as identity primary key,
  fecha      date not null,
  venta      double precision not null check (venta > 0),
  fuente     text not null default 'BNA dólar billete venta (carga manual)',
  vigente    boolean not null default true,
  motivo     text,
  cargado_por uuid references public.perfiles(id),
  cargado_en timestamptz not null default now()
);
create unique index cotizaciones_fecha_vigente on public.cotizaciones (fecha) where vigente;

create table public.adjuntos (
  id         bigint generated always as identity primary key,
  obra_id    bigint not null references public.obras(id),
  ruta       text not null unique,          -- ruta en el bucket 'adjuntos': obra-<id>/<uuid>.<ext>
  nombre     text not null,
  mime       text not null,
  tamano     bigint not null,
  subido_por uuid references public.perfiles(id),
  subido_en  timestamptz not null default now()
);

-- Columnas de cotización (snapshot al cargar): cot_valor, cot_fecha (fecha efectiva), cot_fuente, cot_estado ('ok'|'pendiente')
create table public.presupuestos (
  id            bigint generated always as identity primary key,
  obra_id       bigint not null references public.obras(id),
  rubro_id      bigint not null references public.rubros(id),
  version       int not null,
  moneda        text not null check (moneda in ('ARS', 'USD')),
  importe       bigint not null check (importe >= 0),
  fecha_ref     date not null,
  vigente_desde date not null,
  motivo        text,
  cot_valor double precision, cot_fecha date, cot_fuente text, cot_estado text not null,
  creado_por    uuid references public.perfiles(id),
  creado_en     timestamptz not null default now(),
  unique (rubro_id, version)
);

create table public.compromisos (
  id             bigint generated always as identity primary key,
  obra_id        bigint not null references public.obras(id),
  rubro_id       bigint not null references public.rubros(id),
  tipo_id        bigint not null references public.tipos_gasto(id),
  proveedor_id   bigint references public.proveedores(id),
  fecha          date not null,
  concepto       text not null,
  moneda         text not null check (moneda in ('ARS', 'USD')),
  importe        bigint not null check (importe > 0),
  condicion      text not null check (condicion in ('contado', 'a_cuenta', 'contrato')),
  vencimiento    date,
  adjunto_id     bigint references public.adjuntos(id),
  cot_valor double precision, cot_fecha date, cot_fuente text, cot_estado text not null,
  anulado        boolean not null default false,
  anulado_motivo text,
  clave_idem     text unique,
  clave_hash     text,
  creado_por     uuid references public.perfiles(id),
  creado_en      timestamptz not null default now(),
  modificado_en  timestamptz
);
create index compromisos_obra on public.compromisos (obra_id, fecha);

create table public.pagos (
  id                bigint generated always as identity primary key,
  obra_id           bigint not null references public.obras(id),
  compromiso_id     bigint not null references public.compromisos(id),
  fecha             date not null,
  moneda_pago       text not null check (moneda_pago in ('ARS', 'USD')),
  importe_pagado    bigint not null check (importe_pagado > 0),     -- dinero entregado (moneda_pago)
  importe_cancelado bigint not null check (importe_cancelado > 0),  -- lo que cancela en la moneda del compromiso
  tc_cancelacion    double precision,                                -- ARS por USD pactado (si las monedas difieren)
  es_anticipo       boolean not null default false,
  nota              text,
  adjunto_id        bigint references public.adjuntos(id),
  cot_valor double precision, cot_fecha date, cot_fuente text, cot_estado text not null,
  anulado           boolean not null default false,
  anulado_motivo    text,
  clave_idem        text unique,
  clave_hash        text,
  creado_por        uuid references public.perfiles(id),
  creado_en         timestamptz not null default now(),
  modificado_en     timestamptz
);
create index pagos_obra on public.pagos (obra_id, fecha);
create index pagos_compromiso on public.pagos (compromiso_id);

create table public.avances (
  id             bigint generated always as identity primary key,
  obra_id        bigint not null references public.obras(id),
  rubro_id       bigint not null references public.rubros(id),
  fecha          date not null,
  porcentaje     double precision not null check (porcentaje >= 0 and porcentaje <= 100),
  comentario     text,
  motivo_baja    text,
  adjunto_id     bigint references public.adjuntos(id),
  anulado        boolean not null default false,
  anulado_motivo text,
  clave_idem     text unique,
  clave_hash     text,
  creado_por     uuid references public.perfiles(id),
  creado_en      timestamptz not null default now()
);
create index avances_obra on public.avances (obra_id, rubro_id, fecha);

create table public.auditoria (
  id         bigint generated always as identity primary key,
  obra_id    bigint,
  entidad    text not null,
  entidad_id bigint not null,
  accion     text not null,
  usuario_id uuid,
  fecha      timestamptz not null default now(),
  antes      jsonb,
  despues    jsonb,
  motivo     text
);
create index auditoria_entidad on public.auditoria (entidad, entidad_id);
create index auditoria_obra on public.auditoria (obra_id);

insert into public.rubros_catalogo (nombre, orden) values
  ('Movimiento de suelo', 1), ('Estructura', 2), ('Albañilería', 3), ('Instalación sanitaria', 4),
  ('Electricidad', 5), ('Carpintería', 6), ('Pintura', 7), ('Terminaciones', 8);

insert into public.tipos_gasto (nombre, sistema, orden) values
  ('Materiales', true, 1), ('Mano de obra', true, 2), ('Subcontratos', true, 3), ('Alquileres', true, 4),
  ('Fletes', true, 5), ('Permisos', true, 6);

-- ════════ 002_seguridad.sql ════════
-- ControlAr · 002 · Usuarios, permisos y seguridad a nivel de fila (RLS)
-- Lectura: RLS por obra. Escritura: SOLO mediante funciones (003) que validan reglas y permisos.

-- ── Ayudantes de permisos ────────────────────────────────────────────────────
create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles where id = auth.uid() and rol = 'admin' and activo);
$$;

create or replace function public.es_usuario_activo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles where id = auth.uid() and rol in ('admin', 'encargado') and activo);
$$;

create or replace function public.puede_ver_obra(p_obra bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select public.es_admin() or exists (
    select 1 from obra_usuarios ou join perfiles p on p.id = ou.usuario_id
    where ou.obra_id = p_obra and ou.usuario_id = auth.uid() and p.activo and p.rol = 'encargado');
$$;

-- ── Alta automática de perfil al registrarse ─────────────────────────────────
-- Queda 'pendiente' (sin acceso a nada) hasta que el administrador lo habilite.
-- El email configurado en configuracion.admin_email se crea directamente como administrador.
create or replace function public._nuevo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfiles (id, email, nombre, rol)
  values (new.id, lower(new.email), coalesce(nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''), split_part(new.email, '@', 1)),
          case when lower(new.email) = (select lower(valor) from configuracion where clave = 'admin_email') then 'admin' else 'pendiente' end)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists controlar_nuevo_usuario on auth.users;
create trigger controlar_nuevo_usuario after insert on auth.users
  for each row execute function public._nuevo_usuario();

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.perfiles        enable row level security;
alter table public.configuracion   enable row level security;
alter table public.obras           enable row level security;
alter table public.obra_usuarios   enable row level security;
alter table public.rubros_catalogo enable row level security;
alter table public.rubros          enable row level security;
alter table public.tipos_gasto     enable row level security;
alter table public.proveedores     enable row level security;
alter table public.cotizaciones    enable row level security;
alter table public.adjuntos        enable row level security;
alter table public.presupuestos    enable row level security;
alter table public.compromisos     enable row level security;
alter table public.pagos           enable row level security;
alter table public.avances         enable row level security;
alter table public.auditoria       enable row level security;

create policy perfiles_leer on public.perfiles for select to authenticated
  using (id = auth.uid() or public.es_admin());
create policy obras_leer on public.obras for select to authenticated
  using (public.puede_ver_obra(id));
create policy obra_usuarios_leer on public.obra_usuarios for select to authenticated
  using (public.es_admin() or usuario_id = auth.uid());
create policy catalogo_leer on public.rubros_catalogo for select to authenticated using (public.es_usuario_activo());
create policy tipos_leer on public.tipos_gasto for select to authenticated using (public.es_usuario_activo());
create policy proveedores_leer on public.proveedores for select to authenticated using (public.es_usuario_activo());
create policy cotizaciones_leer on public.cotizaciones for select to authenticated using (public.es_usuario_activo());
create policy rubros_leer on public.rubros for select to authenticated using (public.puede_ver_obra(obra_id));
create policy adjuntos_leer on public.adjuntos for select to authenticated using (public.puede_ver_obra(obra_id));
create policy presupuestos_leer on public.presupuestos for select to authenticated using (public.puede_ver_obra(obra_id));
create policy compromisos_leer on public.compromisos for select to authenticated using (public.puede_ver_obra(obra_id));
create policy pagos_leer on public.pagos for select to authenticated using (public.puede_ver_obra(obra_id));
create policy avances_leer on public.avances for select to authenticated using (public.puede_ver_obra(obra_id));
create policy auditoria_leer on public.auditoria for select to authenticated
  using (public.es_admin() or (obra_id is not null and public.puede_ver_obra(obra_id)));
-- configuracion: sin políticas => nadie la lee desde la app.

-- Sin permisos de escritura directa: todo pasa por las funciones.
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
revoke select on all tables in schema public from anon;
grant select on all tables in schema public to authenticated;

-- ════════ 003_funciones.sql ════════
-- ControlAr · 003 · Reglas de negocio (funciones RPC)
-- Todas las escrituras pasan por estas funciones SECURITY DEFINER, que validan permisos y reglas
-- en el servidor de base de datos. La app sólo puede leer (RLS) y llamar a estas funciones.

-- ── Utilidades internas ─────────────────────────────────────────────────────
create or replace function public._error(p_msg text) returns void language plpgsql as $$
begin raise exception using message = p_msg, errcode = 'P0001'; end $$;

create or replace function public._fmt(p_cents bigint, p_moneda text) returns text language sql immutable as $$
  select p_moneda || ' ' || translate(to_char(p_cents / 100.0, 'FM999,999,999,999,990.00'), ',.', '.,');
$$;

create or replace function public._texto(p jsonb, k text, campo text, max int default 300) returns text language plpgsql as $$
declare v text := nullif(trim(p ->> k), '');
begin
  if v is null then perform _error(campo || ' es obligatorio'); end if;
  return left(v, max);
end $$;

create or replace function public._texto_opt(p jsonb, k text, max int default 1000) returns text language sql immutable as $$
  select left(nullif(trim(p ->> k), ''), max);
$$;

create or replace function public._fecha(p_txt text, campo text) returns date language plpgsql as $$
begin
  if p_txt is null or p_txt !~ '^\d{4}-\d{2}-\d{2}$' then perform _error(campo || ': fecha inválida'); end if;
  return p_txt::date;
exception when others then
  raise exception using message = campo || ': fecha inválida', errcode = 'P0001';
end $$;

create or replace function public._cents(p_txt text, campo text, cero boolean default false) returns bigint language plpgsql as $$
declare v bigint;
begin
  if p_txt is null or p_txt !~ '^\d{1,15}$' then perform _error(campo || ': importe inválido'); end if;
  v := p_txt::bigint;
  if v = 0 and not cero then perform _error(campo || ': importe inválido'); end if;
  return v;
end $$;

create or replace function public._moneda(p_txt text) returns text language plpgsql as $$
begin
  if p_txt is null or p_txt not in ('ARS', 'USD') then perform _error('Moneda inválida (ARS o USD)'); end if;
  return p_txt;
end $$;

create or replace function public._auditar(p_obra bigint, p_entidad text, p_id bigint, p_accion text,
  p_antes jsonb default null, p_despues jsonb default null, p_motivo text default null) returns void
language sql security definer set search_path = public as $$
  insert into auditoria (obra_id, entidad, entidad_id, accion, usuario_id, antes, despues, motivo)
  values (p_obra, p_entidad, p_id, p_accion, auth.uid(), p_antes, p_despues, p_motivo);
$$;

create or replace function public._exigir_activo() returns void language plpgsql security definer set search_path = public as $$
begin
  if not es_usuario_activo() then perform _error('Tu usuario no está habilitado. Pedile acceso al administrador.'); end if;
end $$;

create or replace function public._exigir_admin() returns void language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() then perform _error('Acción reservada al administrador'); end if;
end $$;

create or replace function public._exigir_obra(p_obra bigint) returns void language plpgsql security definer set search_path = public as $$
begin
  -- Mismo mensaje en ambos casos: no revela qué obras existen.
  if not exists (select 1 from obras where id = p_obra) or not puede_ver_obra(p_obra) then
    perform _error('No tenés acceso a esta obra o no existe');
  end if;
end $$;

-- ── Cotizaciones ────────────────────────────────────────────────────────────
-- Snapshot para un registro. Regla: si la tabla todavía no tiene ninguna cotización con fecha >= la pedida,
-- no se sabe si ese día hubo publicación => 'pendiente'. Si la tabla cubre la fecha, se toma la publicada
-- ese día o la última anterior (día sin publicación) e informa la fecha efectiva.
create or replace function public._cot(p_fecha date) returns jsonb language sql stable security definer set search_path = public as $$
  select case
    when not exists (select 1 from cotizaciones where vigente and fecha >= p_fecha)
      then jsonb_build_object('cot_valor', null, 'cot_fecha', null, 'cot_fuente', null, 'cot_estado', 'pendiente')
    else coalesce(
      (select jsonb_build_object('cot_valor', venta, 'cot_fecha', fecha, 'cot_fuente', fuente, 'cot_estado', 'ok')
         from cotizaciones where vigente and fecha <= p_fecha order by fecha desc limit 1),
      jsonb_build_object('cot_valor', null, 'cot_fecha', null, 'cot_fuente', null, 'cot_estado', 'pendiente'))
  end;
$$;

create or replace function public.cotizacion_para(p_fecha date) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform _exigir_activo();
  return _cot(p_fecha);
end $$;

-- Completa los registros con cotización pendiente (sin duplicarlos). Se ejecuta al cargar cotizaciones.
create or replace function public._completar_cotizaciones() returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; m int; r record; c jsonb;
begin
  for r in select 'compromisos' t, id, fecha f, obra_id from compromisos where cot_estado = 'pendiente'
     union all select 'pagos', id, fecha, obra_id from pagos where cot_estado = 'pendiente'
     union all select 'presupuestos', id, fecha_ref, obra_id from presupuestos where cot_estado = 'pendiente'
  loop
    c := _cot(r.f);
    if c ->> 'cot_estado' = 'ok' then
      execute format('update %I set cot_valor = $1, cot_fecha = $2, cot_fuente = $3, cot_estado = ''ok'' where id = $4 and cot_estado = ''pendiente''', r.t)
        using (c ->> 'cot_valor')::double precision, (c ->> 'cot_fecha')::date, c ->> 'cot_fuente', r.id;
      get diagnostics m = row_count;
      if m > 0 then
        n := n + 1;
        perform _auditar(r.obra_id, rtrim(r.t, 's'), r.id, 'cotizacion_completada', null, c);
      end if;
    end if;
  end loop;
  return n;
end $$;

-- Re-toma la cotización de los registros con fecha >= p_fecha que quedaron con una de fecha anterior a p_fecha.
create or replace function public._resnapshot_desde(p_fecha date) returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; r record; c jsonb;
begin
  for r in select 'compromisos' t, id, fecha f, obra_id, cot_valor, cot_fecha from compromisos where cot_estado = 'ok' and cot_fecha < p_fecha and fecha >= p_fecha
     union all select 'pagos', id, fecha, obra_id, cot_valor, cot_fecha from pagos where cot_estado = 'ok' and cot_fecha < p_fecha and fecha >= p_fecha
     union all select 'presupuestos', id, fecha_ref, obra_id, cot_valor, cot_fecha from presupuestos where cot_estado = 'ok' and cot_fecha < p_fecha and fecha_ref >= p_fecha
  loop
    c := _cot(r.f);
    if c ->> 'cot_estado' = 'ok' and (c ->> 'cot_fecha')::date is distinct from r.cot_fecha then
      execute format('update %I set cot_valor = $1, cot_fecha = $2, cot_fuente = $3 where id = $4', r.t)
        using (c ->> 'cot_valor')::double precision, (c ->> 'cot_fecha')::date, c ->> 'cot_fuente', r.id;
      perform _auditar(r.obra_id, rtrim(r.t, 's'), r.id, 'cotizacion_actualizada',
        jsonb_build_object('cot_valor', r.cot_valor, 'cot_fecha', r.cot_fecha), c, 'Se cargó la cotización de una fecha que faltaba');
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- Carga (o corrige) la cotización de una fecha. Corregir exige motivo y conserva la versión anterior.
-- p_reaplicar: actualiza los movimientos que habían tomado el valor anterior de esa fecha (corrección de tipeo).
create or replace function public.cargar_cotizacion(p_fecha date, p_venta double precision, p_motivo text default null, p_reaplicar boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ant cotizaciones; v_id bigint; v_completadas int; v_reapl int := 0; m int;
begin
  perform _exigir_admin();
  if p_fecha is null then perform _error('Fecha inválida'); end if;
  if p_venta is null or p_venta <= 0 then perform _error('La cotización debe ser un número positivo (ARS por USD)'); end if;
  select * into v_ant from cotizaciones where fecha = p_fecha and vigente;
  if found then
    if v_ant.venta = p_venta then return jsonb_build_object('id', v_ant.id, 'sin_cambios', true); end if;
    if nullif(trim(p_motivo), '') is null then perform _error('Ya hay una cotización para esa fecha: indicá el motivo de la corrección'); end if;
    update cotizaciones set vigente = false where id = v_ant.id;
  end if;
  insert into cotizaciones (fecha, venta, motivo, cargado_por) values (p_fecha, p_venta, nullif(trim(p_motivo), ''), auth.uid())
  returning id into v_id;
  perform _auditar(null, 'cotizacion', v_id, case when v_ant.id is null then 'alta' else 'correccion' end,
    to_jsonb(v_ant), jsonb_build_object('fecha', p_fecha, 'venta', p_venta), p_motivo);
  if v_ant.id is not null and p_reaplicar then
    update compromisos set cot_valor = p_venta where cot_fecha = p_fecha and cot_valor = v_ant.venta; get diagnostics m = row_count; v_reapl := v_reapl + m;
    update pagos set cot_valor = p_venta where cot_fecha = p_fecha and cot_valor = v_ant.venta; get diagnostics m = row_count; v_reapl := v_reapl + m;
    update presupuestos set cot_valor = p_venta where cot_fecha = p_fecha and cot_valor = v_ant.venta; get diagnostics m = row_count; v_reapl := v_reapl + m;
  end if;
  -- Fecha intermedia que faltaba: los registros de esa fecha en adelante que habían tomado una cotización
  -- anterior pasan a usar la que corresponde ("la de su fecha o la última anterior").
  if v_ant.id is null then
    v_reapl := v_reapl + _resnapshot_desde(p_fecha);
  end if;
  v_completadas := _completar_cotizaciones();
  return jsonb_build_object('id', v_id, 'completadas', v_completadas, 'reaplicadas', v_reapl);
end $$;

-- ── Usuarios ────────────────────────────────────────────────────────────────
create or replace function public.actualizar_usuario(p_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v perfiles; o jsonb;
begin
  perform _exigir_admin();
  select * into v from perfiles where id = p_id;
  if not found then perform _error('Usuario inexistente'); end if;
  if p ? 'rol' then
    if p ->> 'rol' not in ('pendiente', 'encargado', 'admin', 'gremio') then perform _error('Rol inválido'); end if;
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

-- ── Obras y rubros ──────────────────────────────────────────────────────────
create or replace function public._crear_rubro(p_obra bigint, p_nombre text, p_orden int default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare v rubros; v_id bigint;
begin
  select * into v from rubros where obra_id = p_obra and lower(nombre) = lower(p_nombre);
  if found then
    if not v.activo then
      -- Reactivar es decisión del administrador; el peso se vuelve a definir (evita superar 100 %).
      if not es_admin() then perform _error(format('El rubro "%s" está desactivado: pedile al administrador que lo reactive', v.nombre)); end if;
      update rubros set activo = true, peso = null where id = v.id;
    end if;
    return v.id;
  end if;
  insert into rubros (obra_id, nombre, orden)
  values (p_obra, p_nombre, coalesce(p_orden, (select coalesce(max(orden), 0) + 1 from rubros where obra_id = p_obra)))
  returning id into v_id;
  insert into rubros_catalogo (nombre) values (p_nombre) on conflict do nothing;
  return v_id;
end $$;

create or replace function public.crear_obra(p jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_nombre text; v_estado text; r text; i int := 0; u jsonb;
begin
  perform _exigir_admin();
  v_nombre := _texto(p, 'nombre', 'Nombre de la obra', 120);
  v_estado := coalesce(p ->> 'estado', 'en_curso');
  if v_estado not in ('planificada', 'en_curso', 'pausada', 'finalizada') then perform _error('Estado inválido'); end if;
  insert into obras (nombre, ubicacion, fecha_inicio, estado, creado_por)
  values (v_nombre, _texto_opt(p, 'ubicacion', 200), _fecha(p ->> 'fecha_inicio', 'Fecha de inicio'), v_estado, auth.uid())
  returning id into v_id;
  for r in select v from (
      select distinct on (lower(trim(x))) trim(x) v, ord
      from jsonb_array_elements_text(coalesce(p -> 'rubros', '[]')) with ordinality t(x, ord)
      where trim(x) <> '' order by lower(trim(x)), ord) s
    order by ord loop
    i := i + 1;
    perform _crear_rubro(v_id, left(r, 80), i);
  end loop;
  for u in select * from jsonb_array_elements(coalesce(p -> 'encargados', '[]')) loop
    insert into obra_usuarios (obra_id, usuario_id) values (v_id, (u #>> '{}')::uuid) on conflict do nothing;
  end loop;
  perform _auditar(v_id, 'obra', v_id, 'alta', null, p);
  return v_id;
end $$;

create or replace function public.actualizar_obra(p_id bigint, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v obras; u jsonb;
begin
  perform _exigir_admin();
  select * into v from obras where id = p_id;
  if not found then perform _error('Obra inexistente'); end if;
  update obras set
    nombre = case when p ? 'nombre' then _texto(p, 'nombre', 'Nombre', 120) else nombre end,
    ubicacion = case when p ? 'ubicacion' then _texto_opt(p, 'ubicacion', 200) else ubicacion end,
    fecha_inicio = case when p ? 'fecha_inicio' then _fecha(p ->> 'fecha_inicio', 'Fecha de inicio') else fecha_inicio end,
    estado = case when p ? 'estado' then p ->> 'estado' else estado end
  where id = p_id;
  if p ? 'encargados' then
    delete from obra_usuarios where obra_id = p_id;
    for u in select * from jsonb_array_elements(p -> 'encargados') loop
      insert into obra_usuarios (obra_id, usuario_id) values (p_id, (u #>> '{}')::uuid) on conflict do nothing;
    end loop;
  end if;
  perform _auditar(p_id, 'obra', p_id, 'modificacion', to_jsonb(v), p);
end $$;

create or replace function public.definir_cotizacion_manual(p_obra bigint, p_valor double precision) returns void
language plpgsql security definer set search_path = public as $$
declare v_ant double precision;
begin
  perform _exigir_obra(p_obra);
  if p_valor is not null and p_valor <= 0 then perform _error('La cotización manual debe ser un número positivo (ARS por USD)'); end if;
  select cotizacion_manual into v_ant from obras where id = p_obra;
  update obras set cotizacion_manual = p_valor where id = p_obra;
  perform _auditar(p_obra, 'obra', p_obra, 'cotizacion_manual', jsonb_build_object('cotizacion_manual', v_ant), jsonb_build_object('cotizacion_manual', p_valor));
end $$;

create or replace function public.crear_rubro(p_obra bigint, p_nombre text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_n text := left(nullif(trim(p_nombre), ''), 80);
begin
  perform _exigir_obra(p_obra);
  if v_n is null then perform _error('Nombre del rubro es obligatorio'); end if;
  v_id := _crear_rubro(p_obra, v_n);
  perform _auditar(p_obra, 'rubro', v_id, 'alta', null, jsonb_build_object('nombre', v_n));
  return v_id;
end $$;

create or replace function public.actualizar_rubro(p_id bigint, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v rubros;
begin
  perform _exigir_admin();
  select * into v from rubros where id = p_id;
  if not found then perform _error('Rubro inexistente'); end if;
  if p ? 'activo' and not (p ->> 'activo')::boolean and v.activo
     and exists (select 1 from compromisos where rubro_id = p_id and not anulado) then
    perform _error('No se puede desactivar un rubro con gastos registrados: anulá o reasigná esos gastos primero');
  end if;
  update rubros set
    nombre = case when p ? 'nombre' then _texto(p, 'nombre', 'Nombre', 80) else nombre end,
    activo = case when p ? 'activo' then (p ->> 'activo')::boolean else activo end,
    -- al reactivar, el peso se vuelve a definir para no superar 100 %
    peso = case when p ? 'activo' and (p ->> 'activo')::boolean and not v.activo then null else peso end,
    orden = case when p ? 'orden' then (p ->> 'orden')::int else orden end
  where id = p_id;
  perform _auditar(v.obra_id, 'rubro', p_id, 'modificacion', to_jsonb(v), p);
end $$;

-- p_pesos: [{rubro_id, peso|null}]. La suma no puede superar 100. Devuelve cuánto falta asignar.
create or replace function public.definir_pesos(p_obra bigint, p_pesos jsonb) returns double precision
language plpgsql security definer set search_path = public as $$
declare x jsonb; v_suma double precision; v_peso double precision; v_antes jsonb;
begin
  perform _exigir_admin(); perform _exigir_obra(p_obra);
  select jsonb_agg(jsonb_build_object('id', id, 'peso', peso)) into v_antes from rubros where obra_id = p_obra;
  for x in select * from jsonb_array_elements(p_pesos) loop
    if not exists (select 1 from rubros where id = (x ->> 'rubro_id')::bigint and obra_id = p_obra and activo) then
      perform _error('Rubro no pertenece a la obra');
    end if;
    v_peso := nullif(x ->> 'peso', '')::double precision;
    if v_peso is not null and (v_peso < 0 or v_peso > 100) then perform _error('Cada peso debe estar entre 0 y 100'); end if;
    update rubros set peso = v_peso where id = (x ->> 'rubro_id')::bigint;
  end loop;
  select coalesce(sum(peso), 0) into v_suma from rubros where obra_id = p_obra and activo;
  if v_suma > 100.01 then perform _error(format('Los pesos suman %s %%: no pueden superar 100 %%', round(v_suma::numeric, 2))); end if;
  perform _auditar(p_obra, 'obra', p_obra, 'pesos', v_antes, p_pesos);
  return round((100 - v_suma)::numeric, 2)::double precision;
end $$;

create or replace function public.crear_tipo(p_nombre text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_n text := left(nullif(trim(p_nombre), ''), 60);
begin
  perform _exigir_activo();
  if v_n is null then perform _error('Nombre del tipo de gasto es obligatorio'); end if;
  select id into v_id from tipos_gasto where lower(nombre) = lower(v_n);
  if found then return v_id; end if;
  insert into tipos_gasto (nombre) values (v_n) returning id into v_id;
  perform _auditar(null, 'tipo_gasto', v_id, 'alta', null, jsonb_build_object('nombre', v_n));
  return v_id;
end $$;

create or replace function public._proveedor(p_val text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_n text := left(nullif(trim(p_val), ''), 120);
begin
  if v_n is null then return null; end if;
  select id into v_id from proveedores where lower(nombre) = lower(v_n);
  if found then return v_id; end if;
  insert into proveedores (nombre) values (v_n) returning id into v_id;
  return v_id;
end $$;

create or replace function public._rubro_de_obra(p_obra bigint, p_rubro bigint) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_rubro is null or not exists (select 1 from rubros where id = p_rubro and obra_id = p_obra) then perform _error('El rubro no pertenece a esta obra'); end if;
  if not exists (select 1 from rubros where id = p_rubro and activo) then perform _error('El rubro está desactivado'); end if;
end $$;

-- Doble envío: devuelve el registro ya creado con esa clave, sólo si es del mismo usuario y con los mismos datos.
create or replace function public._idem_existente(p_tabla text, p_clave text, p_hash text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_por uuid; v_hash text;
begin
  if p_clave is null then return null; end if;
  execute format('select id, creado_por, clave_hash from %I where clave_idem = $1', p_tabla) into v_id, v_por, v_hash using p_clave;
  if v_id is null then return null; end if;
  if v_por is distinct from auth.uid() then perform _error('Clave de envío inválida: cerrá y volvé a abrir el formulario'); end if;
  if v_hash is not null and v_hash <> p_hash then
    perform _error('Este formulario ya se había guardado con otros datos. Cerralo y revisá el movimiento antes de cargarlo de nuevo.');
  end if;
  return v_id;
end $$;

create or replace function public._adjunto_de_obra(p_obra bigint, p_adj text) returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if p_adj is null or p_adj = '' then return null; end if;
  select id into v_id from adjuntos where id = p_adj::bigint and obra_id = p_obra;
  if not found then perform _error('Adjunto inválido'); end if;
  return v_id;
end $$;

-- ── Presupuestos versionados ────────────────────────────────────────────────
create or replace function public.definir_presupuesto(p_rubro bigint, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r rubros; v_prev presupuestos; v_moneda text; v_importe bigint; v_ref date; v_desde date; v_motivo text; c jsonb; v_id bigint; v_ver int;
begin
  perform _exigir_admin();
  select * into r from rubros where id = p_rubro;
  if not found then perform _error('Rubro inexistente'); end if;
  v_moneda := _moneda(p ->> 'moneda');
  v_importe := _cents(p ->> 'importe', 'Presupuesto', true);
  v_ref := _fecha(p ->> 'fecha_ref', 'Fecha de referencia');
  v_motivo := _texto_opt(p, 'motivo', 500);
  select * into v_prev from presupuestos where rubro_id = p_rubro order by version desc limit 1;
  -- Por defecto, el primer presupuesto rige desde el inicio de la obra (así cuenta en fechas de corte pasadas);
  -- las modificaciones, desde hoy.
  v_desde := coalesce(nullif(p ->> 'vigente_desde', '')::date,
    case when v_prev.id is null then (select fecha_inicio from obras where id = r.obra_id)
         else (now() at time zone 'America/Argentina/Buenos_Aires')::date end);
  if v_prev.id is not null and v_motivo is null then perform _error('Indicá el motivo de la modificación del presupuesto'); end if;
  if v_prev.id is not null and v_desde < v_prev.vigente_desde then perform _error('La nueva versión no puede regir antes que la anterior'); end if;
  c := _cot(v_ref);
  v_ver := coalesce(v_prev.version, 0) + 1;
  insert into presupuestos (obra_id, rubro_id, version, moneda, importe, fecha_ref, vigente_desde, motivo, cot_valor, cot_fecha, cot_fuente, cot_estado, creado_por)
  values (r.obra_id, p_rubro, v_ver, v_moneda, v_importe, v_ref, v_desde, v_motivo,
          (c ->> 'cot_valor')::double precision, (c ->> 'cot_fecha')::date, c ->> 'cot_fuente', c ->> 'cot_estado', auth.uid())
  returning id into v_id;
  perform _auditar(r.obra_id, 'presupuesto', v_id, case when v_prev.id is null then 'alta' else 'nueva_version' end, to_jsonb(v_prev), p, v_motivo);
  return jsonb_build_object('id', v_id, 'version', v_ver, 'cotizacion', c);
end $$;

-- ── Pagos (función interna compartida) ──────────────────────────────────────
create or replace function public._insertar_pago(c compromisos, p_fecha date, p_moneda text, p_pagado bigint, p_cancelado bigint,
  p_tc double precision, p_anticipo boolean, p_nota text, p_adj bigint, p_clave text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint; k jsonb := _cot(p_fecha);
begin
  insert into pagos (obra_id, compromiso_id, fecha, moneda_pago, importe_pagado, importe_cancelado, tc_cancelacion, es_anticipo, nota, adjunto_id,
    cot_valor, cot_fecha, cot_fuente, cot_estado, clave_idem, creado_por)
  values (c.obra_id, c.id, p_fecha, p_moneda, p_pagado, p_cancelado, p_tc, p_anticipo, p_nota, p_adj,
    (k ->> 'cot_valor')::double precision, (k ->> 'cot_fecha')::date, k ->> 'cot_fuente', k ->> 'cot_estado', p_clave, auth.uid())
  returning id into v_id;
  perform _auditar(c.obra_id, 'pago', v_id, 'alta', null,
    jsonb_build_object('compromiso_id', c.id, 'fecha', p_fecha, 'moneda_pago', p_moneda, 'importe_pagado', p_pagado, 'importe_cancelado', p_cancelado, 'tc', p_tc));
  return v_id;
end $$;

-- ── Agregar gasto ───────────────────────────────────────────────────────────
-- contado: compromiso + pago total. a_cuenta / contrato: compromiso con saldo y anticipo opcional.
create or replace function public.crear_gasto(p_obra bigint, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_clave text := nullif(p ->> 'clave_idem', ''); v_ex bigint;
  v_fecha date; v_concepto text; v_rubro bigint; v_tipo bigint; v_moneda text; v_importe bigint; v_cond text;
  v_venc date; v_adj bigint; v_ant bigint; v_ant_fecha date; c jsonb; v_comp compromisos; v_pago bigint;
  v_hash text := md5(p_obra::text || (p - 'clave_idem')::text);
begin
  perform _exigir_obra(p_obra);
  v_ex := _idem_existente('compromisos', v_clave, v_hash);
  if v_ex is not null then return jsonb_build_object('id', v_ex, 'duplicado', true); end if;
  v_fecha := _fecha(p ->> 'fecha', 'Fecha');
  v_concepto := _texto(p, 'concepto', 'Concepto', 200);
  v_rubro := nullif(p ->> 'rubro_id', '')::bigint; perform _rubro_de_obra(p_obra, v_rubro);
  v_tipo := nullif(p ->> 'tipo_id', '')::bigint;
  if v_tipo is null or not exists (select 1 from tipos_gasto where id = v_tipo) then perform _error('Tipo de gasto inexistente'); end if;
  v_moneda := _moneda(p ->> 'moneda');
  v_importe := _cents(p ->> 'importe', 'Importe');
  v_cond := p ->> 'condicion';
  if v_cond is null or v_cond not in ('contado', 'a_cuenta', 'contrato') then perform _error('Condición de pago inválida'); end if;
  if v_cond <> 'contado' and nullif(p ->> 'vencimiento', '') is not null then v_venc := _fecha(p ->> 'vencimiento', 'Vencimiento'); end if;
  v_adj := _adjunto_de_obra(p_obra, p ->> 'adjunto_id');
  if v_cond <> 'contado' and coalesce(nullif(p #>> '{anticipo,importe}', ''), '0') <> '0' then
    v_ant := _cents(p #>> '{anticipo,importe}', 'Anticipo');
    v_ant_fecha := case when nullif(p #>> '{anticipo,fecha}', '') is null then v_fecha
                        else _fecha(p #>> '{anticipo,fecha}', 'Fecha del anticipo') end;
    if v_ant > v_importe then perform _error('El anticipo no puede superar el importe acordado'); end if;
    if v_ant_fecha < v_fecha then perform _error('El anticipo no puede ser anterior al compromiso'); end if;
  end if;
  c := _cot(v_fecha);
  insert into compromisos (obra_id, rubro_id, tipo_id, proveedor_id, fecha, concepto, moneda, importe, condicion, vencimiento, adjunto_id,
    cot_valor, cot_fecha, cot_fuente, cot_estado, clave_idem, creado_por)
  values (p_obra, v_rubro, v_tipo, _proveedor(coalesce(p ->> 'proveedor', '')), v_fecha, v_concepto, v_moneda, v_importe, v_cond, v_venc, v_adj,
    (c ->> 'cot_valor')::double precision, (c ->> 'cot_fecha')::date, c ->> 'cot_fuente', c ->> 'cot_estado', v_clave, auth.uid())
  on conflict (clave_idem) do nothing
  returning * into v_comp;
  if v_comp.id is null then   -- doble envío simultáneo: ya existe
    return jsonb_build_object('id', _idem_existente('compromisos', v_clave, v_hash), 'duplicado', true);
  end if;
  update compromisos set clave_hash = v_hash where id = v_comp.id;
  perform _auditar(p_obra, 'compromiso', v_comp.id, 'alta', null,
    jsonb_build_object('concepto', v_concepto, 'moneda', v_moneda, 'importe', v_importe, 'condicion', v_cond));
  if v_cond = 'contado' then
    v_pago := _insertar_pago(v_comp, v_fecha, v_moneda, v_importe, v_importe, null, false, 'Pago al contado', v_adj, null);
  elsif v_ant is not null then
    v_pago := _insertar_pago(v_comp, v_ant_fecha, v_moneda, v_ant, v_ant, null, true, 'Anticipo', null, null);
  end if;
  return jsonb_build_object('id', v_comp.id, 'pago_id', v_pago, 'cotizacion', c);
end $$;

create or replace function public._saldo(p_comp bigint) returns bigint language sql stable security definer set search_path = public as $$
  select c.importe - coalesce((select sum(importe_cancelado) from pagos where compromiso_id = c.id and not anulado), 0)
  from compromisos c where c.id = p_comp;
$$;

-- Calcula (sin guardar) el pago. Pago en otra moneda: se necesita el importe que cancela o el TC de cancelación.
create or replace function public.preparar_pago(p_comp bigint, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c compromisos; v_saldo bigint; v_fecha date; v_mon text; v_pag bigint; v_canc bigint; v_tc double precision; v_ars bigint; v_usd bigint; k jsonb;
begin
  select * into c from compromisos where id = p_comp;
  if not found or not puede_ver_obra(c.obra_id) then perform _error('Movimiento inexistente o sin acceso'); end if;
  if c.anulado then perform _error('El compromiso está anulado'); end if;
  v_saldo := _saldo(p_comp);
  v_fecha := _fecha(p ->> 'fecha', 'Fecha del pago');
  if v_fecha < c.fecha then perform _error('El pago no puede ser anterior al compromiso'); end if;
  v_mon := _moneda(p ->> 'moneda_pago');
  v_pag := _cents(p ->> 'importe_pagado', 'Importe pagado');
  if v_mon = c.moneda then
    v_canc := v_pag;
  elsif nullif(p ->> 'importe_cancelado', '') is not null then
    v_canc := _cents(p ->> 'importe_cancelado', 'Importe que cancela');
    v_ars := case when v_mon = 'ARS' then v_pag else v_canc end;
    v_usd := case when v_mon = 'USD' then v_pag else v_canc end;
    v_tc := round((v_ars::numeric / v_usd), 4)::double precision;
  elsif coalesce(nullif(p ->> 'tc_cancelacion', '')::double precision, 0) > 0 then
    v_tc := (p ->> 'tc_cancelacion')::double precision;
    -- numeric: redondeo "mitad hacia arriba", igual que el cálculo del navegador
    v_canc := case when v_mon = 'ARS' then round(v_pag::numeric / v_tc::numeric) else round(v_pag::numeric * v_tc::numeric) end;
    if v_canc <= 0 then perform _error('El importe que cancela resulta en cero'); end if;
  else
    perform _error(format('El pago es en %s y el compromiso en %s: indicá cuánto cancela en %s o el tipo de cambio de cancelación', v_mon, c.moneda, c.moneda));
  end if;
  -- Control de razonabilidad del tipo de cambio de cancelación contra la cotización BNA del día (±50 %).
  if v_tc is not null then
    k := _cot(v_fecha);
    if k ->> 'cot_estado' = 'ok' and (v_tc < 0.5 * (k ->> 'cot_valor')::double precision or v_tc > 1.5 * (k ->> 'cot_valor')::double precision) then
      perform _error(format('El tipo de cambio de cancelación (ARS %s por USD) se aleja más de 50 %% de la cotización BNA del %s (ARS %s). Revisá los importes.',
        replace(round(v_tc::numeric, 2)::text, '.', ','), to_char((k ->> 'cot_fecha')::date, 'DD/MM/YYYY'),
        replace(round((k ->> 'cot_valor')::numeric, 2)::text, '.', ',')));
    end if;
  end if;
  if v_canc > v_saldo then
    perform _error(format('El pago cancela %s y el saldo es %s. No se permiten pagos superiores al saldo.', _fmt(v_canc, c.moneda), _fmt(v_saldo, c.moneda)));
  end if;
  return jsonb_build_object('compromiso_id', c.id, 'moneda_compromiso', c.moneda, 'saldo', v_saldo, 'fecha', v_fecha, 'moneda_pago', v_mon,
    'importe_pagado', v_pag, 'importe_cancelado', v_canc, 'tc', v_tc, 'saldoResultante', v_saldo - v_canc);
end $$;

create or replace function public.registrar_pago(p_comp bigint, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c compromisos; v_clave text := nullif(p ->> 'clave_idem', ''); v_ex bigint; pr jsonb; v_id bigint; v_obra bigint;
  v_hash text := md5(p_comp::text || (p - 'clave_idem')::text);
begin
  -- Verifica el acceso antes de bloquear; después bloquea el compromiso: dos pagos simultáneos no pueden superar el saldo.
  select obra_id into v_obra from compromisos where id = p_comp;
  if v_obra is null or not puede_ver_obra(v_obra) then perform _error('Movimiento inexistente o sin acceso'); end if;
  select * into c from compromisos where id = p_comp for update;
  v_ex := _idem_existente('pagos', v_clave, v_hash);
  if v_ex is not null then return jsonb_build_object('id', v_ex, 'duplicado', true); end if;
  pr := preparar_pago(p_comp, p);
  v_id := _insertar_pago(c, (pr ->> 'fecha')::date, pr ->> 'moneda_pago', (pr ->> 'importe_pagado')::bigint, (pr ->> 'importe_cancelado')::bigint,
    (pr ->> 'tc')::double precision, coalesce((p ->> 'es_anticipo')::boolean, false), _texto_opt(p, 'nota', 300),
    _adjunto_de_obra(c.obra_id, p ->> 'adjunto_id'), v_clave);
  update pagos set clave_hash = v_hash where id = v_id;
  return jsonb_build_object('id', v_id, 'saldoResultante', (pr ->> 'saldoResultante')::bigint);
end $$;

-- ── Correcciones y anulaciones (conservan quién y cuándo) ───────────────────
create or replace function public.corregir_compromiso(p_id bigint, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare c compromisos; n compromisos; v_motivo text; v_canc bigint; v_primer date; k jsonb;
begin
  select * into c from compromisos where id = p_id;
  if not found or not puede_ver_obra(c.obra_id) then perform _error('Movimiento inexistente o sin acceso'); end if;
  select * into c from compromisos where id = p_id for update;
  if c.anulado then perform _error('El compromiso está anulado'); end if;
  v_motivo := _texto(p, 'motivo', 'Motivo de la corrección', 500);
  v_canc := c.importe - _saldo(p_id);
  n := c;
  if p ? 'fecha' then n.fecha := _fecha(p ->> 'fecha', 'Fecha'); end if;
  if p ? 'concepto' then n.concepto := _texto(p, 'concepto', 'Concepto', 200); end if;
  if p ? 'rubro_id' then n.rubro_id := (p ->> 'rubro_id')::bigint; perform _rubro_de_obra(c.obra_id, n.rubro_id); end if;
  if p ? 'tipo_id' then
    n.tipo_id := (p ->> 'tipo_id')::bigint;
    if not exists (select 1 from tipos_gasto where id = n.tipo_id) then perform _error('Tipo inexistente'); end if;
  end if;
  if p ? 'vencimiento' then n.vencimiento := case when nullif(p ->> 'vencimiento', '') is null then null else _fecha(p ->> 'vencimiento', 'Vencimiento') end; end if;
  if p ? 'importe' then
    n.importe := _cents(p ->> 'importe', 'Importe');
    if n.importe < v_canc and c.condicion <> 'contado' then perform _error('El importe no puede ser menor a lo ya pagado'); end if;
  end if;
  if p ? 'proveedor' then n.proveedor_id := _proveedor(coalesce(p ->> 'proveedor', '')); end if;
  select min(fecha) into v_primer from pagos where compromiso_id = p_id and not anulado;
  if c.condicion <> 'contado' and v_primer is not null and n.fecha > v_primer then perform _error('La fecha no puede ser posterior a un pago registrado'); end if;
  if n.fecha <> c.fecha then
    k := _cot(n.fecha);
    n.cot_valor := (k ->> 'cot_valor')::double precision; n.cot_fecha := (k ->> 'cot_fecha')::date; n.cot_fuente := k ->> 'cot_fuente'; n.cot_estado := k ->> 'cot_estado';
  end if;
  update compromisos set fecha = n.fecha, concepto = n.concepto, rubro_id = n.rubro_id, tipo_id = n.tipo_id, proveedor_id = n.proveedor_id,
    vencimiento = n.vencimiento, importe = n.importe, cot_valor = n.cot_valor, cot_fecha = n.cot_fecha, cot_fuente = n.cot_fuente,
    cot_estado = n.cot_estado, modificado_en = now()
  where id = p_id;
  -- Contado: el pago total acompaña al compromiso.
  if c.condicion = 'contado' and (n.importe <> c.importe or n.fecha <> c.fecha) then
    update pagos set importe_pagado = n.importe, importe_cancelado = n.importe, fecha = n.fecha, cot_valor = n.cot_valor, cot_fecha = n.cot_fecha,
      cot_fuente = n.cot_fuente, cot_estado = n.cot_estado, modificado_en = now()
    where compromiso_id = p_id and not anulado;
  end if;
  perform _auditar(c.obra_id, 'compromiso', p_id, 'correccion', to_jsonb(c), to_jsonb(n), v_motivo);
end $$;

create or replace function public.anular_compromiso(p_id bigint, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare c compromisos; v_m text := left(nullif(trim(p_motivo), ''), 500);
begin
  select * into c from compromisos where id = p_id for update;
  if not found then perform _error('Compromiso inexistente'); end if;
  perform _exigir_obra(c.obra_id);
  if v_m is null then perform _error('Motivo de la anulación es obligatorio'); end if;
  update compromisos set anulado = true, anulado_motivo = v_m, modificado_en = now() where id = p_id;
  update pagos set anulado = true, anulado_motivo = 'Anulación del compromiso: ' || v_m, modificado_en = now() where compromiso_id = p_id and not anulado;
  perform _auditar(c.obra_id, 'compromiso', p_id, 'anulacion', to_jsonb(c), null, v_m);
end $$;

create or replace function public.anular_pago(p_id bigint, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare pg pagos; v_cond text; v_m text := left(nullif(trim(p_motivo), ''), 500);
begin
  select * into pg from pagos where id = p_id;
  if not found then perform _error('Pago inexistente'); end if;
  perform _exigir_obra(pg.obra_id);
  select condicion into v_cond from compromisos where id = pg.compromiso_id;
  if v_cond = 'contado' then perform _error('Es una compra al contado: corregí o anulá el gasto completo'); end if;
  if v_m is null then perform _error('Motivo de la anulación es obligatorio'); end if;
  update pagos set anulado = true, anulado_motivo = v_m, modificado_en = now() where id = p_id;
  perform _auditar(pg.obra_id, 'pago', p_id, 'anulacion', to_jsonb(pg), null, v_m);
end $$;

-- ── Avance físico ───────────────────────────────────────────────────────────
create or replace function public.cargar_avance(p_rubro bigint, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r rubros; v_clave text := nullif(p ->> 'clave_idem', ''); v_ex bigint; v_fecha date; v_pct double precision; v_ult avances; v_sig avances; v_mot text; v_id bigint;
  v_hash text := md5(p_rubro::text || (p - 'clave_idem')::text);
begin
  select * into r from rubros where id = p_rubro;
  if not found or not puede_ver_obra(r.obra_id) then perform _error('Rubro inexistente o sin acceso'); end if;
  if not r.activo then perform _error('El rubro está desactivado'); end if;
  perform _exigir_obra(r.obra_id);
  v_ex := _idem_existente('avances', v_clave, v_hash);
  if v_ex is not null then return jsonb_build_object('id', v_ex, 'duplicado', true); end if;
  v_fecha := _fecha(p ->> 'fecha', 'Fecha');
  begin v_pct := (p ->> 'porcentaje')::double precision; exception when others then v_pct := null; end;
  if v_pct is null or v_pct < 0 or v_pct > 100 then perform _error('El avance debe ser un porcentaje entre 0 y 100'); end if;
  -- Se compara contra los registros vecinos en el tiempo (no sólo el último cargado):
  -- el anterior a esa fecha no puede ser mayor, ni el siguiente menor, sin un motivo.
  select * into v_ult from avances where rubro_id = p_rubro and not anulado and fecha <= v_fecha order by fecha desc, id desc limit 1;
  select * into v_sig from avances where rubro_id = p_rubro and not anulado and fecha > v_fecha order by fecha, id limit 1;
  v_mot := _texto_opt(p, 'motivo_baja', 500);
  if v_ult.id is not null and v_pct < v_ult.porcentaje and v_mot is null then
    perform _error(format('El avance al %s era %s %%. Para corregirlo a la baja indicá el motivo.',
      to_char(v_ult.fecha, 'DD/MM/YYYY'), replace(v_ult.porcentaje::text, '.', ',')));
  end if;
  if v_sig.id is not null and v_pct > v_sig.porcentaje and v_mot is null then
    perform _error(format('Ya hay un avance posterior (%s: %s %%) menor al que cargás: el avance bajaría después. Indicá el motivo.',
      to_char(v_sig.fecha, 'DD/MM/YYYY'), replace(v_sig.porcentaje::text, '.', ',')));
  end if;
  insert into avances (obra_id, rubro_id, fecha, porcentaje, comentario, motivo_baja, adjunto_id, clave_idem, creado_por)
  values (r.obra_id, p_rubro, v_fecha, v_pct, _texto_opt(p, 'comentario', 1000), v_mot, _adjunto_de_obra(r.obra_id, p ->> 'adjunto_id'), v_clave, auth.uid())
  on conflict (clave_idem) do nothing
  returning id into v_id;
  if v_id is null then
    return jsonb_build_object('id', _idem_existente('avances', v_clave, v_hash), 'duplicado', true);
  end if;
  update avances set clave_hash = v_hash where id = v_id;
  perform _auditar(r.obra_id, 'avance', v_id, 'alta', case when v_ult.id is null then null else jsonb_build_object('porcentaje', v_ult.porcentaje) end,
    jsonb_build_object('porcentaje', v_pct, 'fecha', v_fecha), v_mot);
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.anular_avance(p_id bigint, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare a avances; v_m text := left(nullif(trim(p_motivo), ''), 500);
begin
  select * into a from avances where id = p_id;
  if not found then perform _error('Avance inexistente'); end if;
  perform _exigir_obra(a.obra_id);
  if v_m is null then perform _error('Motivo es obligatorio'); end if;
  update avances set anulado = true, anulado_motivo = v_m where id = p_id;
  perform _auditar(a.obra_id, 'avance', p_id, 'anulacion', to_jsonb(a), null, v_m);
end $$;

-- ── Copia de seguridad (administrador) ──────────────────────────────────────
create or replace function public.exportar_respaldo() returns jsonb
language plpgsql security definer set search_path = public as $$
declare t text; v jsonb; res jsonb := jsonb_build_object('generado', now(), 'version', 1);
begin
  perform _exigir_admin();
  foreach t in array array['perfiles','obras','obra_usuarios','rubros_catalogo','rubros','tipos_gasto','proveedores','cotizaciones',
    'adjuntos','presupuestos','compromisos','pagos','avances','auditoria'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x', t) into v;
    res := res || jsonb_build_object(t, v);
  end loop;
  perform _auditar(null, 'sistema', 0, 'descarga_respaldo');
  return res;
end $$;

-- Nombres de los usuarios habilitados (sin emails), para mostrar quién cargó cada movimiento.
create or replace function public.directorio() returns table (id uuid, nombre text)
language sql stable security definer set search_path = public as $$
  select p.id, p.nombre from perfiles p where public.es_usuario_activo() and p.rol in ('admin', 'encargado');
$$;

-- Mantener activo el proyecto (llamado por una tarea programada de GitHub). No expone datos.
create or replace function public.ping() returns boolean language sql stable as $$ select true $$;

-- Eliminación DEFINITIVA de una obra y todos sus datos (sólo administrador; para obras de prueba o cargadas por error).
-- Exige escribir el nombre exacto. Devuelve las rutas de comprobantes para borrarlos del almacenamiento.
-- Queda un registro en auditoría (visible sólo para administradores) con el resumen de lo eliminado.
create or replace function public.eliminar_obra(p_obra bigint, p_confirmacion text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o obras; v_rutas jsonb; v_resumen jsonb;
begin
  perform _exigir_admin();
  select * into o from obras where id = p_obra for update;
  if not found then perform _error('Obra inexistente'); end if;
  if lower(trim(coalesce(p_confirmacion, ''))) <> lower(trim(o.nombre)) then
    perform _error('Para eliminar, escribí exactamente el nombre de la obra');
  end if;
  select coalesce(jsonb_agg(ruta), '[]'::jsonb) into v_rutas from adjuntos where obra_id = p_obra;
  v_resumen := jsonb_build_object(
    'rubros', (select count(*) from rubros where obra_id = p_obra),
    'presupuestos', (select count(*) from presupuestos where obra_id = p_obra),
    'compromisos', (select count(*) from compromisos where obra_id = p_obra),
    'pagos', (select count(*) from pagos where obra_id = p_obra),
    'avances', (select count(*) from avances where obra_id = p_obra),
    'adjuntos', jsonb_array_length(v_rutas));
  -- gremios: fotos, reclamos (con su conversación), partes y asignaciones
  delete from fotos where obra_id = p_obra;
  delete from reclamos where obra_id = p_obra;
  delete from partes_avance where obra_id = p_obra;
  delete from gremio_rubros where obra_id = p_obra;
  delete from pagos where obra_id = p_obra;
  delete from compromisos where obra_id = p_obra;
  delete from avances where obra_id = p_obra;
  delete from presupuestos where obra_id = p_obra;
  delete from adjuntos where obra_id = p_obra;
  delete from rubros where obra_id = p_obra;
  delete from obra_usuarios where obra_id = p_obra;
  delete from auditoria where obra_id = p_obra;
  delete from obras where id = p_obra;
  perform _auditar(null, 'obra', p_obra, 'eliminacion', to_jsonb(o) || jsonb_build_object('eliminado', v_resumen), null, 'Obra eliminada por el administrador');
  return v_resumen || jsonb_build_object('rutas', v_rutas);
end $$;

-- ════════ 004_almacenamiento.sql ════════
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

-- ════════ 005_permisos_funciones.sql ════════
-- ControlAr · 005 · Quién puede ejecutar cada función
-- Por defecto Postgres permite ejecutar funciones a cualquiera: se restringe a usuarios autenticados,
-- y las funciones internas (prefijo _) no se exponen.

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.es_admin(), public.es_usuario_activo(), public.puede_ver_obra(bigint),
  public.cotizacion_para(date), public.cargar_cotizacion(date, double precision, text, boolean),
  public.actualizar_usuario(uuid, jsonb),
  public.crear_obra(jsonb), public.actualizar_obra(bigint, jsonb), public.definir_cotizacion_manual(bigint, double precision),
  public.crear_rubro(bigint, text), public.actualizar_rubro(bigint, jsonb), public.definir_pesos(bigint, jsonb), public.crear_tipo(text),
  public.definir_presupuesto(bigint, jsonb), public.crear_gasto(bigint, jsonb), public.preparar_pago(bigint, jsonb),
  public.registrar_pago(bigint, jsonb), public.corregir_compromiso(bigint, jsonb), public.anular_compromiso(bigint, text),
  public.anular_pago(bigint, text), public.cargar_avance(bigint, jsonb), public.anular_avance(bigint, text),
  public.registrar_adjunto(bigint, text, text, text, bigint), public.exportar_respaldo(), public._obra_de_ruta(text),
  public.directorio(), public.eliminar_obra(bigint, text)
to authenticated;

-- Las políticas de Storage evalúan estas funciones con el rol del usuario.
grant execute on function public._obra_de_ruta(text), public.puede_ver_obra(bigint) to authenticated;

-- Única función abierta sin sesión: ping para mantener activo el proyecto gratuito.
grant execute on function public.ping() to anon, authenticated;

-- Que futuras funciones tampoco queden abiertas por defecto.
-- (ver 006: los privilegios por defecto se ajustan "for role postgres", que es quien crea las funciones)

-- ════════ 006_revision.sql ════════
-- ControlAr · 006 · Ajustes de la revisión independiente (re-ejecutable)

-- Doble envío: además de la clave, se guarda una huella de los datos enviados.
-- Si se reenvía la misma clave con datos distintos, se rechaza en vez de dar por buena la versión anterior.
alter table public.compromisos add column if not exists clave_hash text;
alter table public.pagos       add column if not exists clave_hash text;
alter table public.avances     add column if not exists clave_hash text;

-- Alta de perfil: el rol de administrador se otorga recién con el email CONFIRMADO
-- (si alguien se registra antes con ese email y no lo confirma, no obtiene nada).
create or replace function public._nuevo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_admin text := (select lower(valor) from configuracion where clave = 'admin_email');
begin
  if tg_op = 'INSERT' then
    insert into perfiles (id, email, nombre, rol)
    values (new.id, lower(coalesce(new.email, '')),
            left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''), split_part(coalesce(new.email, ''), '@', 1)), 80),
            case when lower(new.email) = v_admin and new.email_confirmed_at is not null then 'admin' else 'pendiente' end)
    on conflict (id) do nothing;
  elsif new.email_confirmed_at is not null and old.email_confirmed_at is null and lower(new.email) = v_admin then
    update perfiles set rol = 'admin', activo = true where id = new.id and rol = 'pendiente';
  end if;
  return new;
end $$;

drop trigger if exists controlar_nuevo_usuario on auth.users;
create trigger controlar_nuevo_usuario after insert on auth.users
  for each row execute function public._nuevo_usuario();
drop trigger if exists controlar_email_confirmado on auth.users;
create trigger controlar_email_confirmado after update of email_confirmed_at on auth.users
  for each row execute function public._nuevo_usuario();

revoke execute on function public._nuevo_usuario() from public, anon, authenticated;

-- Funciones que se creen en el futuro: sin permiso de ejecución por defecto para nadie.
-- (un "alter default privileges" sin "for role" no sirve: hay que indicarlo para el rol que crea las funciones)
-- El EXECUTE para PUBLIC es un privilegio global: se quita sin "in schema". Los que Supabase da a anon/authenticated
-- están definidos para el esquema public: se quitan con "in schema public".
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;

-- ════════ 007_gremios.sql ════════
-- ControlAr · 007 · Gremios: fotos de obra, partes de avance y reclamos (re-ejecutable)
--
-- Rol 'gremio' (electricista, plomero, etc.): el administrador le asigna rubros de una o más obras.
--  * Ve sólo sus rubros asignados, sus partes de avance, sus reclamos y sus fotos. NUNCA importes.
--  * Informa avances con fotos ("partes"): quedan pendientes hasta que la empresa los aprueba.
--  * Reclamos en ambos sentidos (gremio -> empresa y empresa -> gremio) con estado, fotos y conversación.
-- La empresa (admin / encargado de la obra) ve todo lo de la obra y suma fotos a la galería.

-- ── Rol nuevo ───────────────────────────────────────────────────────────────
alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check check (rol in ('pendiente', 'encargado', 'admin', 'gremio'));

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

-- ════════ Administrador inicial ════════
insert into public.configuracion (clave, valor) values ('admin_email', lower('TU-EMAIL@EJEMPLO.COM'))
on conflict (clave) do update set valor = excluded.valor;
-- Si esa persona ya tenía cuenta creada, se la registra y habilita como administrador.
insert into public.perfiles (id, email, nombre, rol)
select u.id, lower(coalesce(u.email, '')), split_part(coalesce(u.email, ''), '@', 1), 'pendiente' from auth.users u on conflict (id) do nothing;
update public.perfiles set rol = 'admin', activo = true
where email = (select valor from public.configuracion where clave = 'admin_email')
  and id in (select id from auth.users where email_confirmed_at is not null);
