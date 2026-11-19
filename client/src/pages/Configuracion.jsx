import { useEffect, useState } from 'react';
import { api, money, dmy, dmyHora, tc, hoyISO, ESTADO_OBRA } from '../lib.js';
import { useObra, useToast } from '../ctx.js';
import { Campo, FechaInput, ImporteInput, Segmentado, Aviso, Chip, useCargando } from '../components/ui.jsx';

function PresupuestoRubro({ rubro, onCambio }) {
  const toast = useToast();
  const actual = rubro.presupuestoActual;
  const [abierto, setAbierto] = useState(false);
  const [hist, setHist] = useState(null);
  const [f, setF] = useState({ moneda: actual?.moneda || 'ARS', importe: null, fecha_ref: hoyISO(), vigente_desde: hoyISO(), motivo: '' });
  const [error, setError] = useState(null);
  const [cargando, run] = useCargando();
  const verHist = async () => setHist(hist ? null : await api(`/api/rubros/${rubro.id}/presupuestos`));
  const guardar = (e) => {
    e.preventDefault();
    if (f.importe == null) return setError('Ingresá el importe (puede ser 0)');
    run(async () => {
      try {
        const r = await api(`/api/rubros/${rubro.id}/presupuestos`, { method: 'POST', body: f });
        toast(`Presupuesto de ${rubro.nombre} ${actual ? `actualizado (versión ${r.version})` : 'cargado'}${r.cotizacion.cot_estado === 'pendiente' ? ' · cotización pendiente' : ''}`);
        setAbierto(false); setHist(null); setError(null); onCambio();
      } catch (err) { setError(err.message); }
    });
  };
  return (
    <li className="pres-rubro">
      <div className="fila-entre envolver">
        <div>
          <strong>{rubro.nombre}</strong>
          <div className="chico">
            {actual ? <>{money(actual.importe, actual.moneda)} <span className="texto-suave">· ref. {dmy(actual.fecha_ref)} · v{actual.version} · rige desde {dmy(actual.vigente_desde)}</span>
              {actual.cot_estado === 'pendiente' ? <Chip tipo="alerta">Cotización pendiente</Chip> : <span className="texto-suave"> · {tc(actual.cot_valor)}</span>}</>
              : <Chip tipo="neutro">Sin presupuestar</Chip>}
          </div>
        </div>
        <div className="fila-inline">
          {actual && <button className="link chico" onClick={verHist}>{hist ? 'Ocultar' : 'Historial'}</button>}
          <button className="btn btn-sec btn-chico" onClick={() => setAbierto(!abierto)}>{actual ? 'Modificar' : 'Presupuestar'}</button>
        </div>
      </div>
      {abierto && (
        <form className="form grupo resaltado" onSubmit={guardar}>
          {error && <Aviso tipo="error">{error}</Aviso>}
          <div className="fila-campos">
            <Campo label="Moneda"><Segmentado value={f.moneda} onChange={(v) => setF({ ...f, moneda: v })} nombre="Moneda" opciones={[['ARS', 'ARS'], ['USD', 'USD']]} /></Campo>
            <Campo label="Importe" req hint="0 = presupuesto cero (distinto de sin presupuestar)"><ImporteInput value={f.importe} onChange={(v) => setF({ ...f, importe: v })} moneda={f.moneda} /></Campo>
          </div>
          <div className="fila-campos">
            <Campo label="Fecha de referencia" req hint="Define la cotización BNA de conversión"><FechaInput value={f.fecha_ref} onChange={(v) => setF({ ...f, fecha_ref: v })} /></Campo>
            <Campo label="Vigente desde" req hint="Para consultas a fecha de corte"><FechaInput value={f.vigente_desde} onChange={(v) => setF({ ...f, vigente_desde: v })} /></Campo>
          </div>
          {actual && <Campo label="Motivo de la modificación" req><input value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} required /></Campo>}
          <div className="pie-form"><button type="button" className="btn btn-fantasma" onClick={() => setAbierto(false)}>Cancelar</button>
            <button className="btn btn-primario" disabled={cargando}>Guardar</button></div>
        </form>
      )}
      {hist && (
        <ol className="historial-versiones">
          {hist.map((h) => (
            <li key={h.id}><strong>v{h.version}</strong> · {money(h.importe, h.moneda)} · ref. {dmy(h.fecha_ref)} · rige desde {dmy(h.vigente_desde)}
              <div className="chico texto-suave">{h.usuario} · {dmyHora(h.creado_en)}{h.motivo ? ` · Motivo: ${h.motivo}` : ''}</div></li>
          ))}
        </ol>
      )}
    </li>
  );
}

