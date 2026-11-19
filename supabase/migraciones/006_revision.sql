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
