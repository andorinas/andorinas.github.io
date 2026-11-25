// Regresión de los hallazgos de la auditoría de QA del 25/11/2026 (QA-02 a QA-05).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { entorno, obraCon, $ } from './helpers.js';
import { como, crearUsuario } from './db.js';

let ctx, O, B, cli, cli2, otro, elec;
const hoyAR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const masDias = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const subir = async (c, obraId, nombre, mime = 'image/jpeg') => {
  const ruta = `obra-${obraId}/${nombre}`;
  await c.query("insert into storage.objects (bucket_id, name) values ('adjuntos', $1)", [ruta]);
  return c.rpc('registrar_adjunto', { p_obra: obraId, p_ruta: ruta, p_nombre: nombre, p_mime: mime, p_tamano: 10 });
};
const nombres = async (c) => (await c.query('select nombre from directorio() order by nombre')).map((x) => x.nombre);

before(async () => {
  ctx = await entorno();
  const { pg, admin } = ctx;
  O = await obraCon(admin);
  B = await obraCon(admin, ['Pintura']);
  cli = como(pg, await crearUsuario(pg, 'cliente@test', 'cliente'));
  cli2 = como(pg, await crearUsuario(pg, 'conyuge@test', 'cliente'));
  otro = como(pg, await crearUsuario(pg, 'otro-cliente@test', 'cliente'));
  elec = como(pg, await crearUsuario(pg, 'electricista@test', 'gremio'));
  await admin.rpc('asignar_obras_cliente', { p_usuario: cli.id, p_obras: [O.obraId] });
  await admin.rpc('asignar_obras_cliente', { p_usuario: cli2.id, p_obras: [O.obraId] });
  await admin.rpc('asignar_obras_cliente', { p_usuario: otro.id, p_obras: [B.obraId] });
  await admin.rpc('asignar_rubros_gremio', { p_usuario: elec.id, p_rubros: [O.r.Electricidad] });
});

test('QA-02 · directorio: cliente y gremio sólo ven a la empresa (y el cliente, a los de su obra)', async () => {
  const { admin } = ctx;
  const empresa = ['admin', 'enc'];
  assert.deepEqual(await nombres(cli), [...empresa, 'cliente', 'conyuge'].sort(), 'cliente: empresa, él y el otro dueño de su obra');
  assert.deepEqual(await nombres(otro), [...empresa, 'otro-cliente'].sort(), 'cliente de otra obra: no ve a los de la obra A');
  assert.deepEqual(await nombres(elec), [...empresa, 'electricista'].sort(), 'gremio: no ve clientes ni otros gremios');
  assert.deepEqual(await nombres(admin), ['admin', 'cliente', 'conyuge', 'electricista', 'enc', 'otro-cliente'], 'la empresa ve a todos');
});

test('QA-03 · gremio desasignado deja de ver y responder sus reclamos; reasignado vuelve a verlos', async () => {
  const { admin } = ctx;
  const foto = await subir(admin, O.obraId, 'reclamo.jpg');
  const r = await admin.rpc('crear_reclamo', { p_obra: O.obraId, p: { gremio_id: elec.id, rubro_id: O.r.Electricidad, titulo: 'Revisar tablero', fotos: [foto] } });
  assert.equal((await elec.query('select id from reclamos')).length, 1, 'asignado: lo ve');
  await admin.rpc('asignar_rubros_gremio', { p_usuario: elec.id, p_rubros: [] });
  await admin.rpc('responder_reclamo', { p_reclamo: r.id, p: { texto: 'Mensaje interno posterior a la baja' } });
  assert.equal((await elec.query('select id from reclamos')).length, 0);
  assert.equal((await elec.query('select id from reclamo_mensajes')).length, 0);
  assert.equal((await elec.query('select id from fotos')).length, 0);
  assert.equal((await elec.query("select name from storage.objects where name like '%reclamo.jpg'")).length, 0, 'no abre la foto');
  await assert.rejects(() => elec.rpc('responder_reclamo', { p_reclamo: r.id, p: { estado: 'resuelto' } }), /sin acceso/);
  await admin.rpc('asignar_rubros_gremio', { p_usuario: elec.id, p_rubros: [O.r.Electricidad] });
  assert.equal((await elec.query('select id from reclamos')).length, 1, 'reasignado: lo vuelve a ver');
  await elec.rpc('responder_reclamo', { p_reclamo: r.id, p: { texto: 'Ya lo reviso' } });
});

