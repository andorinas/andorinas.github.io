// Seguridad del esquema Supabase: RLS por obra, escrituras sólo por funciones, roles y comprobantes.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { entorno, obraCon, $ } from './helpers.js';
import { como, crearUsuario } from './db.js';

let ctx, A, B, pend, anon;
before(async () => {
  ctx = await entorno();
  A = await obraCon(ctx.admin);
  B = { obraId: await ctx.admin.rpc('crear_obra', { p: { nombre: 'Obra ajena', fecha_inicio: '2026-03-01', rubros: ['Pintura'] } }) };
  await ctx.admin.rpc('actualizar_usuario', { p_id: ctx.enc.id, p: { obras: [A.obraId] } });
  pend = como(ctx.pg, await crearUsuario(ctx.pg, 'nuevo@test'));
  anon = como(ctx.pg, null);
  await ctx.admin.rpc('crear_gasto', { p_obra: B.obraId, p: { fecha: '2026-03-02', concepto: 'Secreto', rubro_id: (await ctx.admin.query('select id from rubros where obra_id = $1', [B.obraId]))[0].id, tipo_id: A.t.Materiales, moneda: 'ARS', importe: $(1000), condicion: 'contado' } });
});

test('el encargado sólo ve sus obras asignadas (también movimientos y pagos)', async () => {
  const { enc } = ctx;
  assert.deepEqual((await enc.query('select id from obras')).map((x) => x.id), [A.obraId]);
  assert.equal((await enc.query('select * from compromisos where obra_id = $1', [B.obraId])).length, 0);
  assert.equal((await enc.query('select * from pagos where obra_id = $1', [B.obraId])).length, 0);
  await assert.rejects(() => enc.rpc('crear_gasto', { p_obra: B.obraId, p: { fecha: '2026-03-02', concepto: 'x', rubro_id: 1, tipo_id: 1, moneda: 'ARS', importe: 100, condicion: 'contado' } }), /No tenés acceso/);
});

test('funciones de administrador bloqueadas para el encargado', async () => {
  const { enc } = ctx;
  await assert.rejects(() => enc.rpc('crear_obra', { p: { nombre: 'x', fecha_inicio: '2026-01-01' } }), /administrador/);
  await assert.rejects(() => enc.rpc('definir_presupuesto', { p_rubro: A.r.Electricidad, p: { moneda: 'ARS', importe: 1, fecha_ref: '2026-03-02' } }), /administrador/);
  await assert.rejects(() => enc.rpc('definir_pesos', { p_obra: A.obraId, p_pesos: [] }), /administrador/);
  await assert.rejects(() => enc.rpc('cargar_cotizacion', { p_fecha: '2026-05-01', p_venta: 1 }), /administrador/);
  await assert.rejects(() => enc.rpc('actualizar_usuario', { p_id: enc.id, p: { rol: 'admin' } }), /administrador/);
  await assert.rejects(() => enc.rpc('exportar_respaldo'), /administrador/);
});

test('nadie puede escribir tablas directamente ni ascender su propio rol', async () => {
  const { enc } = ctx;
  await assert.rejects(() => enc.query("insert into obras (nombre, fecha_inicio) values ('hack', '2026-01-01')"), /permission denied/);
  await assert.rejects(() => enc.query("update perfiles set rol = 'admin' where id = auth.uid()"), /permission denied/);
  await assert.rejects(() => enc.query('delete from compromisos'), /permission denied/);
  assert.equal((await enc.query('select * from configuracion')).length, 0, 'configuración no legible');
  await assert.rejects(() => enc.rpc('_crear_rubro', { p_obra: A.obraId, p_nombre: 'x' }), /permission denied/);
});

test('usuario recién registrado (pendiente) no ve ni carga nada', async () => {
  assert.equal((await pend.query('select * from obras')).length, 0);
  assert.equal((await pend.query('select * from tipos_gasto')).length, 0);
  await assert.rejects(() => pend.rpc('crear_tipo', { p_nombre: 'x' }), /no está habilitado/);
  const [yo] = await pend.query('select rol from perfiles where id = auth.uid()');
  assert.equal(yo.rol, 'pendiente');
});

test('sin sesión (anon) sólo puede usar ping', async () => {
  assert.equal(await anon.rpc('ping'), true);
  await assert.rejects(() => anon.rpc('crear_obra', { p: {} }), /permission denied/);
  await assert.rejects(() => anon.query('select * from obras'), /permission denied/);
});

