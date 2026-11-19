// Pruebas de aceptación A–G contra el esquema real de Supabase (Postgres en memoria).
// Las cotizaciones son datos ficticios de prueba cargados "a mano" por el administrador.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entorno, obraCon, ver, fila, $ } from './helpers.js';

const contrato = (r, t, extra = {}) => ({ fecha: '2026-03-02', concepto: 'Contrato instalación eléctrica', rubro_id: r.Electricidad,
  tipo_id: t.Subcontratos, moneda: 'ARS', importe: $(10_000_000), condicion: 'contrato', proveedor: 'Electricista SRL', ...extra });

test('A. Contrato y anticipo: comprometido, pagado, pendiente y disponible', async () => {
  const { admin, enc } = await entorno();
  const { obraId, r, t } = await obraCon(admin);
  await admin.rpc('actualizar_usuario', { p_id: enc.id, p: { obras: [obraId] } });
  await admin.rpc('definir_presupuesto', { p_rubro: r.Electricidad, p: { moneda: 'ARS', importe: $(12_000_000), fecha_ref: '2026-03-02', vigente_desde: '2026-03-01' } });
  const g = await enc.rpc('crear_gasto', { p_obra: obraId, p: contrato(r, t, { anticipo: { importe: $(3_000_000), fecha: '2026-03-03' } }) });

  let e = fila(await ver(enc, obraId), 'Electricidad');
  assert.equal(e.comprometido.valor, $(10_000_000));
  assert.equal(e.pagado.valor, $(3_000_000));
  assert.equal(e.pendiente.valor, $(7_000_000));
  assert.equal(e.disponible.valor, $(2_000_000));

  await enc.rpc('registrar_pago', { p_comp: g.id, p: { fecha: '2026-03-10', moneda_pago: 'ARS', importe_pagado: $(2_000_000) } });
  e = fila(await ver(enc, obraId), 'Electricidad');
  assert.equal(e.pendiente.valor, $(5_000_000));
  assert.equal(e.comprometido.valor, $(10_000_000), 'el comprometido original no cambia');
  assert.equal(e.pagado.valor, $(5_000_000));

  await assert.rejects(() => enc.rpc('registrar_pago', { p_comp: g.id, p: { fecha: '2026-03-10', moneda_pago: 'ARS', importe_pagado: $(5_000_000.01) } }), /superiores al saldo/);
});

test('B. Compra al contado: aparece en rubro y tipo, total contado una vez', async () => {
  const { admin } = await entorno();
  const { obraId, r, t } = await obraCon(admin);
  await admin.rpc('crear_gasto', { p_obra: obraId, p: contrato(r, t, { importe: $(1_000_000) }) });
  const antes = (await ver(admin, obraId)).totales;
  await admin.rpc('crear_gasto', { p_obra: obraId, p: { fecha: '2026-03-04', concepto: 'Cables', rubro_id: r.Electricidad, tipo_id: t.Materiales, moneda: 'ARS', importe: $(200_000), condicion: 'contado' } });
  const inf = await ver(admin, obraId);
  assert.equal(inf.totales.comprometido.valor - antes.comprometido.valor, $(200_000));
  assert.equal(inf.totales.pagado.valor - antes.pagado.valor, $(200_000));
  assert.equal(inf.totales.pendiente.valor, antes.pendiente.valor, 'la deuda queda igual');
  assert.equal(fila(inf, 'Electricidad').comprometido.valor, $(1_200_000));
  assert.equal(inf.tipos.find((x) => x.nombre === 'Materiales').comprometido.valor, $(200_000));
  assert.equal(inf.tipos.reduce((s, x) => s + x.comprometido.valor, 0), inf.totales.comprometido.valor);
  assert.equal(inf.rubros.reduce((s, x) => s + x.comprometido.valor, 0), inf.totales.comprometido.valor);
});

test('C. Cambio de vista histórico ↔ manual es reversible y no altera el original', async () => {
  const { admin } = await entorno();
  const { obraId, r, t } = await obraCon(admin);
  const g = await admin.rpc('crear_gasto', { p_obra: obraId, p: { fecha: '2026-03-02', concepto: 'Compra USD', rubro_id: r.Estructura, tipo_id: t.Materiales, moneda: 'USD', importe: $(1000), condicion: 'contado' } });
  assert.equal((await ver(admin, obraId)).totales.comprometido.valor, $(1_200_000));
  assert.equal((await ver(admin, obraId, { criterio: 'manual', cotizacionManual: 1350 })).totales.comprometido.valor, $(1_350_000));
  assert.equal((await ver(admin, obraId)).totales.comprometido.valor, $(1_200_000));
  const [c] = await admin.query('select moneda, importe, cot_valor from compromisos where id = $1', [g.id]);
  assert.deepEqual({ ...c }, { moneda: 'USD', importe: $(1000), cot_valor: 1200 });
});