test('QA-04 · nadie puede registrar ni renombrar un archivo que subió otra persona', async () => {
  const { admin } = ctx;
  const ruta = `obra-${O.obraId}/plano.pdf`;
  await admin.query("insert into storage.objects (bucket_id, name) values ('adjuntos', $1)", [ruta]);
  const id = await admin.rpc('registrar_adjunto', { p_obra: O.obraId, p_ruta: ruta, p_nombre: 'plano.pdf', p_mime: 'application/pdf', p_tamano: 10 });
  await assert.rejects(() => cli.rpc('registrar_adjunto', { p_obra: O.obraId, p_ruta: ruta, p_nombre: 'HACKEADO.exe', p_mime: 'image/jpeg', p_tamano: 1 }), /inválida/);
  await assert.rejects(() => elec.rpc('registrar_adjunto', { p_obra: O.obraId, p_ruta: ruta, p_nombre: 'x', p_mime: 'image/jpeg', p_tamano: 1 }), /inválida/);
  assert.equal((await admin.query('select nombre from adjuntos where id = $1', [id]))[0].nombre, 'plano.pdf');
  // Quien lo subió puede reintentar el registro (reintento tras un corte de red) y obtiene el mismo id
  assert.equal(await admin.rpc('registrar_adjunto', { p_obra: O.obraId, p_ruta: ruta, p_nombre: 'plano-v2.pdf', p_mime: 'application/pdf', p_tamano: 10 }), id);
});

test('QA-05 · fechas: no posteriores a hoy ni más de un año antes del inicio; lo normal sigue funcionando', async () => {
  const { admin, enc } = ctx;
  await admin.rpc('actualizar_usuario', { p_id: enc.id, p: { obras: [O.obraId, B.obraId] } });
  const hoy = hoyAR(), manana = masDias(hoy, 1);
  const gasto = (fecha) => enc.rpc('crear_gasto', { p_obra: O.obraId, p: { fecha, concepto: 'Cemento', rubro_id: O.r.Estructura, tipo_id: O.t.Materiales,
    moneda: 'ARS', importe: $(1000), condicion: 'contado', proveedor: 'Corralón' } });
  await assert.rejects(() => gasto('2099-01-01'), /Fecha del gasto: no puede ser posterior a hoy/);
  await assert.rejects(() => gasto(manana), /posterior a hoy/);
  await assert.rejects(() => gasto('1900-01-01'), /más de un año anterior al inicio/);
  const g = await gasto(hoy); // hoy: válido
  assert.ok(g.id);
  assert.ok((await gasto('2025-04-01')).id, 'compras previas al inicio (dentro del año) se aceptan');
  await assert.rejects(() => enc.rpc('cargar_avance', { p_rubro: O.r.Estructura, p: { fecha: manana, porcentaje: 10 } }), /Fecha del avance/);
  await assert.rejects(() => elec.rpc('crear_parte_avance', { p_rubro: O.r.Electricidad, p: { fecha: '2099-05-01', porcentaje: 10 } }), /Fecha del parte/);
  await assert.rejects(() => enc.rpc('crear_novedad', { p_obra: O.obraId, p: { fecha: '2099-05-01', titulo: 'x' } }), /Fecha de la novedad/);
  const f = await subir(enc, O.obraId, 'futura.jpg');
  await assert.rejects(() => enc.rpc('agregar_fotos', { p_obra: O.obraId, p: { fecha: '2099-05-01', fotos: [f] } }), /Fecha de la foto/);
  const cuenta = await enc.rpc('crear_gasto', { p_obra: O.obraId, p: { fecha: hoy, concepto: 'Hierro a cuenta', rubro_id: O.r.Estructura, tipo_id: O.t.Materiales,
    moneda: 'ARS', importe: $(5000), condicion: 'a_cuenta', proveedor: 'Corralón' } });
  await assert.rejects(() => enc.rpc('registrar_pago', { p_comp: cuenta.id, p: { fecha: '2099-01-01', moneda_pago: 'ARS', importe_pagado: $(1) } }), /Fecha del pago/);
  await enc.rpc('registrar_pago', { p_comp: cuenta.id, p: { fecha: hoy, moneda_pago: 'ARS', importe_pagado: $(1000) } });
  // Lo de todos los días sigue andando
  await enc.rpc('cargar_avance', { p_rubro: O.r.Estructura, p: { fecha: hoy, porcentaje: 10 } });
  await enc.rpc('crear_novedad', { p_obra: O.obraId, p: { titulo: 'Sin fecha: usa hoy' } });
  await enc.rpc('agregar_fotos', { p_obra: O.obraId, p: { fecha: hoy, fotos: [f] } });
});

// ── Correcciones menores (migración 011) ───────────────────────────────────
test('S-05 · un comprobante de gasto no se puede publicar como documento', async () => {
  const { admin } = ctx;
  const comp = await subir(admin, O.obraId, 'factura.pdf', 'application/pdf');
  await admin.rpc('crear_gasto', { p_obra: O.obraId, p: { fecha: hoyAR(), concepto: 'Arena', rubro_id: O.r.Estructura, tipo_id: O.t.Materiales,
    moneda: 'ARS', importe: $(500), condicion: 'contado', proveedor: 'Corralón', adjunto_id: comp } });
  await assert.rejects(() => admin.rpc('crear_documento', { p_obra: O.obraId, p: { adjunto_id: comp, titulo: 'Factura', categoria: 'otro' } }), /comprobante, foto o documento/);
  const plano = await subir(admin, O.obraId, 'plano-nuevo.pdf', 'application/pdf');
  const d = await admin.rpc('crear_documento', { p_obra: O.obraId, p: { adjunto_id: plano, titulo: 'Plano', categoria: 'plano' } });
  await assert.rejects(() => admin.rpc('crear_documento', { p_obra: O.obraId, p: { adjunto_id: plano, titulo: 'Plano otra vez' } }), /ya está cargado/);
  await admin.rpc('anular_documento', { p_id: d.id });
  await assert.rejects(() => admin.rpc('anular_documento', { p_id: d.id }), /ya estaba quitado/);
});

