import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, money, money0, dmy, CONDICION, ESTADO_PAGO } from '../lib.js';
import { useObra } from '../ctx.js';
import { Aviso, Chip, FechaInput } from '../components/ui.jsx';
import { ControlesVista, useInforme, DescripcionVista, AvisoFaltantes, BotonesExportar } from '../components/Vista.jsx';

const TONO = { pagado: 'ok', parcial: 'info', pendiente: 'alerta', vencido: 'error' };
const FILTROS = ['desde', 'rubroId', 'tipoId', 'proveedorId', 'estadoPago'];

export default function Movimientos() {
  const { obra, abrir } = useObra();
  const [sp, setSp] = useSearchParams();
  const filtros = Object.fromEntries(FILTROS.filter((k) => sp.get(k)).map((k) => [k, sp.get(k)]));
  const { inf, error, q } = useInforme(filtros);
  const [cat, setCat] = useState({ tipos: [] });
  const [abiertos, setAbiertos] = useState(false);
  useEffect(() => { api('/api/catalogo').then(setCat); }, []);
  const setFiltro = (k, val) => { const n = new URLSearchParams(sp); if (val) n.set(k, val); else n.delete(k); setSp(n, { replace: true }); };
  const nFiltros = Object.keys(filtros).length;

  return (
    <>
      <ControlesVista />
      <section className="panel filtros">
        <button className="filtros-toggle" onClick={() => setAbiertos(!abiertos)} aria-expanded={abiertos}>
          Filtros {nFiltros > 0 && <Chip tipo="info">{nFiltros} activo{nFiltros > 1 ? 's' : ''}</Chip>} <span aria-hidden="true">{abiertos ? '▴' : '▾'}</span>
        </button>
        <div className={`filtros-grid ${abiertos ? 'abierto' : ''}`}>
          <label className="campo"><span className="campo-label">Desde</span><FechaInput value={filtros.desde || ''} onChange={(v) => setFiltro('desde', v)} /></label>
          <div className="campo"><span className="campo-label">Hasta</span><div className="texto-suave chico">= fecha de corte (arriba)</div></div>
          <label className="campo"><span className="campo-label">Rubro</span>
            <select value={filtros.rubroId || ''} onChange={(e) => setFiltro('rubroId', e.target.value)}><option value="">Todos</option>
              {obra.rubros.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}</select></label>
          <label className="campo"><span className="campo-label">Tipo de gasto</span>
            <select value={filtros.tipoId || ''} onChange={(e) => setFiltro('tipoId', e.target.value)}><option value="">Todos</option>
              {cat.tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select></label>
          <label className="campo"><span className="campo-label">Proveedor</span>
            <select value={filtros.proveedorId || ''} onChange={(e) => setFiltro('proveedorId', e.target.value)}><option value="">Todos</option>
              {(inf?.proveedoresObra || []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>
          <label className="campo"><span className="campo-label">Estado de pago</span>
            <select value={filtros.estadoPago || ''} onChange={(e) => setFiltro('estadoPago', e.target.value)}><option value="">Todos</option>
              <option value="adeudado">Con saldo (pendiente, parcial o vencido)</option>
              {Object.entries(ESTADO_PAGO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
          {nFiltros > 0 && <button className="btn btn-fantasma" onClick={() => setSp({}, { replace: true })}>Limpiar filtros</button>}
        </div>
      </section>

      {error && <Aviso tipo="error">{error}</Aviso>}
      {inf && (() => {
        const M = inf.parametros.moneda, T = inf.totales;
        return (
          <>
            <div className="fila-entre envolver"><DescripcionVista inf={inf} /><BotonesExportar q={q} /></div>
            <AvisoFaltantes inf={inf} />
            <div className="resumen-filtrado">
              <span>{inf.movimientos.length} movimiento{inf.movimientos.length !== 1 ? 's' : ''}</span>
              <span>Comprometido <strong>{money0(T.comprometido.valor, M)}{T.comprometido.faltantes.length ? ' *' : ''}</strong></span>
              <span>Pagado <strong>{money0(T.pagado.valor, M)}{T.pagado.faltantes.length ? ' *' : ''}</strong></span>
              <span>Pendiente <strong>{money0(T.pendiente.valor, M)}{T.pendiente.faltantes.length ? ' *' : ''}</strong></span>
              {T.difCambio ? <span>Dif. de cambio <strong>{money0(T.difCambio, M)}</strong></span> : null}
            </div>
            {inf.movimientos.length === 0 && <div className="vacio"><p>No hay movimientos con estos filtros.</p><button className="btn btn-primario" onClick={() => abrir('gasto')}>Agregar gasto</button></div>}
            <ul className="lista-movs">
              {[...inf.movimientos].reverse().map((m) => (
                <li key={m.id}>
                  <button className="mov" onClick={() => abrir('detalle', { id: m.id })}>
                    <div className="mov-fecha">{dmy(m.fecha)}</div>
                    <div className="mov-info">
                      <div className="mov-concepto">{m.concepto}</div>
                      <div className="mov-sub">{m.rubro} · {m.tipo}{m.proveedor ? ` · ${m.proveedor}` : ''} · {CONDICION[m.condicion]}{m.vencimiento && m.pendiente > 0 ? ` · vence ${dmy(m.vencimiento)}` : ''}</div>
                      <div className="mov-chips">
                        <Chip tipo={TONO[m.estado]}>{ESTADO_PAGO[m.estado]}</Chip>
                        {m.cot_estado === 'pendiente' && <Chip tipo="alerta">Cotización pendiente</Chip>}
                        {m.pagos.length > 0 && <span className="chico texto-suave">{m.pagos.length} pago{m.pagos.length > 1 ? 's' : ''}</span>}
                        {m.adjunto_id && <span className="chico" title="Tiene comprobante">📎</span>}
                      </div>
                    </div>
                    <div className="mov-montos">
                      <div className="mov-original">{money(m.importe, m.moneda)}</div>
                      {m.moneda !== M && <div className="chico texto-suave">≈ {m.eq.comprometido.valor == null ? 'sin cotización' : money0(m.eq.comprometido.valor, M)}</div>}
                      {m.pendiente > 0 && <div className="chico alerta-txt">Saldo {money(m.pendiente, m.moneda)}</div>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </>
        );
      })()}
    </>
  );
}
