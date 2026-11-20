// Cliente "Supabase" de DEMOSTRACIÓN para sacar capturas del instructivo.
// Corre todo en el navegador: Postgres en memoria (PGlite) con las migraciones reales,
// datos de ejemplo ficticios y archivos guardados en memoria. No se conecta a internet.
import { PGlite } from '@electric-sql/pglite';
import { sembrar } from './semilla.js';

const SQLS = import.meta.glob('../../../supabase/migraciones/*.sql', { query: '?raw', import: 'default', eager: true });

const STUB = `
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

export const configurado = true;
export const enlaceEmail = null;

const pg = new PGlite({
  parsers: { 20: (v) => Number(v), 1700: (v) => Number(v), 1082: (v) => v, 1184: (v) => new Date(v).toISOString() },
});
const archivos = new Map(); // ruta -> Blob
const urls = new Map();
const urlDe = (ruta) => { if (!urls.has(ruta) && archivos.has(ruta)) urls.set(ruta, URL.createObjectURL(archivos.get(ruta))); return urls.get(ruta) || ''; };

let actual = null; // { id, email }
const oyentes = new Set();
const emitir = (ev) => { const s = sesion(); oyentes.forEach((cb) => cb(ev, s)); };
const sesion = () => (actual ? { user: actual, access_token: 'demo' } : null);

const ejecutar = (uid, fn) => pg.transaction(async (tx) => {
  await tx.exec(uid ? 'set local role authenticated' : 'set local role anon');
  await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [uid || '']);
  return fn(tx);
});
const valor = (v) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v);
const res = async (p) => { try { return { data: await p, error: null }; } catch (e) { console.warn('[demo]', e.message); return { data: null, error: { message: e.message } }; } };

export function clienteDe(uid) {
  return {
    rpc: (fn, args = {}) => ejecutar(uid, async (tx) => {
      const ks = Object.keys(args).filter((k) => args[k] !== undefined);
      const r = await tx.query(`select public.${fn}(${ks.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, ks.map((k) => valor(args[k])));
      return r.rows[0].r;
    }),
    rpcTabla: (fn) => ejecutar(uid, async (tx) => (await tx.query(`select * from public.${fn}()`)).rows),
    query: (sql, p = []) => ejecutar(uid, async (tx) => (await tx.query(sql, p)).rows),
    subir: (ruta, blob) => ejecutar(uid, async (tx) => {
      await tx.query("insert into storage.objects (bucket_id, name, owner) values ('adjuntos', $1, auth.uid())", [ruta]);
      archivos.set(ruta, blob);
    }),
  };
}

// Funciones que devuelven tabla (se llaman con "select * from")
const DE_TABLA = new Set(['directorio']);

// ── Preparación de la base ────────────────────────────────────────────────
const listo = (async () => {
  await pg.exec(STUB);
  for (const k of Object.keys(SQLS).sort()) await pg.exec(SQLS[k]);
  const usuarios = await sembrar({ pg, clienteDe, archivos });
  const quien = new URLSearchParams(location.search).get('demo') ?? sessionStorage.getItem('demo-usuario') ?? 'admin';
  sessionStorage.setItem('demo-usuario', quien);
  const u = usuarios[quien];
  actual = u ? { id: u.id, email: u.email } : null;
  window.__demo = { usuarios, clienteDe, pg, listo: true };
})();

