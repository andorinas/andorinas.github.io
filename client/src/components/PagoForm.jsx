import { useEffect, useMemo, useRef, useState } from 'react';
import { api, subirAdjunto, hoyISO, uuid, money, dmy, tc, parseDecimal, CONDICION } from '../lib.js';
import { Sheet, Campo, Segmentado, FechaInput, ImporteInput, Aviso, AdjuntoInput, useCargando } from './ui.jsx';
import { useCotizacion, LineaCotizacion } from './GastoForm.jsx';
import { useToast } from '../ctx.js';

export default function PagoForm({ obra, onClose, onListo, compromisoId }) {
  const toast = useToast();
  const clave = useMemo(uuid, []);
  const [abiertos, setAbiertos] = useState(null);
  const [sel, setSel] = useState(null);
  const [buscar, setBuscar] = useState('');
  const [f, setF] = useState({ fecha: hoyISO(), moneda_pago: 'ARS', importe_pagado: null, importe_cancelado: null, tcTxt: '', modoCruce: 'cancela', nota: '', es_anticipo: false });
  const [archivo, setArchivo] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, run] = useCargando();
  const cot = useCotizacion(f.fecha);
  const refConf = useRef(null);
  useEffect(() => { if (preview) refConf.current?.scrollIntoView({ block: "nearest" }); }, [preview]);
  const set = (k) => (v) => { setPreview(null); setF((x) => ({ ...x, [k]: v })); };

  useEffect(() => {
    api(`/api/obras/${obra.id}/compromisos-abiertos`).then((l) => {
      setAbiertos(l);
      if (compromisoId) { const c = l.find((x) => x.id === compromisoId); if (c) elegir(c); }
    }).catch((e) => setError(e.message));
  }, [obra.id, compromisoId]);

  const elegir = (c) => { setSel(c); setPreview(null); setF((x) => ({ ...x, moneda_pago: c.moneda, importe_pagado: null, importe_cancelado: null, tcTxt: '' })); };
  const cruce = sel && f.moneda_pago !== sel.moneda;

  const cuerpo = () => {
    const b = { fecha: f.fecha, moneda_pago: f.moneda_pago, importe_pagado: f.importe_pagado, nota: f.nota, es_anticipo: f.es_anticipo };
    if (cruce) {
      if (f.modoCruce === 'cancela') b.importe_cancelado = f.importe_cancelado;
      else b.tc_cancelacion = parseDecimal(f.tcTxt);
    }
    return b;
  };

  const validarLocal = () => {
    if (!f.importe_pagado) return 'Ingresá el importe entregado';
    if (!cruce && f.importe_pagado > sel.saldo) return `El pago supera el saldo (${money(sel.saldo, sel.moneda)})`;
    if (cruce && f.modoCruce === 'cancela' && !f.importe_cancelado) return `Indicá cuánto cancela en ${sel.moneda}`;
    if (cruce && f.modoCruce === 'tc' && !(parseDecimal(f.tcTxt) > 0)) return 'Indicá el tipo de cambio de cancelación';
    if (cruce && f.modoCruce === 'cancela' && f.importe_cancelado > sel.saldo) return `Cancela más que el saldo (${money(sel.saldo, sel.moneda)})`;
    return null;
  };

  const revisar = (e) => {
    e.preventDefault();
    const v = validarLocal(); if (v) return setError(v);
    run(async () => {
      try { setError(null); setPreview(await api(`/api/compromisos/${sel.id}/pagos/preview`, { method: 'POST', body: cuerpo() })); }
      catch (err) { setError(err.message); }
    });
  };
  const confirmar = () => run(async () => {
    try {
      setError(null);
      let adjunto_id = null;
      if (archivo) adjunto_id = (await subirAdjunto(obra.id, archivo)).id;
      const r = await api(`/api/compromisos/${sel.id}/pagos`, { method: 'POST', body: { ...cuerpo(), adjunto_id, clave_idem: clave } });
      toast(r.duplicado ? 'Ese pago ya estaba registrado (no se duplicó).' : `Pago registrado. Saldo: ${money(r.saldoResultante, sel.moneda)}`);
      onListo();
    } catch (err) {
      setError(err.message);
      toast(err.message, 'error');
      // Error de conexión: puede haberse guardado igual. Se mantiene la revisión para reintentar (la clave evita duplicar).
      if (!err.red) setPreview(null);
    }
  });

  const filtrados = (abiertos || []).filter((c) => `${c.concepto} ${c.proveedor || ''} ${c.rubro}`.toLowerCase().includes(buscar.toLowerCase()));

  return (
    <Sheet titulo="Registrar pago" obra={obra.nombre} onClose={onClose}>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {!sel ? (
        <div className="form">
          <p className="texto-suave">Elegí la compra o contratación que vas a pagar. Para compras al contado usá <strong>Agregar gasto</strong>.</p>
          <input type="search" placeholder="Buscar por concepto, proveedor o rubro" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
          {abiertos === null && <div className="esqueleto chico" />}
          {abiertos?.length === 0 && <Aviso>No hay compromisos con saldo pendiente en esta obra.</Aviso>}
          <ul className="lista-elegible">
            {filtrados.map((c) => (
              <li key={c.id}><button type="button" onClick={() => elegir(c)}>
                <span className="le-titulo">{c.concepto}</span>
                <span className="le-sub">{[c.proveedor, c.rubro, CONDICION[c.condicion], dmy(c.fecha)].filter(Boolean).join(' · ')}{c.vencimiento && <> · vence {dmy(c.vencimiento)}</>}</span>
                <span className="le-monto">Saldo <strong>{money(c.saldo, c.moneda)}</strong></span>
              </button></li>
            ))}
          </ul>
        </div>
      ) : (
        <form className="form" onSubmit={revisar}>
          <div className="compromiso-elegido">
            <div>
              <div className="le-titulo">{sel.concepto}</div>
              <div className="le-sub">{[sel.proveedor, sel.rubro].filter(Boolean).join(' · ')} · pactado {money(sel.importe, sel.moneda)}</div>
              <div className="saldo-grande">Queda por pagar: <strong>{money(sel.saldo, sel.moneda)}</strong></div>
            </div>
            {!compromisoId && <button type="button" className="link" onClick={() => setSel(null)}>Cambiar</button>}
          </div>
          <div className="fila-campos">
            <Campo label="Fecha del pago" req><FechaInput value={f.fecha} onChange={set('fecha')} required /></Campo>
            <Campo label="Moneda entregada" req><Segmentado value={f.moneda_pago} onChange={set('moneda_pago')} nombre="Moneda entregada" opciones={[['ARS', 'ARS'], ['USD', 'USD']]} /></Campo>
          </div>
          <Campo label="Dinero entregado" req><ImporteInput value={f.importe_pagado} onChange={set('importe_pagado')} moneda={f.moneda_pago} autoFocus /></Campo>
          {!cruce && <button type="button" className="link chico" onClick={() => set('importe_pagado')(sel.saldo)}>Pagar el saldo total ({money(sel.saldo, sel.moneda)})</button>}
          {cruce && (
            <fieldset className="grupo resaltado">
              <legend>Pago en {f.moneda_pago} de una deuda en {sel.moneda}</legend>
              <p className="texto-suave chico">La deuda se lleva en {sel.moneda}. Indicá cuánto cancela este pago según lo acordado, o el tipo de cambio de cancelación.</p>
              <Segmentado chico value={f.modoCruce} onChange={set('modoCruce')} nombre="Modo" opciones={[['cancela', `Importe que cancela (${sel.moneda})`], ['tc', 'Tipo de cambio']]} />
              {f.modoCruce === 'cancela'
                ? <Campo label={`Cancela en ${sel.moneda}`} req><ImporteInput value={f.importe_cancelado} onChange={set('importe_cancelado')} moneda={sel.moneda} /></Campo>
                : <Campo label="TC de cancelación (ARS por USD)" req><input inputMode="decimal" value={f.tcTxt} onChange={(e) => set('tcTxt')(e.target.value)} placeholder="Ej.: 1.300,00" /></Campo>}
            </fieldset>
          )}
          <LineaCotizacion cot={cot} fecha={f.fecha} />
          <label className="check"><input type="checkbox" checked={f.es_anticipo} onChange={(e) => set('es_anticipo')(e.target.checked)} /> Es un anticipo</label>
          <Campo label="Nota" hint="Opcional"><input value={f.nota} onChange={(e) => set('nota')(e.target.value)} maxLength={300} /></Campo>
          <Campo label="Comprobante" hint="Foto o PDF, opcional"><AdjuntoInput archivo={archivo} onFile={setArchivo} /></Campo>

          {preview ? (
            <div ref={refConf} className="confirmacion" role="region" aria-label="Confirmar pago">
              <h3>Revisá antes de confirmar</h3>
              {error && <Aviso tipo="error">{error}</Aviso>}
              <dl>
                <div><dt>Sale de caja</dt><dd>{money(preview.importe_pagado, preview.moneda_pago)}</dd></div>
                <div><dt>Cancela de la deuda</dt><dd>{money(preview.importe_cancelado, preview.moneda_compromiso)}</dd></div>
                {preview.tc && <div><dt>TC de cancelación</dt><dd>{tc(preview.tc)}</dd></div>}
                <div><dt>Saldo actual</dt><dd>{money(preview.saldo, preview.moneda_compromiso)}</dd></div>
                <div className="destacado"><dt>Saldo después del pago</dt><dd>{money(preview.saldoResultante, preview.moneda_compromiso)}</dd></div>
                <div><dt>Fecha</dt><dd>{dmy(preview.fecha)}</dd></div>
              </dl>
              <div className="pie-form">
                <button type="button" className="btn btn-fantasma" onClick={() => setPreview(null)}>Modificar</button>
                <button type="button" className="btn btn-primario" disabled={cargando} onClick={confirmar}>{cargando ? 'Registrando…' : 'Confirmar pago'}</button>
              </div>
            </div>
          ) : (
            <div className="pie-form">
              <button type="button" className="btn btn-fantasma" onClick={onClose}>Cancelar</button>
              <button className="btn btn-primario" disabled={cargando}>{cargando ? 'Calculando…' : 'Revisar pago'}</button>
            </div>
          )}
        </form>
      )}
    </Sheet>
  );
}