test('S-06 · lo anulado no se re-anula (se conserva el motivo original)', async () => {
  const { admin } = ctx;
  const g = await admin.rpc('crear_gasto', { p_obra: O.obraId, p: { fecha: hoyAR(), concepto: 'Para anular', rubro_id: O.r.Estructura, tipo_id: O.t.Materiales,
    moneda: 'ARS', importe: $(800), condicion: 'a_cuenta', proveedor: 'Corralón' } });
  g.pago_id = (await admin.rpc('registrar_pago', { p_comp: g.id, p: { fecha: hoyAR(), moneda_pago: 'ARS', importe_pagado: $(300) } })).id;
  await admin.rpc('anular_pago', { p_id: g.pago_id, p_motivo: 'Cargado dos veces' });
  await assert.rejects(() => admin.rpc('anular_pago', { p_id: g.pago_id, p_motivo: 'Otro motivo' }), /ya estaba anulado/);
  await admin.rpc('anular_compromiso', { p_id: g.id, p_motivo: 'Error de carga' });
  await assert.rejects(() => admin.rpc('anular_compromiso', { p_id: g.id, p_motivo: 'Otro' }), /ya estaba anulado/);
  const [c] = await admin.query('select anulado_motivo from compromisos where id = $1', [g.id]);
  const [p] = await admin.query('select anulado_motivo from pagos where id = $1', [g.pago_id]);
  assert.equal(c.anulado_motivo, 'Error de carga');
  assert.equal(p.anulado_motivo, 'Cargado dos veces', 'el pago conserva su motivo propio');
  const av = await admin.rpc('cargar_avance', { p_rubro: O.r.Estructura, p: { fecha: hoyAR(), porcentaje: 15 } });
  await admin.rpc('anular_avance', { p_id: av.id, p_motivo: 'Mal cargado' });
  await assert.rejects(() => admin.rpc('anular_avance', { p_id: av.id, p_motivo: 'Otro' }), /ya estaba anulado/);
  const n = await admin.rpc('crear_novedad', { p_obra: O.obraId, p: { titulo: 'Para quitar' } });
  await admin.rpc('anular_novedad', { p_id: n.id });
  await assert.rejects(() => admin.rpc('anular_novedad', { p_id: n.id }), /ya estaba quitada/);
});

test('B3 · partes y reclamos reenviados: mismo envío no duplica; otros datos con la misma clave se rechazan', async () => {
  const p1 = await elec.rpc('crear_parte_avance', { p_rubro: O.r.Electricidad, p: { fecha: hoyAR(), porcentaje: 40, clave_idem: 'qa-parte-1' } });
  const p2 = await elec.rpc('crear_parte_avance', { p_rubro: O.r.Electricidad, p: { fecha: hoyAR(), porcentaje: 40, clave_idem: 'qa-parte-1' } });
  assert.equal(p2.id, p1.id); assert.equal(p2.duplicado, true);
  await assert.rejects(() => elec.rpc('crear_parte_avance', { p_rubro: O.r.Electricidad, p: { fecha: hoyAR(), porcentaje: 55, clave_idem: 'qa-parte-1' } }), /otros datos/);
  const r1 = await cli.rpc('crear_reclamo', { p_obra: O.obraId, p: { titulo: '¿Cuándo pintan?', clave_idem: 'qa-rec-1' } });
  assert.equal((await cli.rpc('crear_reclamo', { p_obra: O.obraId, p: { titulo: '¿Cuándo pintan?', clave_idem: 'qa-rec-1' } })).id, r1.id);
  await assert.rejects(() => cli.rpc('crear_reclamo', { p_obra: O.obraId, p: { titulo: 'Otra cosa', clave_idem: 'qa-rec-1' } }), /otros datos/);
});

test('B2 · no se aceptan partes de un rubro desactivado', async () => {
  const { admin } = ctx;
  await admin.rpc('actualizar_rubro', { p_id: O.r.Electricidad, p: { activo: false } });
  await assert.rejects(() => elec.rpc('crear_parte_avance', { p_rubro: O.r.Electricidad, p: { fecha: hoyAR(), porcentaje: 60 } }), /desactivado/);
  await admin.rpc('actualizar_rubro', { p_id: O.r.Electricidad, p: { activo: true } });
  assert.ok((await elec.rpc('crear_parte_avance', { p_rubro: O.r.Electricidad, p: { fecha: hoyAR(), porcentaje: 60 } })).id, 'reactivado: vuelve a aceptar');
});
