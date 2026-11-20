// Gremios: sólo ven lo suyo (nunca importes), partes de avance con aprobación, reclamos en ambos sentidos y fotos.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { entorno, obraCon, ver, fila, $ } from './helpers.js';
import { como, crearUsuario } from './db.js';

let ctx, O, B, elec, plom;
const subir = async (cli, obraId, nombre) => {
  const ruta = `obra-${obraId}/${nombre}`;
  await cli.query("insert into storage.objects (bucket_id, name) values ('adjuntos', $1)", [ruta]);
  return cli.rpc('registrar_adjunto', { p_obra: obraId, p_ruta: ruta, p_nombre: nombre, p_mime: 'image/jpeg', p_tamano: 10 });
};

before(async () => {
  ctx = await entorno();
  const { pg, admin } = ctx;
  O = await obraCon(admin);
  B = await obraCon(admin, ['Pintura']);
  elec = como(pg, await crearUsuario(pg, 'electricista@test', 'gremio'));
  plom = como(pg, await crearUsuario(pg, 'plomero@test', 'gremio'));
  await admin.rpc('asignar_rubros_gremio', { p_usuario: elec.id, p_rubros: [O.r.Electricidad] });
  await admin.rpc('asignar_rubros_gremio', { p_usuario: plom.id, p_rubros: [O.r.Estructura] });
  await admin.rpc('definir_presupuesto', { p_rubro: O.r.Electricidad, p: { moneda: 'ARS', importe: $(1000), fecha_ref: '2026-03-02' } });
  await admin.rpc('crear_gasto', { p_obra: O.obraId, p: { fecha: '2026-03-02', concepto: 'Cables', rubro_id: O.r.Electricidad, tipo_id: O.t.Materiales, moneda: 'ARS', importe: $(500), condicion: 'contado' } });
});

test('el gremio ve sólo su obra y su rubro, y ningún importe', async () => {
  assert.deepEqual((await elec.query('select id from obras')).map((x) => x.id), [O.obraId]);
  assert.deepEqual((await elec.query('select nombre from rubros')).map((x) => x.nombre), ['Electricidad']);
  for (const t of ['compromisos', 'pagos', 'presupuestos', 'avances', 'auditoria', 'cotizaciones', 'proveedores', 'tipos_gasto']) {
    assert.equal((await elec.query(`select * from ${t}`)).length, 0, t);
  }
  await assert.rejects(() => elec.rpc('crear_gasto', { p_obra: O.obraId, p: {} }), /acceso/);
  await assert.rejects(() => elec.rpc('cargar_avance', { p_rubro: O.r.Electricidad, p: { fecha: '2026-03-05', porcentaje: 10 } }), /acceso/);
  await assert.rejects(() => elec.rpc('crear_parte_avance', { p_rubro: O.r.Estructura, p: { fecha: '2026-03-05', porcentaje: 10 } }), /asignado/);
});

test('parte de avance con fotos: pendiente hasta que la empresa lo aprueba', async () => {
  const { admin } = ctx;
  const f1 = await subir(elec, O.obraId, 'avance1.jpg');
  const { id } = await elec.rpc('crear_parte_avance', { p_rubro: O.r.Electricidad, p: { fecha: '2026-03-05', porcentaje: 30, comentario: 'Cañerías PB', fotos: [f1] } });
  assert.equal(fila(await ver(admin, O.obraId), 'Electricidad').avance, null, 'pendiente: no cuenta');
  assert.equal((await admin.query('select count(*)::int n from fotos where parte_id = $1', [id]))[0].n, 1);
  await assert.rejects(() => elec.rpc('revisar_parte', { p_parte: id, p_aprobar: true }), /sin acceso/);
  const r = await admin.rpc('revisar_parte', { p_parte: id, p_aprobar: true });
  assert.equal(r.estado, 'aprobado');
  assert.equal(fila(await ver(admin, O.obraId), 'Electricidad').avance, 30, 'aprobado: cuenta en el avance oficial');
  const [p] = await elec.query('select estado from partes_avance where id = $1', [id]);
  assert.equal(p.estado, 'aprobado', 'el gremio ve el estado de su parte');
  // rechazo con motivo
  const p2 = await elec.rpc('crear_parte_avance', { p_rubro: O.r.Electricidad, p: { fecha: '2026-03-06', porcentaje: 90 } });
  await assert.rejects(() => admin.rpc('revisar_parte', { p_parte: p2.id, p_aprobar: false }), /motivo/);
  await admin.rpc('revisar_parte', { p_parte: p2.id, p_aprobar: false, p_motivo: 'No coincide con lo visto en obra' });
  assert.equal(fila(await ver(admin, O.obraId), 'Electricidad').avance, 30);
});

