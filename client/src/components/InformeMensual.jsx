// Informe mensual para el cliente: avance del mes (real y según el plan), días de trabajo y lluvia, novedades y fotos.
// Se arma en el navegador con los datos del portal y se imprime o guarda como PDF desde el diálogo de impresión.
import { useEffect, useMemo, useState } from 'react';
import { dmy, pct, hoyISO } from '../lib.js';
import { Marca } from './ui.jsx';
import { Calendario, resumenDias, avanceRubroAl, MESES } from './Portal.jsx';
import { avancePlanificado, mesesDesde, msDeIso, isoDeMs, DIA } from '../../../shared/plan.js';

const finDeMes = (mes) => { const [a, m] = mes.split('-').map(Number); return isoDeMs(Date.UTC(a, m, 0)); };
const nombreMes = (mes) => `${MESES[Number(mes.slice(5)) - 1]} ${mes.slice(0, 4)}`;
const signo = (v) => (v > 0 ? '+' : '') + pct(v);
const puntos = (v) => `${v > 0 ? '+' : ''}${String(Math.round(v * 10) / 10).replace('.', ',')} pts`;

export default function InformeMensual({ p, lluvia, onClose }) {
  const o = p.obra;
  const hoy = p.hoy || hoyISO();
  const meses = useMemo(() => mesesDesde(o.fecha_inicio, hoy), [o.fecha_inicio, hoy]);
  const [mes, setMes] = useState(meses[0]);
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    document.body.classList.add('imprimiendo-informe');
    return () => { document.removeEventListener('keydown', esc); document.body.classList.remove('imprimiendo-informe'); };
  }, [onClose]);

  // Obra que todavía no empezó: no hay meses para informar.
  if (!mes) return (
    <div className="informe-fondo" role="dialog" aria-modal="true" aria-label="Informe mensual">
      <div className="informe-barra no-imprimir"><span /><button type="button" className="btn btn-fantasma" onClick={onClose}>Cerrar</button></div>
      <article className="informe-hoja">
        <h1>Informe mensual</h1>
        <p>La obra empieza el <strong>{dmy(o.fecha_inicio)}</strong>. El primer informe va a estar disponible a partir de ese mes.</p>
      </article>
    </div>
  );

  const desde = `${mes}-01` < o.fecha_inicio ? o.fecha_inicio : `${mes}-01`;
  const hasta = finDeMes(mes) > hoy ? hoy : finDeMes(mes);
  const antes = isoDeMs(msDeIso(desde) - DIA);
  const parcial = hasta < finDeMes(mes);

  const general = (fecha) => (p.ponderado ? Math.round(p.rubros.reduce((s, r) => s + Number(r.peso) * (avanceRubroAl(p.historial, r.id, fecha) || 0), 0)) / 100 : null);
  const alCierre = general(hasta), alInicio = general(antes);
  const plan = avancePlanificado(p.rubros, hasta);
  const res = resumenDias(p.dias, lluvia, desde, hasta);
  const conLluvia = Object.keys(lluvia).some((f) => f >= desde && f <= hasta);
  const rubros = p.rubros.map((r) => {
    const fin = avanceRubroAl(p.historial, r.id, hasta), ini = avanceRubroAl(p.historial, r.id, antes);
    return { ...r, fin, delta: (fin || 0) - (ini || 0) };
  });
  const novedades = p.novedades.filter((n) => n.fecha >= desde && n.fecha <= hasta);
  const fotos = p.fotos.filter((f) => f.fecha >= desde && f.fecha <= hasta && f.url).slice(0, 8);

  return (
    <div className="informe-fondo" role="dialog" aria-modal="true" aria-label={`Informe mensual · ${nombreMes(mes)}`}>
      <div className="informe-barra no-imprimir">
        <label className="fila-inline">Mes
          <select value={mes} onChange={(e) => setMes(e.target.value)}>{meses.map((m) => <option key={m} value={m}>{nombreMes(m)}</option>)}</select>
        </label>
        <div className="fila-inline">
          <button type="button" className="btn btn-sec" onClick={() => window.print()}>🖨 Imprimir o guardar PDF</button>
          <button type="button" className="btn btn-fantasma" onClick={onClose}>Cerrar</button>
        </div>
      </div>
      <article className="informe-hoja">
        <header className="informe-cab">
          <Marca alto={64} />
          <div className="informe-cab-txt">
            <div className="informe-tipo">Informe mensual de obra</div>
            <h1>{o.nombre}</h1>
            <div>{nombreMes(mes)}{parcial ? ` · al ${dmy(hasta)}` : ''}{o.ubicacion ? ` · ${o.ubicacion}` : ''}</div>
          </div>
        </header>

        <section className="informe-kpis">
          <div><span className="informe-num">{alCierre == null ? '—' : pct(alCierre)}</span><span>avance de la obra{parcial ? ' a hoy' : ' al cierre del mes'}</span></div>
          <div><span className="informe-num">{alCierre == null ? '—' : puntos(alCierre - (alInicio || 0))}</span><span>de avance en el mes</span></div>
          <div><span className="informe-num">{plan == null ? '—' : pct(plan)}</span><span>previsto según el plan</span></div>
          <div><span className="informe-num">{res.trabajados + res.parciales}</span><span>días con trabajo en obra{res.parciales ? ` (${res.parciales} a medias)` : ''}</span></div>
          <div><span className="informe-num">{res.perdidos}</span><span>días sin trabajar{res.perdidosLluvia ? ` · ${res.perdidosLluvia} por lluvia` : ''}</span></div>
          {conLluvia && <div><span className="informe-num">{res.mmTotal} mm</span><span>de lluvia en la zona · {res.diasLluvia} días</span></div>}
        </section>
        {plan != null && alCierre != null && (
          <p className="informe-nota">
            {alCierre + 2 >= plan ? 'La obra avanza de acuerdo con lo previsto.' : `La obra está ${String(Math.round((plan - alCierre) * 10) / 10).replace('.', ',')} puntos por detrás de lo previsto${res.perdidosLluvia ? `; en el mes se perdieron ${res.perdidosLluvia} días por lluvia` : ''}.`}
          </p>
        )}

        <section>
          <h2>Avance por etapa</h2>
          <table className="informe-tabla">
            <thead><tr><th>Etapa</th><th>Previsto</th><th className="num">En el mes</th><th className="num">Avance</th></tr></thead>
            <tbody>
              {rubros.map((r) => (
                <tr key={r.id}>
                  <td>{r.nombre}</td>
                  <td className="chico">{r.inicio_plan ? `${dmy(r.inicio_plan)} al ${dmy(r.fin_plan)}` : '—'}</td>
                  <td className="num">{r.delta ? signo(r.delta) : '—'}</td>
                  <td className="num"><strong>{r.fin == null ? 'Sin iniciar' : pct(r.fin)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="informe-calendario">
          <h2>Días de trabajo y lluvia</h2>
          <Calendario dias={p.dias} lluvia={lluvia} mes={mes} onMes={() => {}} desde={o.fecha_inicio} fijo />
        </section>

        {novedades.length > 0 && (
          <section>
            <h2>Novedades del mes</h2>
            <ul className="informe-novedades">
              {novedades.map((n) => <li key={n.id}><strong>{dmy(n.fecha)} · {n.titulo}</strong>{n.texto && <div>{n.texto}</div>}</li>)}
            </ul>
          </section>
        )}

        {fotos.length > 0 && (
          <section>
            <h2>Fotos del mes</h2>
            <div className="informe-fotos">
              {fotos.map((f) => <figure key={f.id}><img src={f.url} alt={f.descripcion || 'Foto de la obra'} /><figcaption>{dmy(f.fecha)}{f.descripcion ? ` · ${f.descripcion}` : ''}</figcaption></figure>)}
            </div>
          </section>
        )}

        <footer className="informe-pie">Andorinas · Ingeniería &amp; Construcción · Informe generado el {dmy(hoyISO())}. Lluvia estimada para la zona de la obra (NASA POWER).</footer>
      </article>
    </div>
  );
}
