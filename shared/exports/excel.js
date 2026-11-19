// Excel para la oficina. Recibe el resultado de calcularObra(): mismos totales que tablero y PDF.
import ExcelJS from 'exceljs';
import { CRITERIO, CONDICION, ESTADO_OBRA } from '../formato.js';
import { ETIQUETA_ESTADO } from '../calc.js';

const NUM = '#,##0.00';
const TC = '#,##0.0000';
const FECHA = 'dd/mm/yyyy';
const toDate = (iso) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`) : null);
const u = (cents) => (cents == null ? null : cents / 100);
const ESTADO_COT = { ok: 'OK', pendiente: 'Cotización pendiente', no_aplica: '' };

function encabezado(ws, cols) {
  ws.columns = cols.map((c) => ({ header: c.h, key: c.k, width: c.w ?? 14, style: c.f ? { numFmt: c.f } : {} }));
  const r = ws.getRow(1);
  r.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B1B1F' } };
  r.alignment = { vertical: 'middle', wrapText: true };
  r.height = 30;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
}

export async function generarExcel(inf) {
  const p = inf.parametros;
  const M = p.moneda;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ControlAr – Andorinas';
  wb.created = new Date();

  // ── Parámetros ────────────────────────────────────────────────────────────
  const wp = wb.addWorksheet('Parámetros');
  wp.columns = [{ width: 34 }, { width: 70 }];
  const filas = [
    ['Informe', 'ControlAr · Andorinas Ingeniería & Construcción'],
    ['Obra', inf.obra.nombre],
    ['Ubicación', inf.obra.ubicacion || ''],
    ['Estado', ESTADO_OBRA[inf.obra.estado]],
    ['Fecha de corte', toDate(p.corte)],
    ['Moneda de visualización', M],
    ['Criterio de conversión', CRITERIO[p.criterio]],
    ['Cotización manual aplicada (ARS por USD)', p.cotizacionManual ?? 'No aplica'],
    ['Filtros aplicados', p.filtros.length ? p.filtros.join(' · ') : 'Sin filtros'],
    ['Totales completos', inf.completo ? 'Sí' : `NO – faltan convertir ${inf.faltantes.length} importe(s) por cotización pendiente`],
    ['Generado (hora Argentina)', new Date(Date.now() - 3 * 3600e3)],
  ];
  filas.forEach((f) => wp.addRow(f));
  wp.getColumn(1).font = { bold: true };
  wp.getCell('B5').numFmt = FECHA;
  wp.getCell('B11').numFmt = 'dd/mm/yyyy hh:mm';
  if (inf.faltantes.length) {
    wp.addRow([]);
    wp.addRow(['Importes sin convertir', 'Moneda / importe original']).font = { bold: true };
    for (const x of inf.faltantes) wp.addRow([x.ref, `${x.moneda} ${u(x.importe).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`]);
  }

  // ── Resumen por rubro ─────────────────────────────────────────────────────
  const wr = wb.addWorksheet('Resumen por rubro');
  encabezado(wr, [
    { h: 'Rubro', k: 'rubro', w: 26 },
    { h: 'Peso %', k: 'peso', f: '0.00' },
    { h: `Presupuesto vigente (${M})`, k: 'pres', f: NUM, w: 18 },
    { h: 'Presupuesto: moneda original', k: 'pm', w: 12 },
    { h: 'Presupuesto: importe original', k: 'pi', f: NUM, w: 18 },
    { h: 'Presupuesto: fecha ref.', k: 'pf', f: FECHA },
    { h: 'Presupuesto: cotización BNA', k: 'pc', f: TC },
    { h: `Comprometido (${M})`, k: 'comp', f: NUM, w: 18 },
    { h: `Pagado (${M})`, k: 'pag', f: NUM, w: 18 },
    { h: `Pendiente (${M})`, k: 'pend', f: NUM, w: 18 },
    { h: `Disponible (${M})`, k: 'disp', f: NUM, w: 18 },
    { h: `Exceso (${M})`, k: 'exc', f: NUM, w: 16 },
    { h: `Diferencia de cambio (${M})`, k: 'dif', f: NUM, w: 16 },
    { h: 'Avance físico %', k: 'av', f: '0.00' },
    { h: 'Observaciones', k: 'obs', w: 40 },
  ]);
  for (const r of inf.rubros) {
    const obs = [];
    if (r.sinPresupuesto) obs.push('Sin presupuestar');
    if (r.avance == null) obs.push('Sin avance cargado');
    for (const k of ['presupuesto', 'comprometido', 'pagado', 'pendiente']) if (r[k] && r[k].faltantes.length) obs.push(`${k}: incompleto (cotización pendiente)`);
    wr.addRow({
      rubro: r.nombre, peso: r.peso, pres: r.presupuesto ? u(r.presupuesto.valor) : null,
      pm: r.presupuestoVersion?.moneda ?? null, pi: r.presupuestoVersion ? u(r.presupuestoVersion.importe) : null,
      pf: toDate(r.presupuestoVersion?.fecha_ref), pc: r.presupuestoVersion?.cot_valor ?? null,
      comp: u(r.comprometido.valor), pag: u(r.pagado.valor), pend: u(r.pendiente.valor),
      disp: r.disponible ? u(r.disponible.valor) : null, exc: r.exceso ? u(r.exceso) : 0, dif: u(r.difCambio), av: r.avance,
      obs: obs.join('; '),
    });
  }
  const T = inf.totales;
  const tot = wr.addRow({
    rubro: 'TOTAL OBRA', pres: u(T.presupuesto.valor), comp: u(T.comprometido.valor), pag: u(T.pagado.valor), pend: u(T.pendiente.valor),
    disp: u(T.disponible.valor), dif: u(T.difCambio), av: inf.avance.valor,
    obs: [inf.avance.estado === 'pendiente_ponderacion' ? 'Avance general: Pendiente de ponderación' : 'Avance = avance general ponderado',
      inf.completo ? '' : 'TOTALES INCOMPLETOS: hay importes sin convertir'].filter(Boolean).join('; '),
  });
  tot.font = { bold: true };
  tot.border = { top: { style: 'thin' } };

  // ── Por tipo de gasto ─────────────────────────────────────────────────────
  const wt = wb.addWorksheet('Por tipo de gasto');
  encabezado(wt, [
    { h: 'Tipo de gasto', k: 'tipo', w: 24 },
    { h: `Comprometido (${M})`, k: 'comp', f: NUM, w: 18 },
    { h: `Pagado (${M})`, k: 'pag', f: NUM, w: 18 },
    { h: `Pendiente (${M})`, k: 'pend', f: NUM, w: 18 },
    { h: 'Movimientos', k: 'n' },
  ]);
  for (const t of inf.tipos) wt.addRow({ tipo: t.nombre, comp: u(t.comprometido.valor), pag: u(t.pagado.valor), pend: u(t.pendiente.valor), n: t.cantidadMovimientos });

  // ── Gastos y contrataciones ───────────────────────────────────────────────
  const wg = wb.addWorksheet('Gastos y contrataciones');
  encabezado(wg, [
    { h: 'ID', k: 'id', w: 7 }, { h: 'Fecha', k: 'fecha', f: FECHA, w: 12 }, { h: 'Concepto', k: 'concepto', w: 32 },
    { h: 'Rubro', k: 'rubro', w: 20 }, { h: 'Tipo de gasto', k: 'tipo', w: 16 }, { h: 'Proveedor / contratista', k: 'prov', w: 22 },
    { h: 'Condición', k: 'cond', w: 13 }, { h: 'Vencimiento', k: 'venc', f: FECHA, w: 12 },
    { h: 'Moneda pactada', k: 'mon', w: 9 }, { h: 'Importe original', k: 'imp', f: NUM, w: 16 },
    { h: 'Cancelado (moneda pactada)', k: 'canc', f: NUM, w: 16 }, { h: 'Saldo (moneda pactada)', k: 'saldo', f: NUM, w: 16 },
    { h: 'Estado de pago', k: 'est', w: 13 },
    { h: 'Cotización BNA (ARS/USD)', k: 'cot', f: TC, w: 14 }, { h: 'Fecha efectiva cotización', k: 'cotf', f: FECHA, w: 13 },
    { h: 'Estado cotización', k: 'cote', w: 14 },
    { h: `Comprometido (${M})`, k: 'eqc', f: NUM, w: 16 }, { h: `Pagado (${M})`, k: 'eqp', f: NUM, w: 16 },
    { h: `Pendiente (${M})`, k: 'eqs', f: NUM, w: 16 }, { h: `Diferencia de cambio (${M})`, k: 'dif', f: NUM, w: 16 },
  ]);
  for (const m of inf.movimientos) {
    wg.addRow({
      id: m.id, fecha: toDate(m.fecha), concepto: m.concepto, rubro: m.rubro, tipo: m.tipo, prov: m.proveedor || '',
      cond: CONDICION[m.condicion], venc: toDate(m.vencimiento), mon: m.moneda, imp: u(m.importe), canc: u(m.cancelado), saldo: u(m.pendiente),
      est: ETIQUETA_ESTADO[m.estado], cot: m.cot_valor, cotf: toDate(m.cot_fecha), cote: ESTADO_COT[m.cot_estado],
      eqc: u(m.eq.comprometido.valor), eqp: u(m.eq.pagado.valor), eqs: u(m.eq.pendiente.valor), dif: u(m.eq.difCambio),
    });
  }

  // ── Pagos ─────────────────────────────────────────────────────────────────
  const wpg = wb.addWorksheet('Pagos');
  encabezado(wpg, [
    { h: 'ID pago', k: 'id', w: 8 }, { h: 'Fecha', k: 'fecha', f: FECHA, w: 12 }, { h: 'ID compromiso', k: 'cid', w: 10 },
    { h: 'Concepto', k: 'concepto', w: 30 }, { h: 'Rubro', k: 'rubro', w: 18 }, { h: 'Proveedor', k: 'prov', w: 20 },
    { h: 'Moneda entregada', k: 'mp', w: 10 }, { h: 'Importe entregado', k: 'ip', f: NUM, w: 16 },
    { h: 'Moneda del compromiso', k: 'mc', w: 10 }, { h: 'Importe que cancela', k: 'ic', f: NUM, w: 16 },
    { h: 'TC de cancelación (ARS/USD)', k: 'tcc', f: TC, w: 14 },
    { h: 'Cotización BNA del pago (ARS/USD)', k: 'cot', f: TC, w: 14 }, { h: 'Fecha efectiva cotización', k: 'cotf', f: FECHA, w: 13 },
    { h: 'Estado cotización', k: 'cote', w: 14 },
    { h: `Salida efectiva (${M})`, k: 'eq', f: NUM, w: 16 }, { h: 'Anticipo', k: 'ant', w: 9 }, { h: 'Nota', k: 'nota', w: 28 },
  ]);
  for (const m of inf.movimientos) {
    for (const pg of m.pagos) {
      wpg.addRow({
        id: pg.id, fecha: toDate(pg.fecha), cid: m.id, concepto: m.concepto, rubro: m.rubro, prov: m.proveedor || '',
        mp: pg.moneda_pago, ip: u(pg.importe_pagado), mc: m.moneda, ic: u(pg.importe_cancelado), tcc: pg.tc_cancelacion,
        cot: pg.cot_valor, cotf: toDate(pg.cot_fecha), cote: ESTADO_COT[pg.cot_estado], eq: u(pg.equivalente), ant: pg.es_anticipo ? 'Sí' : 'No', nota: pg.nota || '',
      });
    }
  }

  // ── Avances ───────────────────────────────────────────────────────────────
  const wa = wb.addWorksheet('Avances');
  encabezado(wa, [
    { h: 'Fecha', k: 'fecha', f: FECHA, w: 12 }, { h: 'Rubro', k: 'rubro', w: 22 }, { h: 'Avance acumulado %', k: 'pct', f: '0.00', w: 12 },
    { h: 'Comentario', k: 'com', w: 40 }, { h: 'Motivo de corrección a la baja', k: 'mot', w: 30 }, { h: 'Estado', k: 'est', w: 12 },
  ]);
  for (const a of inf.historialAvances) {
    wa.addRow({ fecha: toDate(a.fecha), rubro: a.rubro, pct: a.porcentaje, com: a.comentario || '', mot: a.motivo_baja || '', est: a.anulado ? 'Anulado' : 'Válido' });
  }
  wa.addRow([]);
  const ag = wa.addRow({ rubro: 'Avance general', pct: inf.avance.valor, com: inf.avance.estado === 'ok' ? 'Ponderado por peso de rubro' :'Pendiente de ponderación' });
  ag.font = { bold: true };

  return new Uint8Array(await wb.xlsx.writeBuffer());
}