test('comprobantes: sólo se suben y leen en obras propias', async () => {
  const { enc, admin } = ctx;
  await enc.query("insert into storage.objects (bucket_id, name) values ('adjuntos', $1)", [`obra-${A.obraId}/factura.pdf`]);
  await assert.rejects(() => enc.query("insert into storage.objects (bucket_id, name) values ('adjuntos', $1)", [`obra-${B.obraId}/x.pdf`]), /row-level security/);
  await assert.rejects(() => enc.query("insert into storage.objects (bucket_id, name) values ('adjuntos', 'sin-obra/x.pdf')"), /row-level security/);
  const id = await enc.rpc('registrar_adjunto', { p_obra: A.obraId, p_ruta: `obra-${A.obraId}/factura.pdf`, p_nombre: 'factura.pdf', p_mime: 'application/pdf', p_tamano: 100 });
  assert.ok(id > 0);
  await assert.rejects(() => enc.rpc('registrar_adjunto', { p_obra: A.obraId, p_ruta: `obra-${A.obraId}/no-existe.pdf`, p_nombre: 'x', p_mime: 'application/pdf', p_tamano: 1 }), /no se subió/);
  await admin.query("insert into storage.objects (bucket_id, name) values ('adjuntos', $1)", [`obra-${B.obraId}/privado.jpg`]);
  assert.equal((await enc.query("select * from storage.objects where name like $1", [`obra-${B.obraId}/%`])).length, 0);
  assert.equal((await admin.query("select * from storage.objects where name like $1", [`obra-${B.obraId}/%`])).length, 1);
  // No puede vincular un adjunto de otra obra a un gasto propio.
  const ajeno = await admin.rpc('registrar_adjunto', { p_obra: B.obraId, p_ruta: `obra-${B.obraId}/privado.jpg`, p_nombre: 'p.jpg', p_mime: 'image/jpeg', p_tamano: 1 });
  await assert.rejects(() => enc.rpc('crear_gasto', { p_obra: A.obraId, p: { fecha: '2026-03-02', concepto: 'x', rubro_id: A.r.Estructura, tipo_id: A.t.Materiales, moneda: 'ARS', importe: 100, condicion: 'contado', adjunto_id: ajeno } }), /Adjunto inválido/);
});

test('administrador: habilita usuarios y descarga respaldo completo', async () => {
  const { admin } = ctx;
  await admin.rpc('actualizar_usuario', { p_id: pend.id, p: { rol: 'encargado', obras: [B.obraId] } });
  assert.deepEqual((await pend.query('select nombre from obras')).map((x) => x.nombre), ['Obra ajena']);
  await assert.rejects(() => admin.rpc('actualizar_usuario', { p_id: admin.id, p: { activo: false } }), /propio usuario/);
  const r = await admin.rpc('exportar_respaldo');
  assert.ok(r.obras.length === 2 && r.compromisos.length >= 1 && Array.isArray(r.auditoria));
  // Desactivar corta el acceso de inmediato.
  await admin.rpc('actualizar_usuario', { p_id: pend.id, p: { activo: false } });
  assert.equal((await pend.query('select * from obras')).length, 0);
});

test('corrección y anulación quedan auditadas con usuario y motivo', async () => {
  const { enc, admin } = ctx;
  const g = await enc.rpc('crear_gasto', { p_obra: A.obraId, p: { fecha: '2026-03-03', concepto: 'Arena', rubro_id: A.r.Estructura, tipo_id: A.t.Materiales, moneda: 'ARS', importe: $(50_000), condicion: 'contado' } });
  await assert.rejects(() => enc.rpc('corregir_compromiso', { p_id: g.id, p: { importe: $(55_000) } }), /Motivo/);
  await enc.rpc('corregir_compromiso', { p_id: g.id, p: { importe: $(55_000), motivo: 'Faltó el flete' } });
  const [pago] = await enc.query('select importe_pagado from pagos where compromiso_id = $1', [g.id]);
  assert.equal(pago.importe_pagado, $(55_000), 'el pago al contado acompaña la corrección');
  await enc.rpc('anular_compromiso', { p_id: g.id, p_motivo: 'Cargado dos veces' });
  const aud = await admin.query("select accion, usuario_id, motivo from auditoria where entidad = 'compromiso' and entidad_id = $1 order by id", [g.id]);
  assert.deepEqual(aud.map((a) => a.accion), ['alta', 'correccion', 'anulacion']);
  assert.ok(aud.every((a) => a.usuario_id === enc.id));
  assert.equal(aud[2].motivo, 'Cargado dos veces');
});
