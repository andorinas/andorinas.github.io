import { useEffect, useState } from 'react';
import { api, pct, dmy, dmyHora, parseDecimal, hoyISO } from '../lib.js';
import { useObra, useAuth, useToast } from '../ctx.js';
import { Aviso, Barra, Chip, FechaInput, useCargando } from '../components/ui.jsx';
import { useInforme } from '../components/Vista.jsx';
import { verAdjunto, listarPartes, revisarParte, definirPlan } from '../datos.js';
import { Cronograma } from '../components/Portal.jsx';
import { rangoPlan } from '../../../shared/plan.js';
import { TarjetaParte } from '../components/Gremios.jsx';

function EditorPesos({ rubros, onGuardado }) {
  const { obra } = useObra();
  const toast = useToast();
  const [val, setVal] = useState(() => Object.fromEntries(rubros.map((r) => [r.id, r.peso == null ? '' : String(r.peso).replace('.', ',')])));
  const [error, setError] = useState(null);
  const [cargando, run] = useCargando();
  const suma = Object.values(val).reduce((s, x) => s + (parseDecimal(x) || 0), 0);
  const falta = Math.round((100 - suma) * 100) / 100;
  const vacios = Object.values(val).filter((x) => x === '').length;
  const guardar = () => run(async () => {
    try {
      setError(null);
      const r = await api(`/api/obras/${obra.id}/pesos`, { method: 'PUT', body: { pesos: rubros.map((x) => ({ rubro_id: x.id, peso: val[x.id] === '' ? null : parseDecimal(val[x.id]) })) } });
      toast(r.faltaAsignar === 0 ? 'Pesos guardados: suman 100 %' : `Pesos guardados. Falta asignar ${pct(r.faltaAsignar)}`);
      onGuardado();
    } catch (e) { setError(e.message); }
  });
  return (
    <section className="panel">
      <h2>Peso de cada rubro en el avance general</h2>
      <div className={`contador-pesos ${falta === 0 && !vacios ? 'ok' : falta < 0 ? 'error' : 'alerta'}`}>
        Asignado <strong>{pct(Math.round(suma * 100) / 100)}</strong> · {falta < 0 ? <>Excede en <strong>{pct(-falta)}</strong></> : <>Falta asignar <strong>{pct(falta)}</strong></>}
        {vacios > 0 && <> · {vacios} rubro{vacios > 1 ? 's' : ''} sin peso</>}
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <ul className="lista-pesos">
        {rubros.map((r) => (
          <li key={r.id}>
            <span>{r.nombre}</span>
            <div className="importe-input chico"><input inputMode="decimal" value={val[r.id]} onChange={(e) => setVal({ ...val, [r.id]: e.target.value })} aria-label={`Peso ${r.nombre}`} placeholder="—" /><span className="importe-moneda">%</span></div>
            {falta > 0 && <button className="link chico" onClick={() => setVal({ ...val, [r.id]: String(Math.round(((parseDecimal(val[r.id]) || 0) + falta) * 100) / 100).replace('.', ',') })}>+{pct(falta)}</button>}
          </li>
        ))}
      </ul>
      <button className="btn btn-primario" disabled={cargando || falta < 0} onClick={guardar}>Guardar pesos</button>
    </section>
  );
}