test('D. Pago en otra moneda con diferencia de cambio', async () => {
  const { admin } = await entorno();
  const { obraId, r, t } = await obraCon(admin);
  const g = await admin.rpc('crear_gasto', { p_obra: obraId, p: { fecha: '2026-03-02', concepto: 'Contrato en dólares', rubro_id: r.Estructura, tipo_id: t.Subcontratos, moneda: 'USD', importe: $(1000), condicion: 'contrato' } });
  const pago = { fecha: '2026-03-09', moneda_pago: 'ARS', importe_pagado: $(650_000), importe_cancelado: $(500) };
  const prev = await admin.rpc('preparar_pago', { p_comp: g.id, p: pago });
  assert.equal(prev.tc, 1300);
  assert.equal(prev.saldoResultante, $(500));
  await admin.rpc('registrar_pago', { p_comp: g.id, p: pago });
  const inf = await ver(admin, obraId);
  assert.equal(inf.movimientos[0].pendiente, $(500), 'la deuda queda en USD 500');
  assert.equal(inf.totales.comprometido.valor, $(1_200_000));
  assert.equal(inf.totales.pagado.valor, $(650_000));
  assert.equal(inf.totales.pendiente.valor, $(600_000));
  assert.equal(inf.totales.difCambio, $(50_000));
  assert.equal(inf.totales.comprometido.valor + inf.totales.difCambio, inf.totales.pagado.valor + inf.totales.pendiente.valor);
});

test('E. Avance general ponderado e independiente de los pagos', async () => {
  const { admin } = await entorno();
  const { obraId, r, t } = await obraCon(admin);
  await admin.rpc('definir_pesos', { p_obra: obraId, p_pesos: [{ rubro_id: r.Estructura, peso: 60 }, { rubro_id: r.Electricidad, peso: 40 }] });
  await admin.rpc('cargar_avance', { p_rubro: r.Estructura, p: { fecha: '2026-03-05', porcentaje: 50 } });
  await admin.rpc('cargar_avance', { p_rubro: r.Electricidad, p: { fecha: '2026-03-05', porcentaje: 25 } });
  assert.equal((await ver(admin, obraId)).avance.valor, 40);
  const g = await admin.rpc('crear_gasto', { p_obra: obraId, p: { fecha: '2026-03-05', concepto: 'Anticipo electricista', rubro_id: r.Electricidad, tipo_id: t['Mano de obra'], moneda: 'ARS', importe: $(500_000), condicion: 'contrato', anticipo: { importe: $(100_000) } } });
  await admin.rpc('registrar_pago', { p_comp: g.id, p: { fecha: '2026-03-06', moneda_pago: 'ARS', importe_pagado: $(50_000) } });
  assert.equal((await ver(admin, obraId)).avance.valor, 40, 'registrar un pago no cambia el avance');

  await admin.rpc('cargar_avance', { p_rubro: r.Estructura, p: { fecha: '2026-03-06', porcentaje: 45, motivo_baja: 'Se rehízo una losa' } });
  await assert.rejects(() => admin.rpc('cargar_avance', { p_rubro: r.Estructura, p: { fecha: '2026-03-07', porcentaje: 30 } }), /motivo/);
  await admin.rpc('definir_pesos', { p_obra: obraId, p_pesos: [{ rubro_id: r.Electricidad, peso: null }] });
  const inf = await ver(admin, obraId);
  assert.equal(inf.avance.estado, 'pendiente_ponderacion');
  assert.equal(inf.avance.faltaAsignar, 40);
});

test('E2. Rubro sin avance cargado computa 0 % y queda identificado', async () => {
  const { admin } = await entorno();
  const { obraId, r } = await obraCon(admin);
  await admin.rpc('definir_pesos', { p_obra: obraId, p_pesos: [{ rubro_id: r.Estructura, peso: 60 }, { rubro_id: r.Electricidad, peso: 40 }] });
  await admin.rpc('cargar_avance', { p_rubro: r.Estructura, p: { fecha: '2026-03-05', porcentaje: 50 } });
  const inf = await ver(admin, obraId);
  assert.equal(inf.avance.valor, 30);
  assert.deepEqual(inf.avance.sinAvance, ['Electricidad']);
});

