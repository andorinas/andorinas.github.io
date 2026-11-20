// Postgres en memoria (PGlite) con lo mínimo de Supabase (auth.uid, auth.users, storage) para probar
// las migraciones reales, las funciones de negocio y la seguridad por filas (RLS) sin conexión.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migraciones');

const STUB_SUPABASE = `
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb not null default '{}', email_confirmed_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant select, insert, delete on storage.objects to authenticated;
grant usage on schema public to anon, authenticated;
`;

export async function crearBase() {
  const pg = new PGlite({
    parsers: {
      20: (v) => Number(v),                       // bigint -> number (como PostgREST)
      1082: (v) => v,                             // date -> 'AAAA-MM-DD'
      1184: (v) => new Date(v).toISOString(),     // timestamptz -> ISO
    },
  });
  await pg.exec(STUB_SUPABASE);
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.sql')).sort()) {
    await pg.exec(fs.readFileSync(path.join(DIR, f), 'utf8'));
  }
  return pg;
}

/** Crea un usuario de Auth (dispara el alta del perfil) y opcionalmente le asigna rol. */
export async function crearUsuario(pg, email, rol) {
  const id = crypto.randomUUID();
  await pg.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [id, email, JSON.stringify({ nombre: email.split('@')[0] })]);
  if (rol) await pg.query('update public.perfiles set rol = $1 where id = $2', [rol, id]);
  return id;
}

/** Cliente que actúa como un usuario autenticado (rol authenticated + auth.uid()). */
export function como(pg, userId) {
  const run = (fn) => pg.transaction(async (tx) => {
    await tx.exec(userId ? 'set local role authenticated' : 'set local role anon');
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId || '']);
    return fn(tx);
  });
  return {
    id: userId,
    /** Llama a una función RPC con argumentos nombrados (igual que supabase.rpc). */
    rpc: (fn, args = {}) => run(async (tx) => {
      const ks = Object.keys(args);
      const sql = `select public.${fn}(${ks.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`;
      const vals = ks.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k]));
      return (await tx.query(sql, vals)).rows[0].r;
    }),
    query: (sql, params = []) => run(async (tx) => (await tx.query(sql, params)).rows),
  };
}

/** Lee los datos de una obra como lo hace la app (sujeto a RLS). */
export async function cargarDatosObra(cli, obraId) {
  const q = (sql) => cli.query(sql, [obraId]);
  const [obra] = await q('select * from obras where id = $1');
  if (!obra) throw new Error('Obra inexistente o sin acceso');
  return {
    obra,
    rubros: await q('select * from rubros where obra_id = $1 order by orden, id'),
    tipos: await cli.query('select * from tipos_gasto order by orden, nombre'),
    proveedores: await q('select distinct p.* from proveedores p join compromisos c on c.proveedor_id = p.id where c.obra_id = $1'),
    presupuestos: await q('select * from presupuestos where obra_id = $1'),
    compromisos: await q('select * from compromisos where obra_id = $1 order by fecha, id'),
    pagos: await q('select * from pagos where obra_id = $1 order by fecha, id'),
    avances: await q('select * from avances where obra_id = $1 order by fecha, id'),
  };
}
