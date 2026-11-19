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
