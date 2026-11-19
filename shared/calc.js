// ─────────────────────────────────────────────────────────────────────────────
// Motor de cálculo ÚNICO. Tablero, PDF y Excel consumen exclusivamente el
// resultado de calcularObra(); por eso con los mismos parámetros los totales
// coinciden en las tres salidas. Funciones puras: no tocan la base de datos.
//
// Importes en centavos (enteros). Cotizaciones en ARS por 1 USD.
// ─────────────────────────────────────────────────────────────────────────────

/** Total con trazabilidad de faltantes de cotización. */
function total() { return { valor: 0, faltantes: [] }; }
function sumInto(t, x) {
  if (x.valor != null) t.valor += x.valor;
  t.faltantes.push(...x.faltantes);
  return t;
}
export const completo = (t) => t.faltantes.length === 0;

/**
 * Equivalente de un importe en la moneda de visualización.
 * @param {number} cents importe original
 * @param {'ARS'|'USD'} moneda moneda original
 * @param {number|null} tcHistorico cotización guardada en el registro
 * @param {object} vista { moneda, criterio, cotizacionManual }
 * @param {string} ref descripción del registro (para informar faltantes)
 */
export function equivalente(cents, moneda, tcHistorico, vista, ref, clave = ref) {
  if (moneda === vista.moneda || cents === 0) return { valor: cents, faltantes: [] };
  const tc = vista.criterio === 'manual' ? vista.cotizacionManual : tcHistorico;
  if (!(tc > 0)) return { valor: null, faltantes: [{ moneda, importe: cents, ref, clave }] };
  const v = moneda === 'USD' ? Math.round(cents * tc) : Math.round(cents / tc);
  return { valor: v, faltantes: [] };
}

const eqTotal = (...a) => sumInto(total(), equivalente(...a));

export function estadoPago(c, pendiente, cancelado, corte) {
  if (pendiente === 0) return 'pagado';
  if (c.vencimiento && c.vencimiento < corte) return 'vencido';
  return cancelado > 0 ? 'parcial' : 'pendiente';
}

/** Presupuesto vigente de un rubro a la fecha de corte (null = sin presupuestar). */
export function presupuestoVigente(versiones, corte) {
  return versiones
    .filter((v) => v.vigente_desde <= corte)
    .sort((a, b) => b.version - a.version)[0] || null;
}

/** Último avance acumulado registrado a la fecha de corte. */
export function avanceVigente(avances, corte) {
  return avances
    .filter((a) => !a.anulado && a.fecha <= corte)
    .sort((a, b) => (b.fecha.localeCompare(a.fecha)) || (b.id - a.id))[0] || null;
}

/**
 * Avance general ponderado.
 *  - Todos los pesos definidos y suman 100: Σ avance × peso / 100 (sin avance => 0 %).
 *  - Si no: 'pendiente_ponderacion' y se informa cuánto falta asignar.
 */
export function avanceGeneral(rubros) {
  const definidos = rubros.filter((r) => r.peso != null);
  const sumaPesos = round2(definidos.reduce((s, r) => s + r.peso, 0));
  const faltaAsignar = round2(100 - sumaPesos);
  const sinAvance = rubros.filter((r) => r.avance == null).map((r) => r.nombre);
  // Tolerancia de 0,01 punto (p. ej. 33,33 × 3 = 99,99).
  if (!rubros.length || definidos.length !== rubros.length || Math.abs(sumaPesos - 100) > 0.0101) {
    return { estado: 'pendiente_ponderacion', valor: null, sumaPesos, faltaAsignar, sinAvance };
  }
  const valor = round2(rubros.reduce((s, r) => s + (r.avance ?? 0) * r.peso / 100, 0));
  return { estado: 'ok', valor, sumaPesos, faltaAsignar: 0, sinAvance };
}
const round2 = (x) => Math.round(x * 100) / 100;

/**
 * Cálculo completo del estado de una obra.
 * @param {object} data { obra, rubros, tipos, proveedores, presupuestos, compromisos, pagos, avances }
 * @param {object} p { moneda:'ARS'|'USD', criterio:'historico'|'manual', cotizacionManual, corte:'AAAA-MM-DD',
 *                     filtros?: { rubroId, tipoId, proveedorId, estadoPago, desde } }
 */
