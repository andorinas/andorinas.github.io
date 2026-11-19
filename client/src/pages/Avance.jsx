import { useEffect, useState } from 'react';
import { api, pct, dmy, dmyHora, parseDecimal } from '../lib.js';
import { useObra, useAuth, useToast } from '../ctx.js';
import { Aviso, Barra, Chip, useCargando } from '../components/ui.jsx';
import { useInforme } from '../components/Vista.jsx';
import { verAdjunto } from '../datos.js';

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