/** Plan de obra: inicio y fin previstos de cada rubro (el cliente ve el cronograma y la curva planificada). */
function EditorPlan({ rubros, onGuardado }) {
  const { obra } = useObra();
  const toast = useToast();
  const [val, setVal] = useState(() => Object.fromEntries(rubros.map((r) => [r.id, { inicio: r.inicio_plan || '', fin: r.fin_plan || '' }])));
  const [error, setError] = useState(null);
  const [cargando, run] = useCargando();
  const set = (id, k) => (v) => setVal((x) => ({ ...x, [id]: { ...x[id], [k]: v || '' } }));
  const vista = rubros.map((r) => ({ ...r, inicio_plan: val[r.id].inicio || null, fin_plan: val[r.id].inicio && val[r.id].fin ? val[r.id].fin : null,
    avance: r.ultimoAvance?.porcentaje ?? null }));
  const sinFechas = rubros.filter((r) => !val[r.id].inicio || !val[r.id].fin).length;
  const guardar = () => run(async () => {
    try {
      setError(null);
      await definirPlan(obra.id, rubros.map((r) => ({ id: r.id, inicio: val[r.id].inicio, fin: val[r.id].fin })));
      toast('Plan de obra guardado'); onGuardado();
    } catch (e) { setError(e.message); }
  });
  return (
    <section className="panel">
      <h2>Plan de obra</h2>
      <p className="texto-suave chico">Fechas previstas de cada rubro. Con esto el cliente ve el cronograma y la curva “según el plan” al lado del avance real.
        {sinFechas > 0 && ` Faltan fechas en ${sinFechas} rubro${sinFechas > 1 ? 's' : ''}.`}</p>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <ul className="lista-plan">
        {rubros.map((r) => (
          <li key={r.id}>
            <strong>{r.nombre}</strong>
            <label className="chico">Inicio <FechaInput value={val[r.id].inicio} onChange={set(r.id, 'inicio')} /></label>
            <label className="chico">Fin <FechaInput value={val[r.id].fin} onChange={set(r.id, 'fin')} /></label>
          </li>
        ))}
      </ul>
      <button className="btn btn-primario" disabled={cargando} onClick={guardar}>Guardar plan</button>
      {rangoPlan(vista) && <div style={{ marginTop: 16 }}><Cronograma rubros={vista} hoy={hoyISO()} /></div>}
    </section>
  );
}