export function calcularObra(data, p) {
  const vista = { moneda: p.moneda, criterio: p.criterio, cotizacionManual: p.cotizacionManual ?? null };
  if (vista.criterio === 'manual' && !(vista.cotizacionManual > 0)) {
    throw Object.assign(new Error('Definí una cotización manual positiva para usar el criterio "Dólar manual".'), { status: 400 });
  }
  const corte = p.corte;
  const f = p.filtros || {};
  // Presupuesto, disponible, exceso y desvíos siempre se miden sobre la obra completa a la fecha de corte:
  // un filtro de tipo, proveedor, estado o período no puede esconder que un rubro se pasó del presupuesto.
  const filtrosQueRecortan = ['tipoId', 'proveedorId', 'estadoPago', 'desde'].some((k) => f[k]);
  const base = filtrosQueRecortan ? calcularObra(data, { ...p, filtros: f.rubroId ? { rubroId: f.rubroId } : {} }) : null;
  const nombreRubro = new Map(data.rubros.map((r) => [r.id, r.nombre]));
  const nombreTipo = new Map(data.tipos.map((t) => [t.id, t.nombre]));
  const nombreProv = new Map((data.proveedores || []).map((t) => [t.id, t.nombre]));

  // ── Compromisos y sus pagos a la fecha de corte ───────────────────────────
  const pagosPorComp = new Map();
  for (const pg of data.pagos) {
    if (pg.anulado || pg.fecha > corte) continue;
    if (!pagosPorComp.has(pg.compromiso_id)) pagosPorComp.set(pg.compromiso_id, []);
    pagosPorComp.get(pg.compromiso_id).push(pg);
  }

  const movimientos = [];
  for (const c of data.compromisos) {
    if (c.anulado || c.fecha > corte) continue;
    if (f.rubroId && c.rubro_id !== Number(f.rubroId)) continue;
    if (f.tipoId && c.tipo_id !== Number(f.tipoId)) continue;
    if (f.proveedorId && c.proveedor_id !== Number(f.proveedorId)) continue;
    if (f.desde && c.fecha < f.desde) continue;

    const pagos = (pagosPorComp.get(c.id) || []).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id);
    const cancelado = pagos.reduce((s, x) => s + x.importe_cancelado, 0);
    const pendiente = c.importe - cancelado;
    const estado = estadoPago(c, pendiente, cancelado, corte);
    if (f.estadoPago && f.estadoPago !== estado && !(f.estadoPago === 'adeudado' && pendiente > 0)) continue;

    const ref = `${c.concepto} (${c.fecha})`;
    const comprometido = eqTotal(c.importe, c.moneda, c.cot_valor, vista, ref, `c${c.id}`);
    const pagado = total();
    const pagosOut = pagos.map((pg) => {
      const eq = equivalente(pg.importe_pagado, pg.moneda_pago, pg.cot_valor, vista, `Pago ${ref} del ${pg.fecha}`, `p${pg.id}`);
      sumInto(pagado, eq);
      return { ...pg, equivalente: eq.valor };
    });
    const pend = eqTotal(pendiente, c.moneda, c.cot_valor, vista, `Saldo ${ref}`, `c${c.id}`);
    // Dólar manual con pagos en la misma moneda: un único valor para todo => sin diferencia de cambio
    // (evita una diferencia "fantasma" de 1 centavo por redondeo).
    if (vista.criterio === 'manual' && pagos.every((pg) => pg.moneda_pago === c.moneda) && completo(comprometido) && completo(pagado)) {
      pend.valor = comprometido.valor - pagado.valor;
    }
    // Diferencia de cambio: lo que hace falta para conciliar comprometido = pagado + pendiente − dif.
    // Positiva = mayor costo efectivo; negativa = ahorro por tipo de cambio.
    const difCambio = completo(comprometido) && completo(pagado) && completo(pend)
      ? pagado.valor + pend.valor - comprometido.valor : null;

    movimientos.push({
      ...c,
      rubro: nombreRubro.get(c.rubro_id), tipo: nombreTipo.get(c.tipo_id), proveedor: nombreProv.get(c.proveedor_id) || null,
      cancelado, pendiente, estado, pagos: pagosOut,
      eq: { comprometido, pagado, pendiente: pend, difCambio },
    });
  }

  // ── Por rubro ─────────────────────────────────────────────────────────────
  const esActivo = (r) => r.activo !== 0 && r.activo !== false;
  const orden = (a, b) => a.orden - b.orden || a.id - b.id;
  const rubrosActivos = data.rubros.filter(esActivo).sort(orden);
  // Un rubro desactivado que tiene movimientos se sigue mostrando: la suma por rubro debe dar el total.
  const rubrosTabla = data.rubros.filter((r) => esActivo(r) || movimientos.some((m) => m.rubro_id === r.id)).sort(orden);
  const rubrosVisibles = f.rubroId ? rubrosTabla.filter((r) => r.id === Number(f.rubroId)) : rubrosTabla;

  const filasRubro = rubrosVisibles.map((r) => {
    const movs = movimientos.filter((m) => m.rubro_id === r.id);
    const versiones = data.presupuestos.filter((v) => v.rubro_id === r.id);
    const pv = presupuestoVigente(versiones, corte);
    const presupuesto = pv
      ? eqTotal(pv.importe, pv.moneda, pv.cot_valor, vista, `Presupuesto ${r.nombre}`, `b${pv.id}`)
      : null;
    const comprometido = total(), pagado = total(), pendiente = total();
    let difCambio = 0, difCompleta = true;
    for (const m of movs) {
      sumInto(comprometido, m.eq.comprometido); sumInto(pagado, m.eq.pagado); sumInto(pendiente, m.eq.pendiente);
      if (m.eq.difCambio == null) difCompleta = false; else difCambio += m.eq.difCambio;
    }
    let disponible = null;
    if (presupuesto) {
      const falt = [...presupuesto.faltantes, ...comprometido.faltantes];
      // Si falta convertir algo, no se muestra un disponible/exceso parcial como si fuera completo.
      disponible = { valor: falt.length ? null : presupuesto.valor - comprometido.valor, faltantes: falt };
    }
    const av = avanceVigente(data.avances.filter((a) => a.rubro_id === r.id), corte);
    return {
      id: r.id, nombre: r.nombre, peso: r.peso ?? null, inactivo: !esActivo(r),
      presupuesto, presupuestoVersion: pv ? { version: pv.version, moneda: pv.moneda, importe: pv.importe, fecha_ref: pv.fecha_ref, cot_valor: pv.cot_valor, cot_fecha: pv.cot_fecha, cot_estado: pv.cot_estado } : null,
      sinPresupuesto: !pv,
      comprometido, pagado, pendiente, disponible,
      exceso: disponible && completo(disponible) && disponible.valor < 0 ? -disponible.valor : 0,
      difCambio: difCompleta ? difCambio : null,
      avance: av ? av.porcentaje : null, avanceFecha: av ? av.fecha : null,
      cantidadMovimientos: movs.length,
    };
  });

  // ── Por tipo de gasto ─────────────────────────────────────────────────────
  const filasTipo = data.tipos.map((t) => {
    const movs = movimientos.filter((m) => m.tipo_id === t.id);
    const comprometido = total(), pagado = total(), pendiente = total();
    for (const m of movs) { sumInto(comprometido, m.eq.comprometido); sumInto(pagado, m.eq.pagado); sumInto(pendiente, m.eq.pendiente); }
    return { id: t.id, nombre: t.nombre, comprometido, pagado, pendiente, cantidadMovimientos: movs.length };
  }).filter((t) => t.cantidadMovimientos > 0);

  // ── Totales de obra (cada compromiso se cuenta una sola vez) ─────────────
  const T = { presupuesto: total(), comprometido: total(), pagado: total(), pendiente: total(), disponible: null, difCambio: 0 };
  let difCompleta = true;
  for (const m of movimientos) {
    sumInto(T.comprometido, m.eq.comprometido); sumInto(T.pagado, m.eq.pagado); sumInto(T.pendiente, m.eq.pendiente);
    if (m.eq.difCambio == null) difCompleta = false; else T.difCambio += m.eq.difCambio;
  }
  if (!difCompleta) T.difCambio = null;
  const conPresupuesto = filasRubro.filter((r) => r.presupuesto);
  for (const r of conPresupuesto) sumInto(T.presupuesto, r.presupuesto);
  // Disponible total: presupuesto de rubros presupuestados − comprometido de esos mismos rubros.
  const compPresupuestados = total();
  for (const r of conPresupuesto) sumInto(compPresupuestados, r.comprometido);
  const faltDisp = [...T.presupuesto.faltantes, ...compPresupuestados.faltantes];
  T.disponible = { valor: faltDisp.length ? null : T.presupuesto.valor - compPresupuestados.valor, faltantes: faltDisp };
  T.rubrosSinPresupuesto = filasRubro.filter((r) => r.sinPresupuesto).map((r) => r.nombre);
  T.comprometidoSinPresupuesto = filasRubro.filter((r) => r.sinPresupuesto).reduce((s, r) => s + r.comprometido.valor, 0);

  const faltantes = dedupe([...T.presupuesto.faltantes, ...T.comprometido.faltantes, ...T.pagado.faltantes, ...T.pendiente.faltantes]);

  if (base) {
    // Presupuesto / disponible / exceso desde la obra completa (ver arriba).
    for (const r of filasRubro) {
      const b = base.rubros.find((x) => x.id === r.id);
      if (b) Object.assign(r, { presupuesto: b.presupuesto, disponible: b.disponible, exceso: b.exceso, sinPresupuesto: b.sinPresupuesto, comprometidoObra: b.comprometido });
    }
    T.presupuesto = base.totales.presupuesto;
    T.disponible = base.totales.disponible;
  }

  const desvios = base ? base.desvios : filasRubro
    .filter((r) => r.exceso > 0 || (r.sinPresupuesto && r.comprometido.valor > 0))
    .map((r) => ({ id: r.id, nombre: r.nombre, exceso: r.exceso, sinPresupuesto: r.sinPresupuesto, comprometido: r.comprometido.valor,
      presupuesto: r.presupuesto?.valor ?? null, pct: r.presupuesto?.valor ? round2((r.comprometido.valor / r.presupuesto.valor - 1) * 100) : null }));

  // El avance general siempre considera todos los rubros activos (no se filtra).
  const avanceRubros = rubrosActivos.map((r) => {
    const av = avanceVigente(data.avances.filter((a) => a.rubro_id === r.id), corte);
    return { id: r.id, nombre: r.nombre, peso: r.peso ?? null, avance: av ? av.porcentaje : null };
  });

  // Sólo cuenta lo que entra en esta vista (fecha de corte y filtros), no versiones viejas ni registros fuera del período.
  const usaCotizacionesPendientes = movimientos.some((m) => m.cot_estado === 'pendiente' || m.pagos.some((x) => x.cot_estado === 'pendiente'))
    || filasRubro.some((r) => r.presupuestoVersion?.cot_estado === 'pendiente');

  return {
    parametros: {
      moneda: vista.moneda, criterio: vista.criterio, cotizacionManual: vista.criterio === 'manual' ? vista.cotizacionManual : null,
      corte, filtros: describirFiltros(f, nombreRubro, nombreTipo, nombreProv), filtrosRaw: f,
      notaFiltros: base ? 'Presupuesto, disponible y desvíos se calculan sobre la obra completa a la fecha de corte; los filtros sólo recortan comprometido, pagado y pendiente.' : null,
    },
    obra: { id: data.obra.id, nombre: data.obra.nombre, ubicacion: data.obra.ubicacion, estado: data.obra.estado, fecha_inicio: data.obra.fecha_inicio },
    totales: T,
    completo: faltantes.length === 0,
    faltantes,
    hayCotizacionesPendientes: usaCotizacionesPendientes,
    avance: { ...avanceGeneral(avanceRubros), rubros: avanceRubros },
    rubros: filasRubro,
    tipos: filasTipo,
    proveedoresObra: (data.proveedores || []).map(({ id, nombre }) => ({ id, nombre })),
    historialAvances: data.avances
      .filter((a) => a.fecha <= corte && (!f.rubroId || a.rubro_id === Number(f.rubroId)))
      .map((a) => ({ ...a, rubro: nombreRubro.get(a.rubro_id) }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id),
    desvios,
    movimientos,
  };
}

function dedupe(arr) {
  const seen = new Set();
  // Por registro (no por texto): dos compras idénticas sin cotización son dos faltantes distintos.
  return arr.filter((x) => { const k = x.clave; if (seen.has(k)) return false; seen.add(k); return true; });
}

const ESTADOS = { pagado: 'Pagado', parcial: 'Pago parcial', pendiente: 'Pendiente', vencido: 'Vencido', adeudado: 'Con saldo' };
function describirFiltros(f, nr, nt, np) {
  const out = [];
  if (f.desde) out.push(`Desde ${f.desde.split('-').reverse().join('/')}`);
  if (f.rubroId) out.push(`Rubro: ${nr.get(Number(f.rubroId)) ?? f.rubroId}`);
  if (f.tipoId) out.push(`Tipo: ${nt.get(Number(f.tipoId)) ?? f.tipoId}`);
  if (f.proveedorId) out.push(`Proveedor: ${np.get(Number(f.proveedorId)) ?? f.proveedorId}`);
  if (f.estadoPago) out.push(`Estado de pago: ${ESTADOS[f.estadoPago] ?? f.estadoPago}`);
  return out;
}
export const ETIQUETA_ESTADO = ESTADOS;
