// Genera supabase/instalar.sql (todas las migraciones en orden) para pegar en el SQL Editor de Supabase.
import fs from 'node:fs';
import path from 'node:path';

const dir = 'supabase/migraciones';
const partes = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => `-- ════════ ${f} ════════\n${fs.readFileSync(path.join(dir, f), 'utf8')}`);

const cabecera = `-- ControlAr · instalación completa en Supabase (ejecutar UNA sola vez en un proyecto nuevo)
-- 1) Reemplazá TU-EMAIL@EJEMPLO.COM (al final) por el email de quien va a administrar la app.
-- 2) Pegá todo en Supabase → SQL Editor → Run.
-- Generado por: npm run sql
`;
const pie = `
-- ════════ Administrador inicial ════════
insert into public.configuracion (clave, valor) values ('admin_email', lower('TU-EMAIL@EJEMPLO.COM'))
on conflict (clave) do update set valor = excluded.valor;
-- Si esa persona ya tenía cuenta creada, se la registra y habilita como administrador.
insert into public.perfiles (id, email, nombre, rol)
select u.id, lower(u.email), split_part(u.email, '@', 1), 'pendiente' from auth.users u on conflict (id) do nothing;
update public.perfiles set rol = 'admin', activo = true
where email = (select valor from public.configuracion where clave = 'admin_email');
`;
fs.writeFileSync('supabase/instalar.sql', cabecera + '\n' + partes.join('\n') + pie);
console.log('supabase/instalar.sql generado');
