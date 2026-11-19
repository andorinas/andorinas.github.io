import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { money0, pct, dmy } from '../lib.js';
import { useObra } from '../ctx.js';
import { Aviso, Barra, Segmentado } from '../components/ui.jsx';
import { ControlesVista, useInforme, DescripcionVista, AvisoFaltantes, BotonesExportar } from '../components/Vista.jsx';

const v = (t, M) => (t == null ? '—' : money0(t.valor, M) + (t.faltantes?.length ? ' *' : ''));

function Kpi({ titulo, valor, sub, tono, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`kpi ${tono ? `kpi-${tono}` : ''}`} onClick={onClick}>
      <span className="kpi-titulo">{titulo}</span>
      <span className="kpi-valor">{valor}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </Tag>
  );
}

function Grafico({ rubros, M }) {
  const filas = rubros.filter((r) => r.presupuesto || r.comprometido.valor);
  const max = Math.max(1, ...filas.map((r) => Math.max(r.presupuesto?.valor || 0, r.comprometido.valor)));
  if (!filas.length) return <p className="texto-suave">Cargá presupuestos o gastos para ver el gráfico.</p>;
  return (
    <figure className="grafico" aria-label="Presupuesto vigente vs comprometido por rubro">
      <div className="grafico-leyenda"><span><i className="sw sw-pres" />Presupuesto vigente</span><span><i className="sw sw-comp" />Comprometido</span><span><i className="sw sw-exc" />Excedido</span></div>
      {filas.map((r) => {
        const exc = r.exceso > 0 || (r.sinPresupuesto && r.comprometido.valor > 0);
        return (
          <div key={r.id} className="grafico-fila">
            <div className="grafico-nombre">{r.nombre}</div>
            <div className="grafico-barras">
              <div className="gb gb-pres" style={{ width: `${((r.presupuesto?.valor || 0) / max) * 100}%` }} title={`Presupuesto ${v(r.presupuesto, M)}`} />
              <div className={`gb gb-comp ${exc ? 'exc' : ''}`} style={{ width: `${(r.comprometido.valor / max) * 100}%` }} title={`Comprometido ${v(r.comprometido, M)}`} />
            </div>
            <div className="grafico-valores chico">{r.sinPresupuesto ? 'Sin presupuestar' : v(r.presupuesto, M)} / <strong className={exc ? 'error-txt' : ''}>{v(r.comprometido, M)}</strong></div>
          </div>
        );
      })}
    </figure>
  );
}