test('F. Informe a fecha de corte anterior al segundo pago (tablero, PDF y Excel)', async () => {
  const { admin } = await entorno();
  const { obraId, r, t } = await obraCon(admin);
  await admin.rpc('definir_presupuesto', { p_rubro: r.Electricidad, p: { moneda: 'ARS', importe: $(12_000_000), fecha_ref: '2026-03-02', vigente_desde: '2026-03-01' } });
  const g = await admin.rpc('crear_gasto', { p_obra: obraId, p: contrato(r, t, { anticipo: { importe: $(3_000_000), fecha: '2026-03-03' } }) });
  await admin.rpc('registrar_pago', { p_comp: g.id, p: { fecha: '2026-03-10', moneda_pago: 'ARS', importe_pagado: $(2_000_000) } });

  const inf = await ver(admin, obraId, { corte: '2026-03-09' });
  const e = fila(inf, 'Electricidad');
  assert.equal(inf.movimientos[0].pagos.length, 1, 'sólo el primer anticipo');
  assert.equal(e.pagado.valor, $(3_000_000));
  assert.equal(e.pendiente.valor, $(7_000_000));

  const { generarExcel } = await import('../shared/exports/excel.js');
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await generarExcel(inf));
  const ws = wb.getWorksheet('Resumen por rubro');
  const fElec = ws.getColumn(1).values.findIndex((v) => v === 'Electricidad');
  const head = ws.getRow(1).values;
  const col = (n) => head.findIndex((v) => typeof v === 'string' && v.startsWith(n));
  assert.equal(ws.getRow(fElec).getCell(col('Pagado')).value, 3_000_000);
  assert.equal(ws.getRow(fElec).getCell(col('Pendiente')).value, 7_000_000);
  assert.equal(wb.getWorksheet('Pagos').actualRowCount, 2, 'encabezado + 1 pago');

  const { generarPdf } = await import('../shared/exports/pdf.js');
  const pdf = await generarPdf(inf);
  assert.equal(new TextDecoder().decode(pdf.subarray(0, 5)), '%PDF-');
});

test('G. Cotización faltante: se guarda en moneda original, se informa y se completa al cargarla sin duplicar', async () => {
  const { admin } = await entorno({ cotizaciones: false });
  const { obraId, r, t } = await obraCon(admin);
  const datos = { fecha: '2026-03-02', concepto: 'Bomba importada', rubro_id: r.Estructura, tipo_id: t.Materiales, moneda: 'USD', importe: $(1000), condicion: 'contado', clave_idem: 'form-123' };
  const g = await admin.rpc('crear_gasto', { p_obra: obraId, p: datos });
  assert.equal(g.cotizacion.cot_estado, 'pendiente');
  const g2 = await admin.rpc('crear_gasto', { p_obra: obraId, p: datos });
  assert.equal(g2.duplicado, true, 'doble toque: misma clave no duplica');
  assert.equal((await admin.query('select count(*)::int n from compromisos'))[0].n, 1);

  let inf = await ver(admin, obraId);
  assert.equal(inf.completo, false);
  assert.ok(inf.faltantes.some((f) => f.moneda === 'USD' && f.importe === $(1000)));
  assert.equal((await ver(admin, obraId, { moneda: 'USD' })).completo, true, 'en USD no falta nada');

  // Una cotización anterior no alcanza: el 02/03 podría haber tenido publicación propia.
  await admin.rpc('cargar_cotizacion', { p_fecha: '2026-02-27', p_venta: 1190 });
  assert.equal((await ver(admin, obraId)).completo, false);
  // Al cargar la del día (o una posterior) se completa sola.
  const rr = await admin.rpc('cargar_cotizacion', { p_fecha: '2026-03-02', p_venta: 1200 });
  assert.equal(rr.completadas, 2, 'compromiso + pago al contado');
  inf = await ver(admin, obraId);
  assert.equal(inf.completo, true);
  assert.equal(inf.totales.comprometido.valor, $(1_200_000));
  assert.equal((await admin.query('select count(*)::int n from compromisos'))[0].n, 1, 'sin duplicar el gasto');
});

test('Cotización: día sin publicación usa la anterior; corrección conserva historial y reaplica', async () => {
  const { admin } = await entorno();
  const { obraId, r, t } = await obraCon(admin);
  // 07 y 08/03 = fin de semana (sin carga) -> toma la del viernes 06/03, porque ya hay una posterior (09/03).
  const g = await admin.rpc('crear_gasto', { p_obra: obraId, p: { fecha: '2026-03-08', concepto: 'Sábado', rubro_id: r.Estructura, tipo_id: t.Materiales, moneda: 'USD', importe: $(10), condicion: 'contado' } });
  assert.equal(g.cotizacion.cot_fecha, '2026-03-06');
  assert.equal(g.cotizacion.cot_valor, 1230);
  // Corrección de tipeo con motivo: conserva la fila anterior y reaplica a los movimientos.
  await assert.rejects(() => admin.rpc('cargar_cotizacion', { p_fecha: '2026-03-06', p_venta: 1235 }), /motivo/);
  await admin.rpc('cargar_cotizacion', { p_fecha: '2026-03-06', p_venta: 1235, p_motivo: 'Error de tipeo' });
  const hist = await admin.query("select venta, vigente from cotizaciones where fecha = '2026-03-06' order by id");
  assert.deepEqual(hist.map((x) => ({ ...x })), [{ venta: 1230, vigente: false }, { venta: 1235, vigente: true }]);
  const [c] = await admin.query('select cot_valor from compromisos where id = $1', [g.id]);
  assert.equal(c.cot_valor, 1235);
});