// ── Consultas tipo PostgREST ──────────────────────────────────────────────
function partirNivel(s) {
  const out = []; let prof = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') prof++;
    if (ch === ')') prof--;
    if (ch === ',' && prof === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

class Consulta {
  constructor(t) { Object.assign(this, { t, cols: '*', w: [], p: [], o: [], lim: null, off: 0, uno: false, cabeza: false, contar: false }); }
  param(v) { this.p.push(v); return `$${this.p.length}`; }
  select(c = '*', opt = {}) { this.cols = c; this.cabeza = !!opt.head; this.contar = !!opt.count; return this; }
  eq(c, v) { this.w.push(`${c} = ${this.param(v)}`); return this; }
  neq(c, v) { this.w.push(`${c} is distinct from ${this.param(v)}`); return this; }
  in(c, arr) { this.w.push(`${c}::text = any(${this.param(arr.map(String))}::text[])`); return this; }
  or(s) {
    const cond = (x) => {
      const m = x.match(/^and\((.*)\)$/);
      if (m) return `(${partirNivel(m[1]).map(cond).join(' and ')})`;
      const [col, op, ...resto] = x.split('.'); const v = resto.join('.');
      if (op === 'eq') return `${col}::text = ${this.param(v)}`;
      if (op === 'in') return `${col}::text = any(${this.param(v.replace(/^\(|\)$/g, '').split(','))}::text[])`;
      throw new Error('Filtro no soportado en demo: ' + x);
    };
    this.w.push(`(${partirNivel(s).map(cond).join(' or ')})`); return this;
  }
  order(c, { ascending = true } = {}) { this.o.push(`${c} ${ascending ? 'asc' : 'desc'}`); return this; }
  range(a, b) { this.off = a; this.lim = b - a + 1; return this; }
  maybeSingle() { this.uno = true; return this; }
  async correr() {
    await listo;
    const where = this.w.length ? ` where ${this.w.join(' and ')}` : '';
    if (this.cabeza && this.contar) {
      const r = await ejecutar(actual?.id, async (tx) => (await tx.query(`select count(*)::int n from public.${this.t}${where}`, this.p)).rows);
      return { data: null, count: r[0].n, error: null };
    }
    let sql = `select ${this.cols} from public.${this.t}${where}`;
    if (this.o.length) sql += ` order by ${this.o.join(', ')}`;
    if (this.lim != null) sql += ` limit ${this.lim} offset ${this.off}`;
    const r = await res(ejecutar(actual?.id, async (tx) => (await tx.query(sql, this.p)).rows));
    if (r.error) return r;
    return { data: this.uno ? (r.data[0] ?? null) : r.data, error: null };
  }
  then(ok, mal) { return this.correr().then(ok, mal); }
}

export const supabase = {
  from: (t) => new Consulta(t),
  rpc: async (fn, args = {}) => {
    await listo;
    const c = clienteDe(actual?.id);
    return res(DE_TABLA.has(fn) ? c.rpcTabla(fn) : c.rpc(fn, args));
  },
  auth: {
    getSession: async () => { await listo; return { data: { session: sesion() }, error: null }; },
    signInWithPassword: async ({ email }) => {
      await listo;
      const [u] = (await pg.query('select id, email from auth.users where lower(email) = lower($1)', [email])).rows;
      if (!u) return { data: null, error: { message: 'Invalid login credentials' } };
      actual = { id: u.id, email: u.email };
      const clave = Object.entries(window.__demo.usuarios).find(([, x]) => x.id === u.id)?.[0];
      if (clave) sessionStorage.setItem('demo-usuario', clave);
      setTimeout(() => emitir('SIGNED_IN'), 0);
      return { data: { session: sesion() }, error: null };
    },
    signUp: async () => ({ data: { session: null, user: null }, error: null }),
    resetPasswordForEmail: async () => ({ data: {}, error: null }),
    updateUser: async () => ({ data: {}, error: null }),
    signOut: async (opt = {}) => {
      if (opt.scope === 'others') return { error: null };
      actual = null; sessionStorage.setItem('demo-usuario', 'ninguno');
      setTimeout(() => emitir('SIGNED_OUT'), 0);
      return { error: null };
    },
    onAuthStateChange: (cb) => { oyentes.add(cb); return { data: { subscription: { unsubscribe: () => oyentes.delete(cb) } } }; },
  },
  storage: {
    from: () => ({
      upload: async (ruta, file) => { await listo; return res(clienteDe(actual?.id).subir(ruta, file).then(() => ({ path: ruta }))); },
      createSignedUrl: async (ruta) => ({ data: { signedUrl: urlDe(ruta) }, error: null }),
      createSignedUrls: async (rutas) => ({ data: rutas.map((r) => ({ path: r, signedUrl: urlDe(r), error: null })), error: null }),
      remove: async (rutas) => { rutas.forEach((r) => archivos.delete(r)); return { data: [], error: null }; },
    }),
  },
};
