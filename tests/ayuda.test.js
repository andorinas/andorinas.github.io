// Ayuda por rol (migración 012): cada usuario sólo abre los videos e instructivo de su perfil.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { entorno } from './helpers.js';
import { como, crearUsuario } from './db.js';

let ctx, gremio, cliente, pendiente;
const ARCHIVOS = ['empresa/video-empresa.mp4', 'empresa/instructivo.pdf', 'gremios/video-gremios.mp4', 'clientes/video-clientes.mp4'];
const veo = async (c) => (await c.query("select name from storage.objects where bucket_id = 'ayuda' order by name")).map((x) => x.name);

before(async () => {
  ctx = await entorno({ cotizaciones: false });
  const { pg, admin } = ctx;
  gremio = como(pg, await crearUsuario(pg, 'gremio@test', 'gremio'));
  cliente = como(pg, await crearUsuario(pg, 'cliente@test', 'cliente'));
  pendiente = como(pg, await crearUsuario(pg, 'pendiente@test'));
  for (const n of ARCHIVOS) await admin.query("insert into storage.objects (bucket_id, name) values ('ayuda', $1)", [n]);
});

test('cada rol ve sólo la ayuda de su perfil', async () => {
  const { admin, enc } = ctx;
  assert.deepEqual(await veo(admin), ARCHIVOS.slice().sort(), 'administrador: todo');
  assert.deepEqual(await veo(enc), ARCHIVOS.slice().sort(), 'encargado: todo');
  assert.deepEqual(await veo(gremio), ['gremios/video-gremios.mp4'], 'gremio: sólo su video');
  assert.deepEqual(await veo(cliente), ['clientes/video-clientes.mp4'], 'cliente: sólo su video');
  assert.deepEqual(await veo(pendiente), [], 'pendiente: nada');
});

test('sólo el administrador sube, y sólo a las carpetas previstas', async () => {
  const { admin, enc } = ctx;
  await admin.query("insert into storage.objects (bucket_id, name) values ('ayuda', 'clientes/guia.pdf')");
  for (const [c, quien] of [[enc, 'encargado'], [gremio, 'gremio'], [cliente, 'cliente']]) {
    await assert.rejects(() => c.query("insert into storage.objects (bucket_id, name) values ('ayuda', 'gremios/falso.mp4')"), /row-level security/, quien);
  }
  await assert.rejects(() => admin.query("insert into storage.objects (bucket_id, name) values ('ayuda', 'otra/cosa.mp4')"), /row-level security/);
  // Un desactivado pierde el acceso
  await admin.rpc('actualizar_usuario', { p_id: gremio.id, p: { activo: false } });
  assert.deepEqual(await veo(gremio), []);
  await admin.rpc('actualizar_usuario', { p_id: gremio.id, p: { activo: true } });
});
