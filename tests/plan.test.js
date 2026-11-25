// Portal de clientes, etapa 2: plan de obra por rubro y documentos que la empresa comparte con el cliente.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { entorno, obraCon } from './helpers.js';
import { como, crearUsuario } from './db.js';
import { avancePlanificado, curvaPlan, rangoPlan } from '../shared/plan.js';

let ctx, O, B, cli, otro, gremio;
const subir = async (c, obraId, nombre, mime = 'application/pdf') => {
  const ruta = `obra-${obraId}/${nombre}`;
  await c.query("insert into storage.objects (bucket_id, name) values ('adjuntos', $1)", [ruta]);
  return c.rpc('registrar_adjunto', { p_obra: obraId, p_ruta: ruta, p_nombre: nombre, p_mime: mime, p_tamano: 10 });
};

before(async () => {
  ctx = await entorno({ cotizaciones: false });
  const { pg, admin } = ctx;
  O = await obraCon(admin);
  B = await obraCon(admin, ['Pintura']);
  cli = como(pg, await crearUsuario(pg, 'cliente@test', 'cliente'));
  otro = como(pg, await crearUsuario(pg, 'otro@test', 'cliente'));
  gremio = como(pg, await crearUsuario(pg, 'gremio@test', 'gremio'));
  await admin.rpc('asignar_obras_cliente', { p_usuario: cli.id, p_obras: [O.obraId] });
  await admin.rpc('asignar_obras_cliente', { p_usuario: otro.id, p_obras: [B.obraId] });
  await admin.rpc('asignar_rubros_gremio', { p_usuario: gremio.id, p_rubros: [O.r.Electricidad] });
  await admin.rpc('actualizar_usuario', { p_id: ctx.enc.id, p: { obras: [O.obraId] } });
  await admin.rpc('definir_pesos', { p_obra: O.obraId, p_pesos: [{ rubro_id: O.r.Estructura, peso: 60 }, { rubro_id: O.r.Electricidad, peso: 40 }] });
});

test('plan de obra: sólo el administrador lo define, con fechas válidas, y llega al portal', async () => {
  const { admin, enc } = ctx;
  const plan = { rubros: [{ id: O.r.Estructura, inicio: '2026-03-01', fin: '2026-03-31' }, { id: O.r.Electricidad, inicio: '2026-03-16', fin: '2026-04-14' }] };
  await assert.rejects(() => enc.rpc('definir_plan', { p_obra: O.obraId, p: plan }), /administrador/);
  await assert.rejects(() => cli.rpc('definir_plan', { p_obra: O.obraId, p: plan }), /administrador|habilitado/);
  await assert.rejects(() => admin.rpc('definir_plan', { p_obra: O.obraId, p: { rubros: [{ id: O.r.Estructura, inicio: '2026-03-10', fin: '2026-03-01' }] } }), /anterior/);
  await assert.rejects(() => admin.rpc('definir_plan', { p_obra: O.obraId, p: { rubros: [{ id: O.r.Estructura, inicio: '2026-03-10' }] } }), /inicio y fin/);
  await assert.rejects(() => admin.rpc('definir_plan', { p_obra: O.obraId, p: { rubros: [{ id: B.r.Pintura, inicio: '2026-03-01', fin: '2026-03-02' }] } }), /no pertenece/);
  assert.equal(await admin.rpc('definir_plan', { p_obra: O.obraId, p: plan }), 2);
  const p = await cli.rpc('portal_obra', { p_obra: O.obraId });
  assert.deepEqual(p.rubros.map((r) => [r.nombre, r.inicio_plan, r.fin_plan]),
    [['Estructura', '2026-03-01', '2026-03-31'], ['Electricidad', '2026-03-16', '2026-04-14']]);
  // Fin de marzo: estructura completa (60) + electricidad 16 de 30 días (40 × 16/30 = 21,33)
  assert.equal(avancePlanificado(p.rubros, '2026-03-31'), 81.33);
  assert.equal(avancePlanificado(p.rubros, '2026-02-01'), 0);
  assert.equal(avancePlanificado(p.rubros, '2026-05-01'), 100);
  assert.deepEqual(curvaPlan(p.rubros).map((x) => [x.fecha, x.avance]),
    [['2026-02-28', 0], ['2026-03-15', 29.03], ['2026-03-31', 81.33], ['2026-04-14', 100]]);
  assert.deepEqual(rangoPlan(p.rubros), { inicio: '2026-03-01', fin: '2026-04-14' });
  // Historial por etapa para el informe mensual: fecha y %, sin comentarios
  await admin.rpc('cargar_avance', { p_rubro: O.r.Estructura, p: { fecha: '2026-03-05', porcentaje: 30, comentario: 'Nota interna' } });
  const h = (await cli.rpc('portal_obra', { p_obra: O.obraId })).historial;
  assert.deepEqual(h, [{ rubro_id: O.r.Estructura, fecha: '2026-03-05', porcentaje: 30 }]);
  assert.ok(!JSON.stringify(await cli.rpc('portal_obra', { p_obra: O.obraId })).includes('Nota interna'));
  // Sin plan en un rubro la curva no se inventa
  await admin.rpc('definir_plan', { p_obra: O.obraId, p: { rubros: [{ id: O.r.Electricidad, inicio: '', fin: '' }] } });
  assert.equal(avancePlanificado((await cli.rpc('portal_obra', { p_obra: O.obraId })).rubros, '2026-03-31'), null);
  await admin.rpc('definir_plan', { p_obra: O.obraId, p: plan });
});

