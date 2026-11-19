// El script único supabase/instalar.sql (el que se pega en Supabase) instala todo y habilita al administrador.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';
import { como } from './db.js';

test('instalar.sql: instala en un proyecto con un usuario ya registrado y lo hace administrador', async () => {
  execFileSync(process.execPath, ['scripts/unir-sql.js']);
  const sql = fs.readFileSync('supabase/instalar.sql', 'utf8').replaceAll('TU-EMAIL@EJEMPLO.COM', 'Duena@Andorinas.com');
  const pg = new PGlite({ parsers: { 20: Number, 1082: (v) => v } });
  const stub = fs.readFileSync(new URL('./db.js', import.meta.url), 'utf8').match(/const STUB_SUPABASE = `([\s\S]*?)`;/)[1];
  await pg.exec(stub);
  // La dueña se registró ANTES de instalar el esquema.
  await pg.query("insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'duena@andorinas.com')");
  await pg.exec(sql);
  const [p] = (await pg.query('select rol from perfiles')).rows;
  assert.equal(p.rol, 'admin');
  const yo = como(pg, '11111111-1111-1111-1111-111111111111');
  const id = await yo.rpc('crear_obra', { p: { nombre: 'Primera obra', fecha_inicio: '2026-11-20', rubros: ['Estructura'] } });
  assert.ok(id > 0);
  // Quien se registra después queda pendiente.
  await pg.query("insert into auth.users (id, email) values ('22222222-2222-2222-2222-222222222222', 'otro@x.com')");
  assert.equal((await pg.query("select rol from perfiles where email = 'otro@x.com'")).rows[0].rol, 'pendiente');
});