export default function Tablero() {
  const { obra, vista, abrir } = useObra();
  const nav = useNavigate();
  const { inf, error, q, bloqueado } = useInforme();
  const [vistaTabla, setVistaTabla] = useState('rubro');
  const ir = (filtros) => nav(`movimientos?${new URLSearchParams(filtros)}`);

  return (
    <>
      <ControlesVista />
      {error && <Aviso tipo="error">{error}</Aviso>}
      {bloqueado && null}
      {!inf && !error && !bloqueado && <div className="esqueleto" />}
      {inf && (() => {
        const M = inf.parametros.moneda, T = inf.totales, av = inf.avance;
        const disp = T.disponible.valor;
        return (
          <>
            <div className="fila-entre envolver">
              <DescripcionVista inf={inf} />
              <div className="solo-ancho-flex"><BotonesExportar q={q} /></div>
            </div>
            {!vista.esHoy && <Aviso tipo="info">Estás viendo la obra reconstruida al <strong>{dmy(vista.corte)}</strong>: presupuestos, pagos y avances vigentes a esa fecha.</Aviso>}
            <AvisoFaltantes inf={inf} />

            <section className="kpis" aria-label="Resumen de la obra">
              <div className="kpi kpi-avance">
                <span className="kpi-titulo">¿Cuánto avanzó?</span>
                {av.estado === 'ok' ? (
                  <>
                    <span className="kpi-valor grande">{pct(av.valor)}</span>
                    <Barra valor={av.valor} tono="claro" />
                    {av.sinAvance.length > 0 && <span className="kpi-sub">Sin avance cargado (0 %): {av.sinAvance.join(', ')}</span>}
                  </>
                ) : (
                  <>
                    <span className="kpi-valor">Pendiente de ponderación</span>
                    <span className="kpi-sub">Pesos asignados {pct(av.sumaPesos)} · falta asignar {pct(av.faltaAsignar)}</span>
                  </>
                )}
              </div>
              <Kpi titulo="¿Cuánto comprometimos?" valor={v(T.comprometido, M)} sub={`Presupuesto vigente ${v(T.presupuesto, M)}`} onClick={() => ir({})} />
              <Kpi titulo="¿Cuánto pagamos?" valor={v(T.pagado, M)} onClick={() => ir({})} />
              <Kpi titulo="¿Cuánto debemos?" valor={v(T.pendiente, M)} tono="alerta" onClick={() => ir({ estadoPago: 'adeudado' })} />
              <Kpi titulo={disp < 0 ? 'Exceso sobre presupuesto' : 'Disponible para contratar'} valor={money0(Math.abs(disp), M) + (T.disponible.faltantes.length ? ' *' : '')} tono={disp < 0 ? 'error' : 'ok'}
                sub={T.rubrosSinPresupuesto.length ? `Sin presupuestar: ${T.rubrosSinPresupuesto.join(', ')}` : 'Presupuesto vigente − comprometido'} />
              {T.difCambio != null && T.difCambio !== 0 && (
                <Kpi titulo="Diferencia de cambio" valor={money0(T.difCambio, M)}
                  sub={`${T.difCambio > 0 ? 'Mayor costo' : 'Menor costo'}: comprometido + diferencia = pagado + pendiente`} />
              )}
            </section>

            <section className="panel">
              <h2>¿Qué rubros se pasaron de presupuesto?</h2>
              {inf.desvios.length === 0 ? <p className="ok-txt">Ningún rubro supera su presupuesto vigente.</p> : (
                <ul className="lista-desvios">
                  {inf.desvios.map((d) => (
                    <li key={d.id}><button className="link-fila" onClick={() => ir({ rubroId: d.id })}>
                      <strong>{d.nombre}</strong>
                      <span>{d.sinPresupuesto ? `${money0(d.comprometido, M)} comprometidos sin presupuesto` : `Excede ${money0(d.exceso, M)} (${pct(d.pct)})`}</span>
                    </button></li>
                  ))}
                </ul>
              )}
            </section>

            <div className="tablero-grid">
              <section className="panel">
                <div className="fila-entre envolver">
                  <h2>{vistaTabla === 'rubro' ? 'Por rubro' : 'Por tipo de gasto'}</h2>
                  <Segmentado chico value={vistaTabla} onChange={setVistaTabla} nombre="Agrupar" opciones={[['rubro', 'Por rubro'], ['tipo', 'Por tipo de gasto']]} />
                </div>
                <p className="texto-suave chico">Tocá un importe para ver los movimientos que lo explican. Importes en {M}.</p>
                {vistaTabla === 'rubro' ? (
                  <>
                    <div className="tabla-scroll solo-ancho">
                      <table className="tabla">
                        <thead><tr><th>Rubro</th><th>Presupuesto vigente</th><th>Comprometido</th><th>Pagado</th><th>Pendiente</th><th>Disponible</th><th>Avance físico</th></tr></thead>
                        <tbody>
                          {inf.rubros.map((r) => (
                            <tr key={r.id} className={r.exceso > 0 ? 'fila-exceso' : ''}>
                              <th scope="row">{r.nombre}{r.peso != null && <span className="peso">peso {pct(r.peso)}</span>}</th>
                              <td>{r.sinPresupuesto ? <span className="texto-suave">Sin presupuestar</span> : <span title={r.presupuestoVersion ? `Versión ${r.presupuestoVersion.version}: ${r.presupuestoVersion.moneda} original` : ''}>{v(r.presupuesto, M)}</span>}</td>
                              <td><button className="celda-link" onClick={() => ir({ rubroId: r.id })}>{v(r.comprometido, M)}</button></td>
                              <td><button className="celda-link" onClick={() => ir({ rubroId: r.id })}>{v(r.pagado, M)}</button></td>
                              <td><button className="celda-link" onClick={() => ir({ rubroId: r.id, estadoPago: 'adeudado' })}>{v(r.pendiente, M)}</button></td>
                              <td className={r.disponible && r.disponible.valor < 0 ? 'error-txt' : ''}>{r.disponible ? v(r.disponible, M) : '—'}</td>
                              <td><button className="celda-link" onClick={() => abrir('avance', { rubroId: r.id })}>{r.avance == null ? <span className="texto-suave">Sin avance</span> : pct(r.avance)}</button></td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot><tr><th>Total obra</th><td>{v(T.presupuesto, M)}</td><td>{v(T.comprometido, M)}</td><td>{v(T.pagado, M)}</td><td>{v(T.pendiente, M)}</td>
                          <td className={disp < 0 ? 'error-txt' : ''}>{v(T.disponible, M)}</td><td>{av.estado === 'ok' ? pct(av.valor) : 'Pend. ponderación'}</td></tr></tfoot>
                      </table>
                    </div>
                    <ul className="tarjetas-rubro solo-angosto">
                      {inf.rubros.map((r) => (
                        <li key={r.id} className={`tarjeta-rubro ${r.exceso > 0 ? 'exceso' : ''}`}>
                          <div className="fila-entre"><strong>{r.nombre}</strong><span className="chico">{r.avance == null ? 'Sin avance' : `Avance ${pct(r.avance)}`}</span></div>
                          <Barra valor={r.avance} />
                          <dl>
                            <div><dt>Presupuesto</dt><dd>{r.sinPresupuesto ? 'Sin presupuestar' : v(r.presupuesto, M)}</dd></div>
                            <div><dt>Comprometido</dt><dd><button className="celda-link" onClick={() => ir({ rubroId: r.id })}>{v(r.comprometido, M)}</button></dd></div>
                            <div><dt>Pagado</dt><dd><button className="celda-link" onClick={() => ir({ rubroId: r.id })}>{v(r.pagado, M)}</button></dd></div>
                            <div><dt>Pendiente</dt><dd><button className="celda-link" onClick={() => ir({ rubroId: r.id, estadoPago: 'adeudado' })}>{v(r.pendiente, M)}</button></dd></div>
                            <div><dt>Disponible</dt><dd className={r.disponible?.valor < 0 ? 'error-txt' : ''}>{r.disponible ? v(r.disponible, M) : '—'}</dd></div>
                          </dl>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <div className="tabla-scroll">
                    <table className="tabla">
                      <thead><tr><th>Tipo de gasto</th><th>Comprometido</th><th>Pagado</th><th>Pendiente</th></tr></thead>
                      <tbody>
                        {inf.tipos.map((t) => (
                          <tr key={t.id}><th scope="row">{t.nombre}</th>
                            <td><button className="celda-link" onClick={() => ir({ tipoId: t.id })}>{v(t.comprometido, M)}</button></td>
                            <td><button className="celda-link" onClick={() => ir({ tipoId: t.id })}>{v(t.pagado, M)}</button></td>
                            <td><button className="celda-link" onClick={() => ir({ tipoId: t.id, estadoPago: 'adeudado' })}>{v(t.pendiente, M)}</button></td></tr>
                        ))}
                        {!inf.tipos.length && <tr><td colSpan={4} className="texto-suave">Sin movimientos.</td></tr>}
                      </tbody>
                      <tfoot><tr><th>Total obra</th><td>{v(T.comprometido, M)}</td><td>{v(T.pagado, M)}</td><td>{v(T.pendiente, M)}</td></tr></tfoot>
                    </table>
                  </div>
                )}
              </section>
              <section className="panel">
                <h2>Presupuesto vs comprometido</h2>
                <Grafico rubros={inf.rubros} M={M} />
              </section>
            </div>
            <div className="solo-angosto-flex"><BotonesExportar q={q} /></div>
            {!inf.completo && <p className="texto-suave chico">* Importe incompleto: no incluye montos con cotización pendiente.</p>}
            {obra.rubros.length === 0 && <Aviso>Esta obra no tiene rubros. {''}</Aviso>}
          </>
        );
      })()}
    </>
  );
}
