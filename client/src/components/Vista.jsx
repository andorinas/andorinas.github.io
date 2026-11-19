// Controles compartidos (tablero, movimientos, avance): moneda, criterio, cotización manual y fecha de corte.
import { useEffect, useState } from 'react';
import { api, qs, tc, parseDecimal, hoyISO, dmy, money } from '../lib.js';
import { useObra, useToast, useAuth } from '../ctx.js';
import { Link } from 'react-router-dom';
import { generarArchivo, descargar } from '../datos.js';
import { Segmentado, FechaInput, Aviso, useCargando } from './ui.jsx';

export function paramsVista(obra, vista, filtros = {}) {
  return {
    moneda: vista.moneda, criterio: vista.criterio, corte: vista.corte,
    cotizacionManual: vista.criterio === 'manual' ? obra.cotizacion_manual : undefined, ...filtros,
  };
}

export function useInforme(filtros = {}) {
  const { obra, vista, version } = useObra();
  const [inf, setInf] = useState(null);
  const [error, setError] = useState(null);
  const q = qs(paramsVista(obra, vista, filtros));
  const bloqueado = vista.criterio === 'manual' && !obra.cotizacion_manual;
  useEffect(() => {
    if (bloqueado) { setInf(null); return; }
    let vivo = true;
    api(`/api/obras/${obra.id}/informe?${q}`).then((d) => { if (vivo) { setInf(d); setError(null); } }).catch((e) => vivo && setError(e.message));
    return () => { vivo = false; };
  }, [obra.id, q, version, bloqueado]);
  return { inf, error, q, bloqueado };
}

