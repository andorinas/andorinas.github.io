import { useEffect, useState } from 'react';
import { api, money, dmy, dmyHora, tc, CONDICION } from '../lib.js';
import { verAdjunto } from '../datos.js';
import { Sheet, Campo, FechaInput, ImporteInput, Aviso, Chip, useCargando } from './ui.jsx';
import { useToast } from '../ctx.js';

const ACCION = { alta: 'Alta', correccion: 'Corrección', anulacion: 'Anulación', cotizacion_completada: 'Cotización completada' };
const CAMPOS_AUDIT = { fecha: 'Fecha', concepto: 'Concepto', importe: 'Importe', moneda: 'Moneda', rubro_id: 'Rubro', tipo_id: 'Tipo', proveedor_id: 'Proveedor', vencimiento: 'Vencimiento' };

function CotInfo({ x }) {
  if (x.cot_estado === 'pendiente') return <Chip tipo="alerta">Cotización pendiente</Chip>;
  if (!x.cot_valor) return null;
  return <span className="texto-suave chico">BNA {tc(x.cot_valor)} ({dmy(x.cot_fecha)})</span>;
}

export default function DetalleCompromiso({ obra, id, onClose, onCambio, onPagar }) {
  const toast = useToast();
  const [c, setC] = useState(null);
  const [modo, setModo] = useState(null); // 'corregir' | 'anular' | {pago}
  const [form, setForm] = useState({});
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState(null);
  const [cat, setCat] = useState({ tipos: [] });
  const [cargando, run] = useCargando();
  const cargar = () => api(`/api/compromisos/${id}`).then(setC).catch((e) => setError(e.message));
  useEffect(() => { cargar(); api('/api/catalogo').then(setCat).catch((e) => setError(`No se pudieron cargar rubros y tipos de gasto (${e.message}). Revisá la conexión y volvé a intentar.`)); }, [id]);

  if (!c) return <Sheet titulo="Movimiento" obra={obra.nombre} onClose={onClose}>{error ? <Aviso tipo="error">{error}</Aviso> : <div className="esqueleto" />}</Sheet>;

  const abrirCorregir = () => {
    setForm({ fecha: c.fecha, concepto: c.concepto, importe: c.importe, rubro_id: c.rubro_id, tipo_id: c.tipo_id, vencimiento: c.vencimiento || '', proveedor: c.proveedor || '' });
    setMotivo(''); setModo('corregir'); setError(null);
  };
  const guardar = () => run(async () => {
    try {
      if (modo === 'corregir') {
        const cambios = {};
        for (const k of ['fecha', 'concepto', 'importe', 'rubro_id', 'tipo_id']) if (form[k] !== c[k]) cambios[k] = form[k];
        if ((form.vencimiento || null) !== (c.vencimiento || null)) cambios.vencimiento = form.vencimiento || null;
        if ((form.proveedor || '') !== (c.proveedor || '')) cambios.proveedor = form.proveedor || null;
        await api(`/api/compromisos/${id}`, { method: 'PATCH', body: { ...cambios, motivo } });
        toast('Corrección guardada (queda registrada en el historial)');
      } else if (modo === 'anular') {
        await api(`/api/compromisos/${id}/anular`, { method: 'POST', body: { motivo } });
        toast('Movimiento anulado');
      } else if (modo?.pago) {
        await api(`/api/pagos/${modo.pago}/anular`, { method: 'POST', body: { motivo } });
        toast('Pago anulado');
      }
      setModo(null); setError(null); await cargar(); onCambio();
    } catch (e) { setError(e.message); }
  });

  const pagosValidos = c.pagos.filter((p) => !p.anulado);
  return (
    <Sheet titulo={c.concepto} obra={obra.nombre} onClose={onClose} ancho>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {c.anulado ? <Aviso tipo="error">Anulado: {c.anulado_motivo}</Aviso> : null}
      <dl className="detalle-grid">
        <div><dt>Fecha</dt><dd>{dmy(c.fecha)}</dd></div>
        <div><dt>Condición</dt><dd>{CONDICION[c.condicion]}</dd></div>
        <div><dt>Rubro</dt><dd>{c.rubro}</dd></div>
        <div><dt>Tipo de gasto</dt><dd>{c.tipo}</dd></div>
        <div><dt>Proveedor / contratista</dt><dd>{c.proveedor || '—'}</dd></div>
        {c.vencimiento && <div><dt>Vencimiento</dt><dd>{dmy(c.vencimiento)}</dd></div>}
        <div><dt>Importe pactado</dt><dd><strong>{money(c.importe, c.moneda)}</strong></dd></div>
        <div><dt>Pagado (cancelado)</dt><dd>{money(c.cancelado, c.moneda)}</dd></div>
        <div><dt>Saldo pendiente</dt><dd><strong>{money(c.saldo, c.moneda)}</strong></dd></div>
        <div><dt>Cotización</dt><dd><CotInfo x={c} /></dd></div>
        <div><dt>Cargado por</dt><dd>{c.usuario} · {dmyHora(c.creado_en)}</dd></div>
        {c.adjunto_id && <div><dt>Comprobante</dt><dd><button className="link" onClick={() => verAdjunto(c.adjunto_id).catch((e) => toast(e.message, 'error'))}>Ver comprobante</button></dd></div>}
      </dl>
      {c.cot_estado === 'ok' && c.cot_fuente && <p className="texto-suave chico">Fuente: {c.cot_fuente}</p>}

      {!c.anulado && !modo && (
        <div className="acciones-detalle">
          {c.saldo > 0 && <button className="btn btn-primario" onClick={() => onPagar(c.id)}>Registrar pago</button>}
          <button className="btn btn-sec" onClick={abrirCorregir}>Corregir</button>
          <button className="btn btn-peligro" onClick={() => { setModo('anular'); setMotivo(''); }}>Anular</button>
        </div>
      )}

      {modo === 'corregir' && (
        <div className="grupo resaltado form">
          <h3>Corregir movimiento</h3>
          <div className="fila-campos">
            <Campo label="Fecha"><FechaInput value={form.fecha} onChange={(v) => setForm({ ...form, fecha: v })} /></Campo>
            <Campo label={`Importe (${c.moneda})`}><ImporteInput value={form.importe} onChange={(v) => setForm({ ...form, importe: v })} moneda={c.moneda} /></Campo>
          </div>
          <Campo label="Concepto"><input value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })} /></Campo>
          <div className="fila-campos">
            <Campo label="Rubro"><select value={form.rubro_id} onChange={(e) => setForm({ ...form, rubro_id: Number(e.target.value) })}>
              {obra.rubros.filter((r) => r.activo || r.id === c.rubro_id).map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}</select></Campo>
            <Campo label="Tipo"><select value={form.tipo_id} onChange={(e) => setForm({ ...form, tipo_id: Number(e.target.value) })}>
              {cat.tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select></Campo>
          </div>
          <div className="fila-campos">
            <Campo label="Proveedor"><input value={form.proveedor} onChange={(e) => setForm({ ...form, proveedor: e.target.value })} /></Campo>
            {c.condicion !== 'contado' && <Campo label="Vencimiento"><FechaInput value={form.vencimiento} onChange={(v) => setForm({ ...form, vencimiento: v })} /></Campo>}
          </div>
          <Campo label="Motivo de la corrección" req><input value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Campo>
          <div className="pie-form">
            <button className="btn btn-fantasma" onClick={() => setModo(null)}>Cancelar</button>
            <button className="btn btn-primario" disabled={!motivo.trim() || cargando} onClick={guardar}>Guardar corrección</button>
          </div>
        </div>
      )}
      {(modo === 'anular' || modo?.pago) && (
        <div className="grupo resaltado form">
          <h3>{modo === 'anular' ? 'Anular movimiento (y sus pagos)' : 'Anular pago'}</h3>
          <p className="texto-suave chico">No se borra: queda anulado con tu usuario, la fecha y el motivo.</p>
          <Campo label="Motivo" req><input value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus /></Campo>
          <div className="pie-form">
            <button className="btn btn-fantasma" onClick={() => setModo(null)}>Cancelar</button>
            <button className="btn btn-peligro" disabled={!motivo.trim() || cargando} onClick={guardar}>Confirmar anulación</button>
          </div>
        </div>
      )}

      <h3 className="subtitulo">Pagos ({pagosValidos.length})</h3>
      {c.pagos.length === 0 && <p className="texto-suave">Sin pagos registrados.</p>}
      <ul className="lista-pagos">
        {c.pagos.map((p) => (
          <li key={p.id} className={p.anulado ? 'anulado' : ''}>
            <div className="fila-entre">
              <strong>{dmy(p.fecha)} · {money(p.importe_pagado, p.moneda_pago)}</strong>
              {p.es_anticipo ? <Chip tipo="info">Anticipo</Chip> : null}
            </div>
            {p.moneda_pago !== c.moneda && <div className="chico">Cancela {money(p.importe_cancelado, c.moneda)} · TC de cancelación {tc(p.tc_cancelacion)}</div>}
            <div className="chico texto-suave"><CotInfo x={p} /> · {p.usuario} {p.nota ? `· ${p.nota}` : ''}</div>
            {p.adjunto_id && <button className="link chico" onClick={() => verAdjunto(p.adjunto_id).catch((e) => toast(e.message, 'error'))}>Ver comprobante</button>}
            {p.anulado ? <div className="chico error-txt">Anulado: {p.anulado_motivo}</div>
              : c.condicion !== 'contado' && !c.anulado && <button className="link chico" onClick={() => { setModo({ pago: p.id }); setMotivo(''); }}>Anular pago</button>}
          </li>
        ))}
      </ul>

      <details className="historial">
        <summary>Historial de cambios ({c.auditoria.length})</summary>
        <ul>
          {c.auditoria.map((a) => {
            let cambios = '';
            if (a.accion === 'correccion' && a.antes && a.despues) {
              const an = JSON.parse(a.antes), de = JSON.parse(a.despues);
              cambios = Object.keys(CAMPOS_AUDIT).filter((k) => an[k] !== de[k]).map((k) => `${CAMPOS_AUDIT[k]}: ${k === 'importe' ? `${money(an[k], an.moneda)} → ${money(de[k], de.moneda)}` : k.endsWith('_id') ? 'modificado' : `${an[k] ?? '—'} → ${de[k] ?? '—'}`}`).join('; ');
            }
            return <li key={a.id}><strong>{ACCION[a.accion] || a.accion}</strong> de {a.entidad} · {a.usuario} · {dmyHora(a.fecha)}{a.motivo ? ` · Motivo: ${a.motivo}` : ''}{cambios && <div className="chico">{cambios}</div>}</li>;
          })}
        </ul>
      </details>
    </Sheet>
  );
}