export default function Configuracion() {
  const { obra, recargarObra, refrescar } = useObra();
  const toast = useToast();
  const [f, setF] = useState({ nombre: obra.nombre, ubicacion: obra.ubicacion || '', fecha_inicio: obra.fecha_inicio, estado: obra.estado });
  const [usuarios, setUsuarios] = useState([]);
  const [enc, setEnc] = useState(obra.encargados.map((e) => e.id));
  const [nuevoRubro, setNuevoRubro] = useState('');
  const [tipos, setTipos] = useState([]);
  const [nuevoTipo, setNuevoTipo] = useState('');
  const [error, setError] = useState(null);
  const [cargando, run] = useCargando();
  useEffect(() => {
    api('/api/usuarios').then((u) => setUsuarios(u.filter((x) => x.rol === 'encargado')));
    api('/api/catalogo').then((c) => setTipos(c.tipos));
  }, []);

  const guardarObra = (e) => {
    e.preventDefault();
    run(async () => {
      try { await api(`/api/obras/${obra.id}`, { method: 'PATCH', body: { ...f, encargados: enc } }); toast('Datos de la obra guardados'); setError(null); refrescar(); }
      catch (err) { setError(err.message); }
    });
  };
  const agregarRubro = () => run(async () => {
    if (!nuevoRubro.trim()) return;
    try { await api(`/api/obras/${obra.id}/rubros`, { method: 'POST', body: { nombre: nuevoRubro } }); setNuevoRubro(''); toast('Rubro agregado'); refrescar(); }
    catch (err) { toast(err.message, 'error'); }
  });
  const toggleRubro = async (r) => {
    await api(`/api/rubros/${r.id}`, { method: 'PATCH', body: { activo: !r.activo } }); refrescar();
  };
  const renombrar = async (r) => {
    const n = window.prompt('Nuevo nombre del rubro', r.nombre);
    if (n && n.trim() && n !== r.nombre) { try { await api(`/api/rubros/${r.id}`, { method: 'PATCH', body: { nombre: n } }); refrescar(); } catch (e) { toast(e.message, 'error'); } }
  };
  const agregarTipo = async () => {
    if (!nuevoTipo.trim()) return;
    await api('/api/tipos', { method: 'POST', body: { nombre: nuevoTipo } });
    setNuevoTipo(''); setTipos((await api('/api/catalogo')).tipos); toast('Tipo de gasto agregado');
  };
  const activos = obra.rubros.filter((r) => r.activo);

  return (
    <div className="config-grid">
      <section className="panel">
        <h2>Presupuesto por rubro</h2>
        <p className="texto-suave chico">Cada modificación crea una versión nueva y conserva la anterior con fecha, usuario y motivo.</p>
        <ul className="lista-pres">{activos.map((r) => <PresupuestoRubro key={r.id} rubro={r} onCambio={() => { recargarObra(); refrescar(); }} />)}</ul>
      </section>

      <section className="panel">
        <h2>Datos de la obra</h2>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <form className="form" onSubmit={guardarObra}>
          <Campo label="Nombre" req><input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} required /></Campo>
          <Campo label="Ubicación"><input value={f.ubicacion} onChange={(e) => setF({ ...f, ubicacion: e.target.value })} /></Campo>
          <div className="fila-campos">
            <Campo label="Fecha de inicio"><FechaInput value={f.fecha_inicio} onChange={(v) => setF({ ...f, fecha_inicio: v })} /></Campo>
            <Campo label="Estado"><select value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value })}>{Object.entries(ESTADO_OBRA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
          </div>
          <fieldset className="grupo"><legend>Encargados asignados</legend>
            {usuarios.length === 0 && <p className="texto-suave chico">No hay encargados. Crealos en Usuarios.</p>}
            {usuarios.map((u) => <label key={u.id} className="check"><input type="checkbox" checked={enc.includes(u.id)} onChange={() => setEnc((a) => (a.includes(u.id) ? a.filter((x) => x !== u.id) : [...a, u.id]))} /> {u.nombre} <span className="texto-suave">{u.activo ? '' : '(inactivo)'}</span></label>)}
          </fieldset>
          <button className="btn btn-primario" disabled={cargando}>Guardar datos</button>
        </form>
      </section>

      <section className="panel">
        <h2>Rubros</h2>
        <ul className="lista-simple">
          {obra.rubros.map((r) => (
            <li key={r.id} className={r.activo ? '' : 'apagado'}>
              <span>{r.nombre}</span>
              <span className="fila-inline"><button className="link chico" onClick={() => renombrar(r)}>Renombrar</button>
                <button className="link chico" onClick={() => toggleRubro(r)}>{r.activo ? 'Desactivar' : 'Reactivar'}</button></span>
            </li>
          ))}
        </ul>
        <div className="fila-inline"><input placeholder="Nuevo rubro" value={nuevoRubro} onChange={(e) => setNuevoRubro(e.target.value)} /><button className="btn btn-sec" onClick={agregarRubro}>Agregar</button></div>
        <p className="texto-suave chico">Los pesos del avance general se definen en la pestaña Avance.</p>
      </section>

      <section className="panel">
        <h2>Tipos de gasto (empresa)</h2>
        <ul className="lista-simple">{tipos.map((t) => <li key={t.id}><span>{t.nombre}</span>{t.sistema ? <span className="chico texto-suave">predefinido</span> : null}</li>)}</ul>
        <div className="fila-inline"><input placeholder="Nuevo tipo" value={nuevoTipo} onChange={(e) => setNuevoTipo(e.target.value)} /><button className="btn btn-sec" onClick={agregarTipo}>Agregar</button></div>
      </section>
    </div>
  );
}
