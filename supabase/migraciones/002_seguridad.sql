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
