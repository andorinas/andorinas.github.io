import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listarCotizaciones, cargarCotizacion } from '../datos.js';
import { dmy, dmyHora, tc, hoyISO, parseDecimal } from '../lib.js';
import { useAuth, useToast } from '../ctx.js';
import { Campo, FechaInput, Aviso, Chip, useCargando } from '../components/ui.jsx';

export default function Cotizaciones() {
  const { user } = useAuth();
  const toast = useToast();
  const [lista, setLista] = useState(null);
  const [f, setF] = useState({ fecha: hoyISO(), venta: '', motivo: '', reaplicar: true });
  const [error, setError] = useState(null);
  const [cargando, run] = useCargando();
  const cargar = () => listarCotizaciones().then(setLista).catch((e) => setError(e.message));
  useEffect(() => { cargar(); }, []);

  const vigentes = (lista || []).filter((c) => c.vigente);
  const existente = vigentes.find((c) => c.fecha === f.fecha);
  const venta = parseDecimal(f.venta);
  const guardar = (e) => {
    e.preventDefault();
    if (!(venta > 0)) return setError('Ingresá la cotización venta en ARS por USD (ej.: 1.580,00)');
    run(async () => {
      try {
        setError(null);
        const r = await cargarCotizacion(f.fecha, venta, f.motivo, f.reaplicar);
        toast(r.sin_cambios ? 'Esa cotización ya estaba cargada' : `Cotización del ${dmy(f.fecha)} guardada${r.completadas ? ` · ${r.completadas} movimiento(s) completado(s)` : ''}${r.reaplicadas ? ` · ${r.reaplicadas} actualizado(s)` : ''}`);
        setF({ ...f, venta: '', motivo: '' });
        cargar();
      } catch (err) { setError(err.message); }
    });
  };

  return (
    <main className="contenedor">
      <Link to="/" className="volver">← Obras</Link>
      <h1>Dólar BNA (billete, venta)</h1>
      <p className="texto-suave">Cotización del Banco Nación, <strong>dólar estadounidense billete, venta</strong>, en ARS por 1 USD. Se carga a mano tomándola de bna.com.ar → Personas → Cotizaciones → Billetes.</p>
      <Aviso tipo="info">
        Cada gasto, pago y presupuesto toma la cotización de su fecha o, si ese día no hubo publicación (fin de semana o feriado), la última anterior.
        Mientras no haya una cotización cargada para esa fecha o una posterior, el movimiento queda en <strong>“Cotización pendiente”</strong> y se completa solo al cargarla.
      </Aviso>
      <div className="config-grid">
        <section className="panel">
          <h2>Historial</h2>
          {lista === null && <div className="esqueleto chico" />}
          {lista?.length === 0 && <p className="texto-suave">Todavía no hay cotizaciones cargadas.</p>}
          <div className="tabla-scroll">
            <table className="tabla">
              <thead><tr><th>Fecha</th><th>Venta (ARS por USD)</th><th>Estado</th><th>Cargada</th></tr></thead>
              <tbody>
                {(lista || []).slice(0, 120).map((c) => (
                  <tr key={c.id} className={c.vigente ? '' : 'anulado'}>
                    <th scope="row">{dmy(c.fecha)}</th>
                    <td>{tc(c.venta).replace(' por USD', '')}</td>
                    <td>{c.vigente ? <Chip tipo="ok">Vigente</Chip> : <Chip tipo="neutro">Reemplazada</Chip>}{c.motivo ? <div className="chico texto-suave">{c.motivo}</div> : null}</td>
                    <td className="chico texto-suave">{dmyHora(c.cargado_en)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        {user.rol === 'admin' && (
          <section className="panel">
            <h2>Cargar cotización</h2>
            {error && <Aviso tipo="error">{error}</Aviso>}
            <form className="form" onSubmit={guardar}>
              <Campo label="Fecha de publicación" req><FechaInput value={f.fecha} onChange={(v) => setF({ ...f, fecha: v })} /></Campo>
              <Campo label="Venta (ARS por 1 USD)" req hint="Valor de la columna Venta, dólar billete">
                <div className="importe-input"><span className="importe-moneda">ARS</span><input inputMode="decimal" placeholder="1.580,00" value={f.venta} onChange={(e) => setF({ ...f, venta: e.target.value })} /></div>
              </Campo>
              {existente && (
                <>
                  <Aviso tipo="alerta">Ya hay una cotización para el {dmy(f.fecha)}: {tc(existente.venta)}. Si la cambiás, la anterior queda en el historial.</Aviso>
                  <Campo label="Motivo de la corrección" req><input value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} /></Campo>
                  <label className="check"><input type="checkbox" checked={f.reaplicar} onChange={(e) => setF({ ...f, reaplicar: e.target.checked })} /> Actualizar los movimientos que usaron el valor anterior (error de tipeo)</label>
                </>
              )}
              <button className="btn btn-primario" disabled={cargando}>Guardar cotización</button>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}
