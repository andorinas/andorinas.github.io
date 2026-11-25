// Portal del cliente: cómo avanza su obra. Sin importes ni datos internos.
// Lo usan el cliente (ClienteApp) y la empresa ("Vista del cliente") con los mismos datos de portal_obra().
import { useEffect, useMemo, useState } from 'react';
import { dmy, pct, hoyISO } from '../lib.js';
import { lluviaZona, abrirArchivo, CLIMA, ICONO_CLIMA, TRABAJO, CATEGORIA_DOC, ICONO_DOC } from '../datos.js';
import { useToast } from '../ctx.js';
import { Chip, Barra } from './ui.jsx';
import { GaleriaFotos } from './Gremios.jsx';
import { ESTADO_OBRA } from '../lib.js';
import { avancePlanificado, curvaPlan, rangoPlan, msDeIso, isoDeMs, DIA } from '../../../shared/plan.js';
import InformeMensual from './InformeMensual.jsx';

export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const diasEntre = (a, b) => Math.round((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / 864e5);
export const LLUVIA_MM = 2; // desde 2 mm se considera día de lluvia

/** Lluvia de la zona entre dos fechas (NASA POWER), con estado de carga. */
export function useLluvia(obra, desde, hasta) {
  const [lluvia, setLluvia] = useState({});
  const [estado, setEstado] = useState('cargando');
  useEffect(() => {
    if (obra?.latitud == null) { setEstado('sin-ubicacion'); return; }
    setEstado('cargando');
    lluviaZona(obra.latitud, obra.longitud, desde, hasta).then((d) => { setLluvia(d); setEstado('ok'); }).catch(() => setEstado('error'));
  }, [obra?.latitud, obra?.longitud, desde, hasta]);
  return { lluvia, estado };
}

/** Calendario mensual: parte diario (si se trabajó) + lluvia de la zona. */
export function Calendario({ dias, lluvia = {}, mes, onMes, desde, onDia, seleccionado, fijo }) {
  const [a, m] = mes.split('-').map(Number);
  const primero = new Date(a, m - 1, 1);
  const offset = (primero.getDay() + 6) % 7;
  const total = new Date(a, m, 0).getDate();
  const porFecha = Object.fromEntries(dias.map((d) => [d.fecha, d]));
  const hoy = hoyISO();
  const celdas = [];
  for (let i = 0; i < offset; i++) celdas.push(null);
  for (let d = 1; d <= total; d++) celdas.push(iso(new Date(a, m - 1, d)));
  const mover = (k) => { const d = new Date(a, m - 1 + k, 1); onMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); };
  const puedeAtras = !desde || `${mes}-01` > desde.slice(0, 7) + '-01';
  const puedeAdelante = `${mes}-01` < hoy.slice(0, 7) + '-01';
  return (
    <div className="calendario">
      {!fijo && <div className="cal-nav">
        <button type="button" className="btn btn-fantasma btn-chico" onClick={() => mover(-1)} disabled={!puedeAtras} aria-label="Mes anterior">‹</button>
        <strong>{MESES[m - 1]} {a}</strong>
        <button type="button" className="btn btn-fantasma btn-chico" onClick={() => mover(1)} disabled={!puedeAdelante} aria-label="Mes siguiente">›</button>
      </div>}
      <div className="cal-grilla">
        {DIAS.map((d, i) => <div key={i} className="cal-dia-nombre">{d}</div>)}
        {celdas.map((f, i) => {
          if (!f) return <div key={i} />;
          const p = porFecha[f]; const mm = lluvia[f];
          const futuro = f > hoy; const antes = desde && f < desde;
          const clase = ['cal-dia', p ? `cal-${p.trabajo}` : '', futuro || antes ? 'cal-fuera' : '', f === hoy ? 'cal-hoy' : '', seleccionado === f ? 'cal-sel' : ''].join(' ');
          const titulo = [dmy(f), p && `${CLIMA[p.clima]} · ${TRABAJO[p.trabajo]}`, mm != null && `Lluvia en la zona: ${mm} mm`].filter(Boolean).join(' · ');
          const Tag = onDia && !futuro ? 'button' : 'div';
          return (
            <Tag key={i} type={Tag === 'button' ? 'button' : undefined} className={clase} title={titulo} aria-label={titulo} onClick={Tag === 'button' ? () => onDia(f) : undefined}>
              <span className="cal-num">{Number(f.slice(8))}</span>
              {p && <span className="cal-clima" aria-hidden="true">{ICONO_CLIMA[p.clima]}</span>}
              {mm >= LLUVIA_MM && <span className="cal-mm">{Math.round(mm)}<span className="cal-mm-u"> mm</span></span>}
            </Tag>
          );
        })}
      </div>
      <div className="cal-leyenda chico">
        <span><i className="cal-punto cal-normal" /> Se trabajó</span>
        <span><i className="cal-punto cal-parcial" /> A medias</span>
        <span><i className="cal-punto cal-no" /> No se trabajó</span>
        <span>💧 mm = lluvia en la zona</span>
      </div>
    </div>
  );
}