test('reclamos en ambos sentidos, con conversación y estado; cada gremio ve sólo los suyos', async () => {
  const { admin } = ctx;
  const foto = await subir(elec, O.obraId, 'falta.jpg');
  const r1 = await elec.rpc('crear_reclamo', { p_obra: O.obraId, p: { rubro_id: O.r.Electricidad, titulo: 'Falta material', descripcion: 'No llegaron los cables', fotos: [foto] } });
  await assert.rejects(() => elec.rpc('crear_reclamo', { p_obra: O.obraId, p: { rubro_id: O.r.Estructura, titulo: 'x' } }), /tus rubros/);
  const r2 = await admin.rpc('crear_reclamo', { p_obra: O.obraId, p: { gremio_id: plom.id, rubro_id: O.r.Estructura, titulo: 'Pérdida en baño' } });
  await admin.rpc('responder_reclamo', { p_reclamo: r1.id, p: { texto: 'Llegan mañana', estado: 'en_curso' } });
  await elec.rpc('responder_reclamo', { p_reclamo: r1.id, p: { texto: 'Recibido, gracias', estado: 'resuelto' } });
  assert.deepEqual((await elec.query('select id, estado from reclamos')).map((x) => ({ ...x })), [{ id: r1.id, estado: 'resuelto' }]);
  assert.deepEqual((await plom.query('select id, direccion from reclamos')).map((x) => ({ ...x })), [{ id: r2.id, direccion: 'empresa_a_gremio' }]);
  assert.equal((await elec.query('select * from reclamo_mensajes where reclamo_id = $1', [r1.id])).length, 2);
  await assert.rejects(() => plom.rpc('responder_reclamo', { p_reclamo: r1.id, p: { texto: 'x' } }), /sin acceso/);
  assert.equal((await admin.query('select * from reclamos where obra_id = $1', [O.obraId])).length, 2, 'la empresa ve todos');
});

test('fotos: la empresa arma la galería; el gremio sólo ve sus fotos y las de sus reclamos', async () => {
  const { admin } = ctx;
  const fe = await subir(admin, O.obraId, 'losa.jpg');
  assert.equal(await admin.rpc('agregar_fotos', { p_obra: O.obraId, p: { rubro_id: O.r.Estructura, descripcion: 'Losa PB', fotos: [fe] } }), 1);
  const galeria = await admin.query('select * from fotos where obra_id = $1', [O.obraId]);
  assert.ok(galeria.length >= 3, 'empresa ve todas (galería + partes + reclamos)');
  const delElec = await elec.query('select f.id, a.ruta from fotos f join adjuntos a on a.id = f.adjunto_id');
  assert.ok(delElec.every((x) => !x.ruta.endsWith('losa.jpg')), 'no ve la foto de la empresa');
  assert.equal((await elec.query("select * from storage.objects where name like '%losa.jpg'")).length, 0);
  assert.equal((await elec.query("select * from storage.objects where name like '%falta.jpg'")).length, 1);
  assert.equal((await plom.query("select * from storage.objects where name like '%falta.jpg'")).length, 0);
  // No puede vincular una foto ajena ni subir a una obra donde no trabaja
  await assert.rejects(() => elec.rpc('crear_parte_avance', { p_rubro: O.r.Electricidad, p: { fecha: '2026-03-07', porcentaje: 40, fotos: [fe] } }), /Foto inválida/);
  await assert.rejects(() => elec.query("insert into storage.objects (bucket_id, name) values ('adjuntos', $1)", [`obra-${B.obraId}/x.jpg`]), /row-level security/);
  await assert.rejects(() => elec.rpc('agregar_fotos', { p_obra: O.obraId, p: { fotos: [] } }), /acceso/);
});

test('el Excel incluye partes, reclamos y fotos; el PDF resume reclamos sin resolver (a la fecha de corte)', async () => {
  const { admin } = ctx;
  const { generarExcel, filtrarGremios } = await import('../shared/exports/excel.js');
  const { generarPdf } = await import('../shared/exports/pdf.js');
  const ExcelJS = (await import('exceljs')).default;
  const partes = await admin.query('select * from partes_avance where obra_id = $1 order by id', [O.obraId]);
  const reclamos = await admin.query('select * from reclamos where obra_id = $1 order by id', [O.obraId]);
  const fotos = (await admin.query('select * from fotos where obra_id = $1 order by id', [O.obraId]))
    .map((x) => ({ ...x, origen: x.parte_id ? 'Parte de avance' : x.reclamo_id ? 'Reclamo' : 'Galería' }));
  const g = filtrarGremios({ partes: partes.map((p) => ({ ...p, rubro: 'Electricidad' })), reclamos, fotos }, '2026-12-31');
  const inf = await ver(admin, O.obraId);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await generarExcel(inf, g));
  assert.equal(wb.getWorksheet('Partes de avance').actualRowCount, 1 + partes.length);
  assert.equal(wb.getWorksheet('Reclamos').actualRowCount, 1 + reclamos.length);
  assert.equal(wb.getWorksheet('Fotos').actualRowCount, 1 + fotos.length);
  assert.ok(wb.getWorksheet('Partes de avance').getRow(2).getCell(1).value instanceof Date, 'fechas como celdas de fecha');
  // A una fecha de corte anterior, los partes posteriores no aparecen
  assert.equal(filtrarGremios({ partes, reclamos, fotos }, '2026-03-05').partes.length, 1);
  const pdf = await generarPdf(inf, { gremios: g });
  assert.equal(new TextDecoder().decode(pdf.subarray(0, 5)), '%PDF-');
});

test('eliminar la obra borra también partes, reclamos y fotos', async () => {
  const { admin, pg } = ctx;
  const nombre = (await admin.query('select nombre from obras where id = $1', [O.obraId]))[0].nombre;
  await admin.rpc('eliminar_obra', { p_obra: O.obraId, p_confirmacion: nombre });
  for (const t of ['fotos', 'reclamos', 'partes_avance', 'gremio_rubros']) {
    assert.equal((await pg.query(`select count(*)::int n from ${t} where obra_id = $1`, [O.obraId])).rows[0].n, 0, t);
  }
});