test('documentos: el cliente ve y abre sólo los visibles de su obra', async () => {
  const { admin, enc } = ctx;
  const plano = await subir(admin, O.obraId, 'plano.pdf');
  const contrato = await subir(admin, O.obraId, 'contrato.pdf');
  await assert.rejects(() => cli.rpc('crear_documento', { p_obra: O.obraId, p: { adjunto_id: plano, titulo: 'x' } }), /acceso/);
  await assert.rejects(() => admin.rpc('crear_documento', { p_obra: B.obraId, p: { adjunto_id: plano, titulo: 'x' } }), /archivo/);
  await assert.rejects(() => admin.rpc('crear_documento', { p_obra: O.obraId, p: { adjunto_id: plano, titulo: 'x', categoria: 'factura' } }), /inválido/);
  const d1 = await enc.rpc('crear_documento', { p_obra: O.obraId, p: { adjunto_id: plano, titulo: 'Plano de planta baja', categoria: 'plano' } });
  const d2 = await admin.rpc('crear_documento', { p_obra: O.obraId, p: { adjunto_id: contrato, titulo: 'Contrato interno', categoria: 'contrato', visible_cliente: false } });
  let p = await cli.rpc('portal_obra', { p_obra: O.obraId });
  assert.deepEqual(p.documentos.map((d) => [d.titulo, d.categoria, d.nombre]), [['Plano de planta baja', 'plano', 'plano.pdf']]);
  assert.deepEqual((await cli.query("select name from storage.objects where name like '%.pdf' order by name")).map((x) => x.name), [`obra-${O.obraId}/plano.pdf`]);
  assert.equal((await cli.query('select * from adjuntos')).length, 1);
  assert.equal((await otro.query("select * from storage.objects where name like '%.pdf'")).length, 0, 'otro cliente no');
  assert.equal((await gremio.query("select * from storage.objects where name like '%.pdf'")).length, 0, 'el gremio no');
  assert.equal((await otro.query('select * from documentos')).length, 0);
  await assert.rejects(() => cli.rpc('marcar_documento_cliente', { p_id: d2.id, p_visible: true }), /acceso/);
  await admin.rpc('marcar_documento_cliente', { p_id: d2.id, p_visible: true });
  await admin.rpc('anular_documento', { p_id: d1.id });
  p = await cli.rpc('portal_obra', { p_obra: O.obraId });
  assert.deepEqual(p.documentos.map((d) => d.titulo), ['Contrato interno']);
  assert.deepEqual((await cli.query("select name from storage.objects where name like '%.pdf'")).map((x) => x.name), [`obra-${O.obraId}/contrato.pdf`]);
});

test('el respaldo y la eliminación de la obra incluyen los documentos', async () => {
  const { admin, pg } = ctx;
  const r = await admin.rpc('exportar_respaldo');
  assert.ok(r.documentos.length >= 2 && Array.isArray(r.partes_diarios) && Array.isArray(r.fotos));
  await admin.rpc('eliminar_obra', { p_obra: O.obraId, p_confirmacion: 'Obra de prueba' });
  assert.equal((await pg.query('select count(*)::int n from documentos where obra_id = $1', [O.obraId])).rows[0].n, 0);
});
