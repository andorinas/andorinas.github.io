// Regresiones de la revisión independiente (cálculo y seguridad). Cada prueba corresponde a un hallazgo confirmado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entorno, obraCon, ver, fila, $ } from './helpers.js';
import { como, crearUsuario } from './db.js';

const gasto = (r, t, extra = {}) => ({ fecha: '2026-03-02', concepto: 'Gasto', rubro_id: r.Estructura, tipo_id: t.Materiales, moneda: 'ARS', importe: $(1000), condicion: 'contado', ...extra });

test('rubro con gastos: no se puede desactivar; y si ya está inactivo, la suma por rubro sigue dando el total', async () => {
  const { pg, admin } = await entorno();
  const { obraId, r, t } = await obraCon(admin);
  await admin.rpc('crear_gasto', { p_obra: obraId, p: gasto(r, t, { rubro_id: r.Electricidad }) });
  await admin.rpc('crear_gasto', { p_obra: obraId, p: gasto(r, t) });
  await assert.rejects(() => admin.rpc('actualizar_rubro', { p_id: r.Electricidad, p: { activo: false } }), /gastos registrados/);
  await pg.query('update rubros set activo = false where id = $1', [r.Electricidad]); // dato heredado
  const inf = await ver(admin, obraId);
  assert.equal(inf.rubros.reduce((s, x) => s + x.comprometido.valor, 0), inf.totales.comprometido.valor);
  assert.equal(fila(inf, 'Electricidad').inactivo, true);
  await assert.rejects(() => admin.rpc('crear_gasto', { p_obra: obraId, p: gasto(r, t, { rubro_id: r.Electricidad }) }), /desactivado/);
});

test('los filtros no esconden el exceso de presupuesto ni los desvíos', async () => {
  const { admin } = await entorno();
  const { obraId, r, t } = await obraCon(admin);
  await admin.rpc('definir_presupuesto', { p_rubro: r.Estructura, p: { moneda: 'ARS', importe: $(1000), fecha_ref: '2026-03-02' } });
  await admin.rpc('crear_gasto', { p_obra: obraId, p: gasto(r, t, { importe: $(900) }) });
  await admin.rpc('crear_gasto', { p_obra: obraId, p: gasto(r, t, { importe: $(600), tipo_id: t.Subcontratos, fecha: '2026-03-05', condicion: 'contrato' }) });
  for (const q of [{}, { tipoId: t.Materiales }, { desde: '2026-03-04' }, { estadoPago: 'pendiente' }]) {
    const inf = await ver(admin, obraId, q);
    assert.equal(fila(inf, 'Estructura').exceso, $(500), JSON.stringify(q));
    assert.equal(inf.desvios.length, 1, JSON.stringify(q));
  }
});

test('cargar una cotización intermedia que faltaba actualiza los registros de esa fecha en adelante', async () => {
  const { admin } = await entorno();
  const { obraId, r, t } = await obraCon(admin);
  const g = await admin.rpc('crear_gasto', { p_obra: obraId, p: gasto(r, t, { fecha: '2026-03-20', moneda: 'USD' }) });
  assert.equal(g.cotizacion.cot_fecha, '2026-03-10'); // la tabla tenía 10/03 y 01/04
  await admin.rpc('cargar_cotizacion', { p_fecha: '2026-03-20', p_venta: 1280 });
  const [c] = await admin.query('select cot_valor, cot_fecha from compromisos where id = $1', [g.id]);
  assert.deepEqual({ ...c }, { cot_valor: 1280, cot_fecha: '2026-03-20' });
});

test('faltantes de cotización: dos compras idénticas cuentan como registros distintos', async () => {
  const { admin } = await entorno({ cotizaciones: false });
  const { obraId, r, t } = await obraCon(admin);
  for (let i = 0; i < 2; i++) await admin.rpc('crear_gasto', { p_obra: obraId, p: gasto(r, t, { moneda: 'USD', concepto: 'Cemento' }) });
  assert.equal((await ver(admin, obraId)).faltantes.length, 4); // 2 compromisos + 2 pagos al contado
});