export default function Avance() {
  const { obra, abrir, version, recargarObra } = useObra();
  const { user } = useAuth();
  const toast = useToast();
  const { inf } = useInforme();
  const [hist, setHist] = useState([]);
  useEffect(() => { api(`/api/obras/${obra.id}/avances`).then(setHist); }, [obra.id, version]);
  const rubros = obra.rubros.filter((r) => r.activo);
  const anular = async (a) => {
    const motivo = window.prompt(`Motivo para anular el avance de ${a.rubro} (${pct(a.porcentaje)} del ${dmy(a.fecha)}):`);
    if (!motivo) return;
    try { await api(`/api/avances/${a.id}/anular`, { method: 'POST', body: { motivo } }); toast('Avance anulado'); recargarObra(); setHist(await api(`/api/obras/${obra.id}/avances`)); }
    catch (e) { toast(e.message, 'error'); }
  };
  const av = inf?.avance;
  return (
    <>
      <PartesGremios />
      <section className="panel avance-general">
        <div>
          <h2>Avance físico general{inf ? ` al ${dmy(inf.parametros.corte)}` : ''}</h2>
          <p className="texto-suave chico">Suma de cada avance por su peso. Independiente de los pagos.</p>
        </div>
        {av && (av.estado === 'ok'
          ? <div className="avance-num"><strong>{pct(av.valor)}</strong><Barra valor={av.valor} /></div>
          : <div className="avance-num"><strong className="chico-num">Pendiente de ponderación</strong><span className="texto-suave chico">Falta asignar {pct(av.faltaAsignar)}</span></div>)}
      </section>
      <section className="panel">
        <div className="fila-entre"><h2>Por rubro</h2><button className="btn btn-primario" onClick={() => abrir('avance')}>▲ Cargar avance</button></div>
        <ul className="lista-avance">
          {rubros.map((r) => {
            const a = av?.rubros.find((x) => x.id === r.id);
            return (
              <li key={r.id}>
                <button className="link-fila" onClick={() => abrir('avance', { rubroId: r.id })}>
                  <div className="fila-entre"><strong>{r.nombre}</strong>
                    <span>{a?.avance == null ? <Chip tipo="neutro">Sin avance cargado</Chip> : <strong>{pct(a.avance)}</strong>}</span></div>
                  <Barra valor={a?.avance} />
                  <div className="chico texto-suave">Peso {r.peso == null ? 'sin definir' : pct(r.peso)}{r.ultimoAvance ? ` · último registro ${dmy(r.ultimoAvance.fecha)}` : ''}</div>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      {user.rol === 'admin' && <EditorPesos key={rubros.map((r) => `${r.id}:${r.peso}`).join()} rubros={rubros} onGuardado={recargarObra} />}
      {user.rol === 'admin' && <EditorPlan key={rubros.map((r) => `${r.id}:${r.inicio_plan}:${r.fin_plan}`).join()} rubros={rubros} onGuardado={recargarObra} />}
      <section className="panel">
        <h2>Historial</h2>
        {hist.length === 0 && <p className="texto-suave">Todavía no se cargaron avances.</p>}
        <ul className="lista-historial">
          {hist.map((a) => (
            <li key={a.id} className={a.anulado ? 'anulado' : ''}>
              <div className="fila-entre"><strong>{a.rubro} · {pct(a.porcentaje)}</strong><span className="chico">{dmy(a.fecha)}</span></div>
              {a.comentario && <div>{a.comentario}</div>}
              {a.motivo_baja && <div className="chico alerta-txt">Corrección a la baja: {a.motivo_baja}</div>}
              <div className="chico texto-suave">{a.usuario} · {dmyHora(a.creado_en)}
                {a.adjunto_id && <> · <button className="link chico" onClick={() => verAdjunto(a.adjunto_id).catch((e) => toast(e.message, 'error'))}>Ver foto</button></>}
                {a.anulado ? <span className="error-txt"> · Anulado: {a.anulado_motivo}</span> : <> · <button className="link chico" onClick={() => anular(a)}>Anular</button></>}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

/** Partes de avance enviados por los gremios: la empresa los aprueba (pasan al avance oficial) o rechaza con motivo. */
function PartesGremios() {
  const { obra, version, refrescar, recargarObra } = useObra();
  const toast = useToast();
  const [partes, setPartes] = useState([]);
  const [verTodos, setVerTodos] = useState(false);
  const [rechazando, setRechazando] = useState(null);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState(null);
  const [cargando, run] = useCargando();
  useEffect(() => { listarPartes(obra.id).then(setPartes).catch((e) => setError(e.message)); }, [obra.id, version]);
  const pendientes = partes.filter((p) => p.estado === 'pendiente');
  if (!partes.length) return null;
  const revisar = (p, aprobar) => run(async () => {
    try {
      setError(null);
      await revisarParte(p.id, aprobar, aprobar ? motivo : motivo);
      toast(aprobar ? `Parte aprobado: ${p.rubro} ${pct(p.porcentaje)}` : 'Parte rechazado');
      setRechazando(null); setMotivo(''); recargarObra(); refrescar();
    } catch (e) { setError(e.message); if (/motivo/.test(e.message)) setRechazando(p.id); }
  });
  const lista = verTodos ? partes : pendientes;
  return (
    <section className="panel">
      <div className="fila-entre envolver">
        <h2>Partes de avance de gremios {pendientes.length > 0 && <Chip tipo="alerta">{pendientes.length} por revisar</Chip>}</h2>
        <button className="link chico" onClick={() => setVerTodos(!verTodos)}>{verTodos ? 'Ver sólo pendientes' : 'Ver historial'}</button>
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {!lista.length && <p className="texto-suave">No hay partes pendientes.</p>}
      <ul className="lista-partes">
        {lista.map((p) => (
          <TarjetaParte key={p.id} p={p} acciones={p.estado === 'pendiente' && (
            rechazando === p.id ? (
              <div className="form">
                <label className="campo"><span className="campo-label">Motivo (obligatorio para rechazar o si el avance baja)</span>
                  <input value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus /></label>
                <div className="pie-form">
                  <button className="btn btn-fantasma" onClick={() => { setRechazando(null); setMotivo(''); }}>Cancelar</button>
                  <button className="btn btn-sec" disabled={cargando} onClick={() => revisar(p, true)}>Aprobar con nota</button>
                  <button className="btn btn-peligro" disabled={cargando || !motivo.trim()} onClick={() => revisar(p, false)}>Rechazar</button>
                </div>
              </div>
            ) : (
              <div className="acciones-detalle">
                <button className="btn btn-primario" disabled={cargando} onClick={() => revisar(p, true)}>✓ Aprobar</button>
                <button className="btn btn-sec" onClick={() => { setRechazando(p.id); setMotivo(''); }}>Rechazar…</button>
              </div>
            )
          )} />
        ))}
      </ul>
    </section>
  );
}