export function ControlesVista() {
  const { obra, vista, setVista, recargarObra } = useObra();
  const toast = useToast();
  const [editando, setEditando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [txt, setTxt] = useState('');
  const [cargando, run] = useCargando();
  const guardarManual = () => run(async () => {
    const v = parseDecimal(txt);
    if (!(v > 0)) return toast('La cotización manual debe ser un número positivo', 'error');
    await api(`/api/obras/${obra.id}/cotizacion-manual`, { method: 'PUT', body: { valor: v } });
    await recargarObra(); setEditando(false); toast(`Dólar manual: ${tc(v)}`);
  });
  const sinManual = vista.criterio === 'manual' && !obra.cotizacion_manual;
  return (
    <section className={`controles-vista ${abierto ? "abierto" : ""}`} aria-label="Opciones de visualización">
      <button className="controles-resumen" onClick={() => setAbierto(!abierto)} aria-expanded={abierto}>
        <span><strong>{vista.moneda}</strong> · {vista.criterio === "manual" ? `Dólar manual ${obra.cotizacion_manual ? tc(obra.cotizacion_manual) : "(sin definir)"}` : "BNA histórico"} · Corte <strong>{dmy(vista.corte)}</strong></span>
        <span className="link">{abierto ? "Listo" : "Cambiar"}</span>
      </button>
      <div className="control">
        <span className="control-label">Moneda de visualización</span>
        <Segmentado value={vista.moneda} onChange={(v) => setVista({ moneda: v })} nombre="Moneda de visualización" opciones={[['ARS', 'ARS'], ['USD', 'USD']]} />
      </div>
      <div className="control">
        <span className="control-label">Criterio de conversión</span>
        <Segmentado value={vista.criterio} onChange={(v) => setVista({ criterio: v })} nombre="Criterio de conversión" opciones={[['historico', 'BNA histórico'], ['manual', 'Dólar manual']]} />
      </div>
      {vista.criterio === 'manual' && (
        <div className="control">
          <span className="control-label">Dólar manual de la obra</span>
          {editando || sinManual ? (
            <div className="fila-inline">
              <div className="importe-input"><span className="importe-moneda">ARS</span><input inputMode="decimal" placeholder="Ej.: 1.350" value={txt} onChange={(e) => setTxt(e.target.value)} autoFocus={editando} /></div>
              <button className="btn btn-primario" disabled={cargando} onClick={guardarManual}>Aplicar</button>
              {editando && <button className="btn btn-fantasma" onClick={() => setEditando(false)}>✕</button>}
            </div>
          ) : (
            <div className="fila-inline"><strong className="valor-aplicado">{tc(obra.cotizacion_manual)}</strong>
              <button className="link" onClick={() => { setTxt(String(obra.cotizacion_manual).replace('.', ',')); setEditando(true); }}>Cambiar</button></div>
          )}
        </div>
      )}
      <div className="control">
        <span className="control-label">Fecha de corte</span>
        <div className="fila-inline">
          <FechaInput value={vista.corte} onChange={(v) => setVista({ corte: v === hoyISO() ? '' : v })} />
          {!vista.esHoy && <button className="btn btn-sec btn-chico" onClick={() => setVista({ corte: '' })}>Hoy</button>}
        </div>
      </div>
      {sinManual && <Aviso tipo="alerta">Definí la cotización manual (ARS por USD) para ver la obra con ese criterio. Tocá “BNA histórico” para volver.</Aviso>}
    </section>
  );
}

/** Banda que describe exactamente qué se está viendo (también figura en PDF y Excel). */
export function DescripcionVista({ inf }) {
  const p = inf.parametros;
  return (
    <div className="descripcion-vista">
      <span>Corte <strong>{dmy(p.corte)}</strong></span>
      <span>Moneda <strong>{p.moneda}</strong></span>
      <span>{p.criterio === 'manual' ? <>Dólar manual <strong>{tc(p.cotizacionManual)}</strong></> : <>Criterio <strong>BNA vendedor histórico</strong></>}</span>
      {p.filtros.length > 0 && <span>Filtros: <strong>{p.filtros.join(' · ')}</strong></span>}
    </div>
  );
}

export function AvisoFaltantes({ inf }) {
  const { user } = useAuth();
  if (inf.completo && !inf.hayCotizacionesPendientes) return null;
  const accion = user.rol === 'admin'
    ? <Link className="btn btn-sec" to="/cotizaciones">Cargar cotización</Link>
    : null;
  const quien = user.rol === 'admin' ? 'Cargá la cotización BNA de esas fechas y se completan solos.' : 'Se completan solos cuando el administrador cargue la cotización BNA de esas fechas.';
  if (inf.completo) return <Aviso tipo="info" accion={accion}>Hay movimientos con <strong>cotización pendiente</strong>. No afectan esta vista porque están en {inf.parametros.moneda}, pero sí la vista en la otra moneda. {quien}</Aviso>;
  return (
    <Aviso tipo="error" accion={accion}>
      <strong>Totales incompletos.</strong> Falta convertir a {inf.parametros.moneda} por cotización pendiente:
      <ul className="lista-faltantes">{inf.faltantes.slice(0, 6).map((f, i) => <li key={i}>{money(f.importe, f.moneda)} — {f.ref}</li>)}</ul>
      {inf.faltantes.length > 6 && <span>y {inf.faltantes.length - 6} más. </span>}Los importes marcados con * no los incluyen. {quien}
    </Aviso>
  );
}

/** PDF y Excel se generan en el dispositivo con el mismo cálculo que el tablero. */
export function BotonesExportar({ q }) {
  const { obra } = useObra();
  const toast = useToast();
  const [cargando, run] = useCargando();
  const params = Object.fromEntries(new URLSearchParams(q));
  const hacer = (tipo, compartir) => run(async () => {
    try {
      const file = await generarArchivo(obra.id, params, tipo);
      if (compartir && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: `Informe ${obra.nombre}` });
      else descargar(file);
    } catch (e) { if (e.name !== 'AbortError') toast(e.message, 'error'); }
  });
  return (
    <div className="exportar">
      <button className="btn btn-sec" onClick={() => hacer('pdf', true)} disabled={cargando}>{cargando ? 'Generando…' : '⇪ Compartir PDF'}</button>
      <button className="btn btn-sec" onClick={() => hacer('pdf')} disabled={cargando}>⬇ PDF ejecutivo</button>
      <button className="btn btn-sec" onClick={() => hacer('xlsx')} disabled={cargando}>⬇ Excel</button>
    </div>
  );
}