test('avance con fecha atrasada: se compara con los vecinos en el tiempo', async () => {
  const { admin } = await entorno();
  const { r } = await obraCon(admin);
  await admin.rpc('cargar_avance', { p_rubro: r.Estructura, p: { fecha: '2026-03-10', porcentaje: 50 } });
  await admin.rpc('cargar_avance', { p_rubro: r.Estructura, p: { fecha: '2026-03-01', porcentaje: 10 } }); // creciente: válido
  await assert.rejects(() => admin.rpc('cargar_avance', { p_rubro: r.Estructura, p: { fecha: '2026-03-05', porcentaje: 80 } }), /posterior/);
  await assert.rejects(() => admin.rpc('cargar_avance', { p_rubro: r.Estructura, p: { fecha: '2026-03-12', porcentaje: 40 } }), /motivo/);
});

test('el primer presupuesto rige desde el inicio de la obra (cuenta en fechas de corte pasadas)', async () => {
  const { admin } = await entorno();
  const { obraId, r } = await obraCon(admin);
  await admin.rpc('definir_presupuesto', { p_rubro: r.Estructura, p: { moneda: 'ARS', importe: $(100), fecha_ref: '2026-03-02' } });
  assert.equal(fila(await ver(admin, obraId, { corte: '2026-03-15' }), 'Estructura').sinPresupuesto, false);
});

test('presupuesto sin cotización: disponible no se muestra como número ni como exceso', async () => {
  const { admin } = await entorno();
  const { obraId, r, t } = await obraCon(admin);
  await admin.rpc('definir_presupuesto', { p_rubro: r.Estructura, p: { moneda: 'USD', importe: $(10000), fecha_ref: '2026-05-01' } });
  await admin.rpc('crear_gasto', { p_obra: obraId, p: gasto(r, t, { importe: $(500000) }) });
  const inf = await ver(admin, obraId);
  assert.equal(fila(inf, 'Estructura').disponible.valor, null);
  assert.equal(fila(inf, 'Estructura').exceso, 0);
  assert.equal(inf.totales.disponible.valor, null);
});

test('reactivar un rubro: sólo el administrador, y su peso se vuelve a definir', async () => {
  const { admin, enc } = await entorno();
  const { obraId, r } = await obraCon(admin);
  await admin.rpc('actualizar_usuario', { p_id: enc.id, p: { obras: [obraId] } });
  await admin.rpc('definir_pesos', { p_obra: obraId, p_pesos: [{ rubro_id: r.Estructura, peso: 60 }, { rubro_id: r.Electricidad, peso: 40 }] });
  await admin.rpc('actualizar_rubro', { p_id: r.Electricidad, p: { activo: false } });
  await admin.rpc('definir_pesos', { p_obra: obraId, p_pesos: [{ rubro_id: r.Estructura, peso: 100 }] });
  await assert.rejects(() => enc.rpc('crear_rubro', { p_obra: obraId, p_nombre: 'electricidad' }), /administrador/);
  await admin.rpc('crear_rubro', { p_obra: obraId, p_nombre: 'electricidad' });
  const inf = await ver(admin, obraId);
  assert.equal(inf.avance.sumaPesos, 100);
  assert.equal(fila(inf, 'Electricidad').peso, null);
});

test('dólar manual con pagos en la misma moneda: sin diferencia de cambio por redondeo', async () => {
  const { admin } = await entorno();
  const { obraId, r, t } = await obraCon(admin);
  const g = await admin.rpc('crear_gasto', { p_obra: obraId, p: gasto(r, t, { importe: 1000, condicion: 'contrato' }) });
  await admin.rpc('registrar_pago', { p_comp: g.id, p: { fecha: '2026-03-03', moneda_pago: 'ARS', importe_pagado: 500 } });
  const inf = await ver(admin, obraId, { moneda: 'USD', criterio: 'manual', cotizacionManual: 3 });
  assert.equal(inf.totales.difCambio, 0);
});