/** Resumen de días de trabajo y de lluvia. */
export function resumenDias(dias, lluvia, desde, hasta) {
  const enRango = (f) => (!desde || f >= desde) && (!hasta || f <= hasta);
  const d = dias.filter((x) => enRango(x.fecha));
  const mm = Object.entries(lluvia).filter(([f]) => enRango(f));
  return {
    trabajados: d.filter((x) => x.trabajo === 'normal').length,
    parciales: d.filter((x) => x.trabajo === 'parcial').length,
    perdidos: d.filter((x) => x.trabajo === 'no').length,
    perdidosLluvia: d.filter((x) => x.trabajo !== 'normal' && (x.clima === 'lluvia' || x.clima === 'tormenta')).length,
    diasLluvia: mm.filter(([, v]) => v >= LLUVIA_MM).length,
    mmTotal: Math.round(mm.reduce((s, [, v]) => s + v, 0)),
  };
}

/** Evolución del avance general: real (línea llena) y planificado (punteada), con la marca de hoy. */
export function GraficoAvance({ serie, rubros = [], inicio, hoy }) {
  const real = serie.filter((s) => s.avance != null).map((s) => ({ fecha: s.fecha, avance: Number(s.avance) }));
  if (real.length && inicio && real[0].fecha > inicio) real.unshift({ fecha: inicio, avance: 0 });
  const plan = curvaPlan(rubros);
  if (real.length < 2 && !plan.length) return <p className="texto-suave chico">La evolución aparece cuando haya avances en más de un mes.</p>;
  const W = 600, H = 210, P = 40;
  const ts = [...real, ...plan].map((p) => msDeIso(p.fecha));
  const t0 = Math.min(...ts), t1 = Math.max(...ts, t0 + 1);
  const x = (f) => P + ((msDeIso(f) - t0) / (t1 - t0)) * (W - 2 * P);
  const y = (v) => H - P - (v / 100) * (H - 2 * P);
  const camino = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.fecha).toFixed(1)},${y(p.avance).toFixed(1)}`).join(' ');
  const hoyX = hoy && msDeIso(hoy) >= t0 && msDeIso(hoy) <= t1 ? x(hoy) : null;
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="grafico-avance" role="img" aria-label="Evolución del avance de la obra, real y planificado">
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}><line x1={P} x2={W - P} y1={y(v)} y2={y(v)} className="ga-grilla" /><text x={P - 6} y={y(v) + 4} className="ga-eje" textAnchor="end">{v}%</text></g>
        ))}
        {hoyX != null && <g><line x1={hoyX} x2={hoyX} y1={P - 14} y2={H - P} className="ga-hoy" /><text x={hoyX} y={P - 18} className="ga-eje" textAnchor="middle">Hoy</text></g>}
        {plan.length > 0 && <path d={camino(plan)} className="ga-plan" />}
        {real.length > 1 && <>
          <path d={`${camino(real)} L${x(real.at(-1).fecha)},${y(0)} L${x(real[0].fecha)},${y(0)} Z`} className="ga-area" />
          <path d={camino(real)} className="ga-linea" />
          {real.map((p) => <circle key={p.fecha} cx={x(p.fecha)} cy={y(p.avance)} r="4" className="ga-punto"><title>{dmy(p.fecha)}: {pct(p.avance)}</title></circle>)}
        </>}
        <text x={P} y={H - 12} className="ga-eje">{dmy(isoDeMs(t0))}</text>
        <text x={W - P} y={H - 12} className="ga-eje" textAnchor="end">{dmy(isoDeMs(t1))}</text>
      </svg>
      <div className="ga-leyenda chico">
        <span><i className="ga-ley-real" /> Avance real</span>
        {plan.length > 0 && <span><i className="ga-ley-plan" /> Según el plan</span>}
      </div>
    </>
  );
}

/** % de una etapa a una fecha, según el historial de avances. */
export function avanceRubroAl(historial, rubroId, fecha) {
  let v = null;
  for (const h of historial || []) if (h.rubro_id === rubroId && h.fecha <= fecha) v = Number(h.porcentaje);
  return v;
}

/** Comparación del avance real con el plan a una fecha. */
export function desvioPlan(rubros, real, fecha) {
  const esperado = avancePlanificado(rubros, fecha);
  if (esperado == null || real == null) return null;
  const dif = Math.round((real - esperado) * 10) / 10;
  return { esperado, dif, estado: dif >= -2 ? (dif > 2 ? 'adelantada' : 'en-termino') : 'atrasada' };
}

/** Cronograma (Gantt): barra prevista de cada etapa, rellena según su avance real, con la línea de hoy. */
export function Cronograma({ rubros, hoy }) {
  const rango = rangoPlan(rubros);
  if (!rango) return <p className="texto-suave chico">El cronograma aparece cuando la empresa cargue las fechas previstas de cada etapa.</p>;
  const t0 = msDeIso(rango.inicio), t1 = msDeIso(rango.fin) + DIA;
  const pos = (ms) => Math.max(0, Math.min(100, ((ms - t0) / (t1 - t0)) * 100));
  const meses = [];
  for (let d = new Date(Date.UTC(new Date(t0).getUTCFullYear(), new Date(t0).getUTCMonth(), 1)); d.getTime() < t1; d.setUTCMonth(d.getUTCMonth() + 1)) {
    if (d.getTime() >= t0) meses.push({ ms: d.getTime(), txt: `${MESES[d.getUTCMonth()].slice(0, 3)} ${String(d.getUTCFullYear()).slice(2)}` });
  }
  const hoyMs = msDeIso(hoy);
  return (
    <div className="gantt">
      <div className="gantt-fila gantt-cab">
        <span />
        <div className="gantt-pista">{meses.map((m, i) => (
          <span key={m.ms} className={`gantt-mes ${i % Math.ceil(meses.length / 4) ? 'gantt-mes-sec' : ''}`} style={{ left: `${pos(m.ms)}%` }}>{m.txt}</span>
        ))}</div>
      </div>
      {rubros.map((r) => {
        if (!r.inicio_plan) return (
          <div key={r.id} className="gantt-fila"><span className="gantt-nombre">{r.nombre}</span><div className="gantt-pista"><span className="chico texto-suave gantt-sin">Sin fechas previstas</span></div></div>
        );
        const ini = msDeIso(r.inicio_plan), fin = msDeIso(r.fin_plan) + DIA;
        const av = Number(r.avance || 0);
        const esperado = hoyMs < ini ? 0 : hoyMs >= fin ? 100 : ((hoyMs - ini) / (fin - ini)) * 100;
        const tono = av >= 100 ? 'ok' : av + 10 < esperado ? 'atraso' : '';
        const titulo = `${r.nombre}: previsto del ${dmy(r.inicio_plan)} al ${dmy(r.fin_plan)} · avance ${pct(av)}`;
        return (
          <div key={r.id} className="gantt-fila" title={titulo}>
            <span className="gantt-nombre">{r.nombre}</span>
            <div className="gantt-pista">
              <div className={`gantt-barra ${tono}`} style={{ left: `${pos(ini)}%`, width: `${Math.max(1.5, pos(fin) - pos(ini))}%` }} aria-label={titulo}>
                <div className="gantt-relleno" style={{ width: `${Math.min(100, av)}%` }} />
                {av > 0 && pos(fin) - pos(ini) >= 9 && <span className="gantt-pct">{pct(av)}</span>}
              </div>
            </div>
          </div>
        );
      })}
      {hoyMs >= t0 && hoyMs <= t1 && (
        <div className="gantt-fila gantt-hoy-fila" aria-hidden="true"><span /><div className="gantt-pista"><i className="gantt-hoy" style={{ left: `${pos(hoyMs)}%` }} /></div></div>
      )}
      <div className="cal-leyenda chico">
        <span><i className="gantt-ley gantt-ley-plan" /> Plazo previsto</span>
        <span><i className="gantt-ley gantt-ley-real" /> Avance real</span>
        <span><i className="gantt-ley gantt-ley-atraso" /> Con atraso</span>
        <span><i className="gantt-ley gantt-ley-hoy" /> Hoy</span>
      </div>
    </div>
  );
}

/** Documentos que la empresa comparte con el cliente. */
export function ListaDocumentos({ documentos, acciones, vacia = 'Todavía no hay documentos compartidos.' }) {
  const toast = useToast();
  if (!documentos.length) return <p className="texto-suave">{vacia}</p>;
  return (
    <ul className="documentos">
      {documentos.map((d) => (
        <li key={d.id}>
          <button type="button" className="doc-abrir" onClick={() => abrirArchivo(d.ruta).catch((e) => toast(e.message, 'error'))}>
            <span className="doc-icono" aria-hidden="true">{ICONO_DOC[d.categoria]}</span>
            <span className="doc-txt"><strong>{d.titulo}</strong>
              <span className="chico texto-suave">{CATEGORIA_DOC[d.categoria]} · {dmy(d.fecha || d.creado_en)}{d.tamano ? ` · ${tamanoLegible(d.tamano)}` : ''}</span></span>
            <span className="doc-ver chico">Abrir</span>
          </button>
          {acciones && acciones(d)}
        </li>
      ))}
    </ul>
  );
}
const tamanoLegible = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

function Anillo({ valor }) {
  const r = 52, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, valor || 0));
  return (
    <svg viewBox="0 0 130 130" className="anillo" aria-hidden="true">
      <circle cx="65" cy="65" r={r} className="anillo-fondo" />
      <circle cx="65" cy="65" r={r} className="anillo-valor" strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 65 65)" />
    </svg>
  );
}

export default function PortalObra({ p, vistaPrevia }) {
  const o = p.obra;
  const hoy = p.hoy || hoyISO();
  const [mes, setMes] = useState(hoy.slice(0, 7));
  const { lluvia, estado } = useLluvia(o, o.fecha_inicio, hoy);
  const res = useMemo(() => resumenDias(p.dias, lluvia, o.fecha_inicio, hoy), [p.dias, lluvia, o.fecha_inicio, hoy]);
  const transcurridos = Math.max(0, diasEntre(o.fecha_inicio, hoy));
  const totalPlazo = o.fecha_fin_prevista ? diasEntre(o.fecha_inicio, o.fecha_fin_prevista) : null;
  const restan = o.fecha_fin_prevista ? diasEntre(hoy, o.fecha_fin_prevista) : null;
  const general = p.avance_general == null ? null : Number(p.avance_general);
  const desvio = desvioPlan(p.rubros, general, hoy);
  const fotosNov = (id) => p.fotos.filter((f) => f.novedad_id === id);
  const [informe, setInforme] = useState(false);
  const documentos = p.documentos || [];
  return (
    <div className="portal">
      {vistaPrevia && <div className="aviso aviso-info portal-previa">Así ve esta obra el cliente. No muestra importes ni datos internos.</div>}
      <section className="panel portal-cab">
        <div>
          <div className="fila-entre envolver portal-cab-titulo">
            <h1 className="portal-titulo">{o.nombre}</h1>
            <button type="button" className="btn btn-sec btn-chico" onClick={() => setInforme(true)}>📄 Informe mensual</button>
          </div>
          {o.ubicacion && <div className="texto-suave">{o.ubicacion}</div>}
          <div className="fila-inline chico" style={{ marginTop: 8 }}>
            <Chip tipo={o.estado === 'en_curso' ? 'ok' : 'neutro'}>{ESTADO_OBRA[o.estado]}</Chip>
            <span>Inicio <strong>{dmy(o.fecha_inicio)}</strong></span>
            {o.fecha_fin_prevista && <span>Entrega prevista <strong>{dmy(o.fecha_fin_prevista)}</strong></span>}
          </div>
        </div>
        <div className="portal-plazo">
          <div><span className="kpi-mini">{transcurridos}</span><span className="chico texto-suave">días de obra</span></div>
          {restan != null && <div><span className="kpi-mini">{Math.max(0, restan)}</span><span className="chico texto-suave">{restan >= 0 ? 'días para la entrega' : 'días de demora'}</span></div>}
          {totalPlazo > 0 && <Barra valor={Math.min(100, (transcurridos / totalPlazo) * 100)} />}
        </div>
      </section>

      <div className="portal-grilla">
        <section className="panel portal-avance">
          <h2>¿Cuánto avanzó la obra?</h2>
          <div className="anillo-caja">
            <Anillo valor={general} />
            <div className="anillo-txt">{general == null ? '—' : pct(general)}</div>
          </div>
          {general == null && <p className="chico texto-suave">El avance general aparece cuando la empresa termine de definir el peso de cada etapa.</p>}
          {desvio && (
            <div className={`portal-desvio desvio-${desvio.estado}`}>
              Según el plan debería estar en <strong>{pct(desvio.esperado)}</strong>.{' '}
              {desvio.estado === 'en-termino' ? 'La obra va en término.'
                : desvio.estado === 'adelantada' ? <>Va <strong>{String(desvio.dif).replace('.', ',')} puntos adelantada</strong>.</>
                  : <>Va <strong>{String(-desvio.dif).replace('.', ',')} puntos atrasada</strong>{res.perdidosLluvia ? ` (se perdieron ${res.perdidosLluvia} días por lluvia)` : ''}.</>}
            </div>
          )}
          <h3 className="chico">Evolución</h3>
          <GraficoAvance serie={p.serie} rubros={p.rubros} inicio={o.fecha_inicio} hoy={hoy} />
        </section>

        <section className="panel">
          <h2>Avance por etapa</h2>
          <ul className="portal-rubros">
            {p.rubros.map((r) => (
              <li key={r.id}>
                <div className="fila-entre"><span>{r.nombre}</span><strong>{r.avance == null ? 'Sin iniciar' : pct(r.avance)}</strong></div>
                <Barra valor={r.avance || 0} tono={r.avance >= 100 ? 'ok' : undefined} />
                {r.fecha && <span className="chico texto-suave">Actualizado el {dmy(r.fecha)}</span>}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {rangoPlan(p.rubros) && (
        <section className="panel">
          <h2>Cronograma</h2>
          <p className="chico texto-suave">Cuándo está previsto hacer cada etapa y cuánto se avanzó en cada una.</p>
          <Cronograma rubros={p.rubros} hoy={hoy} />
        </section>
      )}

      <section className="panel">
        <h2>Clima y días de trabajo</h2>
        <p className="chico texto-suave">Los días de lluvia o con el terreno anegado no se puede trabajar en obra y eso corre los plazos. Acá ves qué días se trabajó y cuánto llovió en la zona.</p>
        <div className="portal-dias-resumen">
          <div><strong>{res.trabajados}</strong><span>días trabajados</span></div>
          <div><strong>{res.parciales}</strong><span>a medias</span></div>
          <div><strong>{res.perdidos}</strong><span>sin trabajar{res.perdidosLluvia ? ` (${res.perdidosLluvia} por lluvia)` : ''}</span></div>
          {estado === 'ok' && <div><strong>{res.diasLluvia}</strong><span>días de lluvia · {res.mmTotal} mm</span></div>}
        </div>
        <Calendario dias={p.dias} lluvia={lluvia} mes={mes} onMes={setMes} desde={o.fecha_inicio} />
        <p className="chico texto-suave">
          {estado === 'sin-ubicacion' && 'La lluvia de la zona aparece cuando la empresa cargue la ubicación de la obra. '}
          {estado === 'error' && 'No se pudo consultar la lluvia de la zona en este momento. '}
          {estado === 'ok' && 'Lluvia estimada para la zona de la obra (NASA POWER); los últimos 2 o 3 días todavía no tienen dato. '}
          El ícono del clima y el color de cada día los carga la empresa en el parte diario.
        </p>
      </section>

      <section className="panel">
        <h2>Novedades</h2>
        {!p.novedades.length && <p className="texto-suave">Todavía no hay novedades publicadas.</p>}
        <ol className="novedades">
          {p.novedades.map((n) => (
            <li key={n.id}>
              <div className="chico texto-suave">{dmy(n.fecha)}</div>
              <h3>{n.titulo}</h3>
              {n.texto && <p>{n.texto}</p>}
              {fotosNov(n.id).length > 0 && <GaleriaFotos fotos={fotosNov(n.id)} mostrarOrigen={false} />}
            </li>
          ))}
        </ol>
      </section>

      <section className="panel">
        <h2>Fotos de la obra</h2>
        <GaleriaFotos fotos={p.fotos} mostrarOrigen={false} vacia="Todavía no hay fotos publicadas." />
      </section>

      <section className="panel">
        <h2>Documentos</h2>
        <p className="chico texto-suave">Planos, contrato, permisos y otros papeles de tu obra.</p>
        <ListaDocumentos documentos={documentos} />
      </section>
      {informe && <InformeMensual p={p} lluvia={lluvia} onClose={() => setInforme(false)} />}
    </div>
  );
}
