// PDF ejecutivo (A4) pensado para compartir por WhatsApp: primera página autosuficiente.
// Recibe el resultado de calcularObra(): mismos totales que tablero y Excel.
import PDFDocument from 'pdfkit';
import { money0, money, pct, dmy, CRITERIO, ESTADO_OBRA, tc } from '../formato.js';

const C = { ink: '#141417', navy: '#1F3B5C', gris: '#6B6B73', linea: '#DDDCD8', fondo: '#F4F3F0', rojo: '#B42318', ambar: '#B54708', verde: '#067647' };
// Logo real de Andorinas: se recibe como imágenes PNG (data URL) en versión blanca para el encabezado oscuro.
// opciones.logo = { isologo, texto } — si no se pasan, el encabezado muestra sólo el nombre.

/** Une los fragmentos del PDF en un Uint8Array (funciona en Node y en el navegador). */
function unir(chunks) {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

export function generarPdf(inf, opciones = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 36, bufferPages: true, info: { Title: `Informe ${inf.obra.nombre}`, Author: 'Andorinas – ControlAr' } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(unir(chunks)));
    doc.on('error', reject);

    const p = inf.parametros, M = p.moneda, T = inf.totales;
    const W = doc.page.width, L = 36, R = W - 36, AW = R - L;
    const fmt = (c) => money0(c, M);

    // ── Encabezado de marca ───────────────────────────────────────────────
    doc.rect(0, 0, W, 64).fill(C.ink);
    if (opciones.logo?.isologo && opciones.logo?.texto) {
      doc.image(opciones.logo.isologo, L, 9, { height: 46 });          // isologo 398×423
      doc.image(opciones.logo.texto, L + 54, 19, { height: 27 });      // texto 725×140
    } else {
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(17).text('ANDORINAS', L, 18, { characterSpacing: 1.5 });
      doc.font('Helvetica').fontSize(7.5).fillColor('#C9C9CF').text('INGENIERÍA & CONSTRUCCIÓN', L + 1, 38, { characterSpacing: 1 });
    }
    doc.font('Helvetica').fontSize(9).fillColor('#FFFFFF').text('Informe ejecutivo de obra', L, 20, { width: AW, align: 'right' });
    doc.fontSize(8).fillColor('#C9C9CF').text(`Generado ${dmy(new Date(Date.now() - 3 * 3600e3).toISOString())}`, L, 34, { width: AW, align: 'right' });

    // ── Obra y parámetros ─────────────────────────────────────────────────
    let y = 80;
    doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(18).text(inf.obra.nombre, L, y, { width: AW });
    y = doc.y + 2;
    doc.font('Helvetica').fontSize(9).fillColor(C.gris)
      .text([inf.obra.ubicacion, `Estado: ${ESTADO_OBRA[inf.obra.estado]}`, `Inicio: ${dmy(inf.obra.fecha_inicio)}`].filter(Boolean).join('  ·  '), L, y, { width: AW });
    y = doc.y + 6;
    doc.roundedRect(L, y, AW, 34, 4).fill(C.fondo);
    doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(9.5)
      .text(`Fecha de corte: ${dmy(p.corte)}`, L + 10, y + 6, { continued: true })
      .font('Helvetica').text(`   ·   Moneda: ${M}   ·   Criterio: ${CRITERIO[p.criterio]}${p.criterio === 'manual' ? ` (${tc(p.cotizacionManual)})` : ''}`);
    doc.fontSize(8.5).fillColor(C.gris).text(`Filtros: ${p.filtros.length ? p.filtros.join(' · ') : 'sin filtros (obra completa)'}`, L + 10, y + 20, { width: AW - 20, lineBreak: false, ellipsis: true });
    y += 44;

    if (!inf.completo) {
      const txt = `ATENCIÓN: totales incompletos. Hay ${inf.faltantes.length} importe(s) con cotización pendiente que no se pudieron convertir a ${M}: `
        + inf.faltantes.slice(0, 4).map((f) => `${money(f.importe, f.moneda)} (${f.ref})`).join('; ') + (inf.faltantes.length > 4 ? '…' : '');
      const h = doc.heightOfString(txt, { width: AW - 20, fontSize: 8.5 }) + 12;
      doc.roundedRect(L, y, AW, h, 4).fill('#FEF3F2');
      doc.fillColor(C.rojo).font('Helvetica-Bold').fontSize(8.5).text(txt, L + 10, y + 6, { width: AW - 20 });
      y += h + 8;
    }

    // ── Avance general + cifras ───────────────────────────────────────────
    const av = inf.avance;
    doc.roundedRect(L, y, 150, 120, 6).fill(C.navy);
    doc.fillColor('#C9D6E5').font('Helvetica').fontSize(9).text('AVANCE FÍSICO GENERAL', L + 12, y + 12, { width: 130 });
    if (av.estado === 'ok') {
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(32).text(pct(av.valor), L + 12, y + 32, { width: 130, lineBreak: false });
      doc.rect(L + 12, y + 72, 126, 6).fill('#3E5F84');
      doc.rect(L + 12, y + 72, 126 * Math.min(1, av.valor / 100), 6).fill('#FFFFFF');
      if (av.sinAvance.length) doc.fillColor('#C9D6E5').font('Helvetica').fontSize(6.5).text(`Sin avance cargado: ${av.sinAvance.join(', ')}`, L + 12, y + 84, { width: 130 });
    } else {
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(15).text('Pendiente de ponderación', L + 12, y + 38, { width: 130 });
      doc.font('Helvetica').fontSize(8).fillColor('#C9D6E5').text(`Falta asignar ${pct(av.faltaAsignar)} de peso`, L + 12, y + 82, { width: 130 });
    }

    const kpis = [
      ['Presupuesto vigente', T.presupuesto, C.ink],
      ['Comprometido', T.comprometido, C.ink],
      ['Pagado', T.pagado, C.ink],
      ['Pendiente de pago', T.pendiente, C.ambar],
      [T.disponible.valor < 0 ? 'Exceso sobre presupuesto' : 'Disponible para contratar', { ...T.disponible, valor: T.disponible.valor == null ? null : Math.abs(T.disponible.valor) }, T.disponible.valor < 0 ? C.rojo : C.verde],
      ['Diferencia de cambio', { valor: T.difCambio, faltantes: T.difCambio == null ? [1] : [] }, C.gris],
    ];
    const kx = L + 160, kw = (AW - 160) / 2, kh = 40;
    kpis.forEach(([t, v, col], i) => {
      const x = kx + (i % 2) * kw, yy = y + Math.floor(i / 2) * kh;
      doc.fillColor(C.gris).font('Helvetica').fontSize(8).text(t.toUpperCase(), x + 6, yy + 4, { width: kw - 12 });
      doc.fillColor(col).font('Helvetica-Bold').fontSize(14).text(v.valor == null ? '—' : fmt(v.valor) + (v.faltantes.length ? ' *' : ''), x + 6, yy + 16, { width: kw - 12 });
    });
    y += 128;
    doc.fillColor(C.gris).font('Helvetica').fontSize(7).text(
      'Comprometido = compras y contrataciones registradas (incluye contado). Pendiente = saldo de obligaciones asumidas. '
      + 'Disponible = presupuesto vigente - comprometido de rubros presupuestados. '
      + (p.criterio === 'historico' ? 'Histórico: comprometido a la cotización BNA de su fecha, pagos a la de su fecha y saldo a la del compromiso; la diferencia de cambio concilia las cifras.' : 'Manual: todos los equivalentes con un único valor.')
      + (T.rubrosSinPresupuesto.length ? ` Rubros sin presupuestar: ${T.rubrosSinPresupuesto.join(', ')}.` : '')
      + (inf.completo ? '' : ' (*) importe incompleto.') + (p.notaFiltros ? ` ${p.notaFiltros}` : ''), L, y, { width: AW });
    y = doc.y + 10;

    // ── Desvíos ───────────────────────────────────────────────────────────
    doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(11).text('Rubros con desvíos', L, y);
    y = doc.y + 4;
    if (!inf.desvios.length) {
      doc.font('Helvetica').fontSize(9).fillColor(C.verde).text('Ningún rubro supera su presupuesto vigente.', L, y);
      y = doc.y + 8;
    } else {
      for (const d of inf.desvios) {
        const txt = d.sinPresupuesto
          ? `${d.nombre}: ${fmt(d.comprometido)} comprometidos sin presupuesto aprobado`
          : `${d.nombre}: excede en ${fmt(d.exceso)} (${pct(d.pct)} sobre ${fmt(d.presupuesto)})`;
        doc.circle(L + 4, y + 5, 2.5).fill(C.rojo);
        doc.fillColor(C.rojo).font('Helvetica').fontSize(9).text(txt, L + 12, y, { width: AW - 12 });
        y = doc.y + 3;
      }
      y += 5;
    }

    // ── Resumen por rubro ─────────────────────────────────────────────────
    doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(11).text(`Resumen por rubro (${M})`, L, y);
    y = doc.y + 4;
    const cols = [
      { t: 'Rubro', w: 118, a: 'left' }, { t: 'Presupuesto', w: 72 }, { t: 'Comprometido', w: 72 }, { t: 'Pagado', w: 66 },
      { t: 'Pendiente', w: 66 }, { t: 'Disponible', w: 70 }, { t: 'Avance', w: 59 },
    ];
    const fila = (vals, opts = {}) => {
      const h = 15;
      if (y + h > doc.page.height - 50) { doc.addPage(); y = 40; }
      if (opts.bg) doc.rect(L, y, AW, h).fill(opts.bg);
      let x = L;
      vals.forEach((v, i) => {
        doc.fillColor(opts.colors?.[i] || opts.color || C.ink).font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.size || 8)
          .text(v, x + 3, y + 4, { width: cols[i].w - 6, align: cols[i].a || 'right', lineBreak: false, ellipsis: true });
        x += cols[i].w;
      });
      y += h;
    };
    fila(cols.map((c) => c.t), { bg: C.ink, color: '#FFFFFF', bold: true });
    inf.rubros.forEach((r, i) => {
      const disp = r.disponible ? r.disponible.valor : null;
      fila([
        r.nombre,
        r.presupuesto ? fmt(r.presupuesto.valor) + (r.presupuesto.faltantes.length ? '*' : '') : 'Sin presup.',
        fmt(r.comprometido.valor) + (r.comprometido.faltantes.length ? '*' : ''),
        fmt(r.pagado.valor) + (r.pagado.faltantes.length ? '*' : ''),
        fmt(r.pendiente.valor) + (r.pendiente.faltantes.length ? '*' : ''),
        r.disponible?.faltantes.length ? 'incompleto *' : disp == null ? '—' : (disp < 0 ? `-${fmt(-disp)}` : fmt(disp)),
        r.avance == null ? 'Sin avance' : pct(r.avance),
      ], { bg: i % 2 ? C.fondo : null, colors: [null, null, null, null, null, disp != null && disp < 0 ? C.rojo : null, r.avance == null ? C.gris : null] });
    });
    const m = (t) => (t.faltantes.length ? ' *' : '');
    fila(['TOTAL OBRA', fmt(T.presupuesto.valor) + m(T.presupuesto), fmt(T.comprometido.valor) + m(T.comprometido), fmt(T.pagado.valor) + m(T.pagado), fmt(T.pendiente.valor) + m(T.pendiente),
      T.disponible.valor == null ? 'incompleto *' : T.disponible.valor < 0 ? `-${fmt(-T.disponible.valor)}` : fmt(T.disponible.valor), av.estado === 'ok' ? pct(av.valor) : 'Pend. pond.'],
    { bold: true, bg: '#E6E5E1' });

    // ── Por tipo de gasto (si entra o página siguiente) ───────────────────
    if (inf.tipos.length) {
      y += 12;
      if (y + 30 + inf.tipos.length * 15 > doc.page.height - 50) { doc.addPage(); y = 40; }
      doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(11).text(`Por tipo de gasto (${M})`, L, y);
      y = doc.y + 4;
      const tcols = [{ w: 190, a: 'left' }, { w: 110 }, { w: 110 }, { w: 113 }];
      const tfila = (vals, o = {}) => {
        if (o.bg) doc.rect(L, y, AW, 15).fill(o.bg);
        let x = L;
        vals.forEach((v, i) => { doc.fillColor(o.color || C.ink).font(o.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).text(v, x + 3, y + 4, { width: tcols[i].w - 6, align: tcols[i].a || 'right', lineBreak: false }); x += tcols[i].w; });
        y += 15;
      };
      tfila(['Tipo de gasto', 'Comprometido', 'Pagado', 'Pendiente'], { bg: C.ink, color: '#FFFFFF', bold: true });
      const mt = (t) => (t.faltantes.length ? ' *' : '');
      inf.tipos.forEach((t, i) => tfila([t.nombre, fmt(t.comprometido.valor) + mt(t.comprometido), fmt(t.pagado.valor) + mt(t.pagado), fmt(t.pendiente.valor) + mt(t.pendiente)], { bg: i % 2 ? C.fondo : null }));
    }

    // Pie en cada página
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0;
      doc.fillColor(C.gris).font('Helvetica').fontSize(7)
        .text(`ControlAr · Andorinas Ingeniería & Construcción · ${inf.obra.nombre} · Corte ${dmy(p.corte)} · ${M} · ${CRITERIO[p.criterio]} · Pág. ${i + 1}/${range.count}`,
          L, doc.page.height - 28, { width: AW, align: 'center', lineBreak: false });
    }
    doc.end();
  });
}
