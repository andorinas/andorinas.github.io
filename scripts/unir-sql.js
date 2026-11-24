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
select u.id, lower(coalesce(u.email, '')), split_part(coalesce(u.email, ''), '@', 1), 'pendiente' from auth.users u on conflict (id) do nothing;
update public.perfiles set rol = 'admin', activo = true
where email = (select valor from public.configuracion where clave = 'admin_email')
  and id in (select id from auth.users where email_confirmed_at is not null);
`;
fs.writeFileSync('supabase/instalar.sql', cabecera + '\n' + partes.join('\n') + pie);
console.log('supabase/instalar.sql generado');

// Actualización de una base ya instalada: columnas nuevas + todas las funciones y permisos (todo re-ejecutable).
const actualizar = ['006_revision.sql', '003_funciones.sql', '004_almacenamiento.sql', '005_permisos_funciones.sql', '007_gremios.sql', '008_clientes.sql']
  .map((f) => `-- ════════ ${f} ════════\n${fs.readFileSync(path.join(dir, f), 'utf8')}`);
fs.writeFileSync('supabase/actualizar.sql', `-- ControlAr · ACTUALIZACIÓN de una base ya instalada (no borra datos; se puede ejecutar más de una vez).
-- Pegar en Supabase → SQL Editor → Run. Generado por: npm run sql
` + actualizar.join('\n'));
console.log('supabase/actualizar.sql generado');