test('pesos 33,33 × 3 se aceptan como ponderación completa', async () => {
  const { admin } = await entorno();
  const { obraId, r } = await obraCon(admin, ['A', 'B', 'C']);
  await admin.rpc('definir_pesos', { p_obra: obraId, p_pesos: Object.values(r).map((id) => ({ rubro_id: id, peso: 33.33 })) });
  assert.equal((await ver(admin, obraId)).avance.estado, 'ok');
});

test('pago en otra moneda: TC de cancelación fuera de rango se rechaza; medio centavo redondea hacia arriba', async () => {
  const { admin } = await entorno();
  const { obraId, r, t } = await obraCon(admin);
  const g = await admin.rpc('crear_gasto', { p_obra: obraId, p: gasto(r, t, { moneda: 'USD', importe: $(100), condicion: 'contrato' }) });
  await assert.rejects(() => admin.rpc('preparar_pago', { p_comp: g.id, p: { fecha: '2026-03-03', moneda_pago: 'ARS', importe_pagado: 1, importe_cancelado: $(100) } }), /se aleja más de 50 %/);
  const pr = await admin.rpc('preparar_pago', { p_comp: g.id, p: { fecha: '2026-03-03', moneda_pago: 'ARS', importe_pagado: 1500, tc_cancelacion: 1000 } });
  assert.equal(pr.importe_cancelado, 2); // 1,5 centavos -> 2 (como Math.round)
});

test('clave de doble envío: no sirve con otro usuario ni con datos distintos', async () => {
  const { pg, admin } = await entorno();
  const { obraId, r, t } = await obraCon(admin);
  const otroAdmin = como(pg, await crearUsuario(pg, 'otro@test', 'admin'));
  await admin.rpc('crear_gasto', { p_obra: obraId, p: gasto(r, t, { clave_idem: 'k1' }) });
  assert.equal((await admin.rpc('crear_gasto', { p_obra: obraId, p: gasto(r, t, { clave_idem: 'k1' }) })).duplicado, true);
  await assert.rejects(() => admin.rpc('crear_gasto', { p_obra: obraId, p: gasto(r, t, { clave_idem: 'k1', importe: $(2000) }) }), /otros datos/);
  await assert.rejects(() => otroAdmin.rpc('crear_gasto', { p_obra: obraId, p: gasto(r, t, { clave_idem: 'k1' }) }), /Clave de envío inválida/);
});

test('administrador inicial: sólo con el email confirmado', async () => {
  const { pg } = await entorno({ cotizaciones: false });
  await pg.query("update configuracion set valor = 'jefe@x.com' where clave = 'admin_email'");
  await pg.query("insert into auth.users (id, email, email_confirmed_at) values ('33333333-3333-3333-3333-333333333333', 'JEFE@x.com', null)");
  const rol = async () => (await pg.query("select rol from perfiles where id = '33333333-3333-3333-3333-333333333333'")).rows[0].rol;
  assert.equal(await rol(), 'pendiente');
  await pg.query("update auth.users set email_confirmed_at = now() where id = '33333333-3333-3333-3333-333333333333'");
  assert.equal(await rol(), 'admin');
});

test('funciones nuevas no quedan ejecutables por defecto para anon ni authenticated', async () => {
  const { pg } = await entorno({ cotizaciones: false });
  await pg.exec('create function public.funcion_futura() returns int language sql as $$ select 1 $$');
  const { rows } = await pg.query("select has_function_privilege('anon', 'public.funcion_futura()', 'execute') a, has_function_privilege('authenticated', 'public.funcion_futura()', 'execute') b");
  assert.deepEqual({ ...rows[0] }, { a: false, b: false });
});

test('mismo mensaje para obra inexistente y obra ajena', async () => {
  const { admin, enc } = await entorno();
  const { obraId, r, t } = await obraCon(admin);
  const e1 = await enc.rpc('crear_gasto', { p_obra: 999, p: gasto(r, t) }).catch((e) => e.message);
  const e2 = await enc.rpc('crear_gasto', { p_obra: obraId, p: gasto(r, t) }).catch((e) => e.message);
  assert.equal(e1, e2);
});
