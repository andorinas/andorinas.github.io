import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, hoyISO, ESTADO_OBRA } from '../lib.js';
import { Campo, FechaInput, Aviso, useCargando } from '../components/ui.jsx';
import { useToast } from '../ctx.js';

export default function NuevaObra() {
  const nav = useNavigate();
  const toast = useToast();
  const [f, setF] = useState({ nombre: '', ubicacion: '', fecha_inicio: hoyISO(), estado: 'en_curso' });
  const [rubros, setRubros] = useState([]); // [{nombre, sel}]
  const [nuevo, setNuevo] = useState('');
  const [usuarios, setUsuarios] = useState([]);
  const [enc, setEnc] = useState([]);
  const [error, setError] = useState(null);
  const [cargando, run] = useCargando();

  useEffect(() => {
    api('/api/catalogo').then((c) => setRubros(c.rubros.map((n, i) => ({ nombre: n, sel: i < 8 }))));
    api('/api/usuarios').then((u) => setUsuarios(u.filter((x) => x.rol === 'encargado' && x.activo)));
  }, []);

  const mover = (i, d) => setRubros((rs) => { const a = [...rs]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; });
  const agregar = () => {
    const n = nuevo.trim(); if (!n) return;
    if (rubros.some((r) => r.nombre.toLowerCase() === n.toLowerCase())) { setRubros((rs) => rs.map((r) => (r.nombre.toLowerCase() === n.toLowerCase() ? { ...r, sel: true } : r))); }
    else setRubros((rs) => [...rs, { nombre: n, sel: true }]);
    setNuevo('');
  };
  const enviar = (e) => {
    e.preventDefault();
    run(async () => {
      try {
        const { id } = await api('/api/obras', { method: 'POST', body: { ...f, rubros: rubros.filter((r) => r.sel).map((r) => r.nombre), encargados: enc } });
        toast('Obra creada. Ahora podés cargar presupuestos y pesos.');
        nav(`/obras/${id}/configuracion`);
      } catch (err) { setError(err.message); }
    });
  };

  return (
    <main className="contenedor angosto">
      <Link to="/" className="volver">← Obras</Link>
      <h1>Nueva obra</h1>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <form onSubmit={enviar} className="form">
        <Campo label="Nombre de la obra" req><input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} required maxLength={120} autoFocus /></Campo>
        <Campo label="Ubicación" hint="Opcional"><input value={f.ubicacion} onChange={(e) => setF({ ...f, ubicacion: e.target.value })} /></Campo>
        <div className="fila-campos">
          <Campo label="Fecha de inicio" req><FechaInput value={f.fecha_inicio} onChange={(v) => setF({ ...f, fecha_inicio: v })} required /></Campo>
          <Campo label="Estado"><select value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value })}>
            {Object.entries(ESTADO_OBRA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
        </div>

        <fieldset className="grupo">
          <legend>Rubros de la obra</legend>
          <p className="texto-suave chico">Lista editable: destildá los que no apliquen, reordená o agregá rubros propios.</p>
          <ul className="lista-rubros-edit">
            {rubros.map((r, i) => (
              <li key={r.nombre} className={r.sel ? '' : 'apagado'}>
                <label><input type="checkbox" checked={r.sel} onChange={() => setRubros((rs) => rs.map((x, j) => (j === i ? { ...x, sel: !x.sel } : x)))} /> {r.nombre}</label>
                <span><button type="button" className="btn-icono" onClick={() => mover(i, -1)} aria-label="Subir">↑</button>
                  <button type="button" className="btn-icono" onClick={() => mover(i, 1)} aria-label="Bajar">↓</button></span>
              </li>
            ))}
          </ul>
          <div className="fila-inline">
            <input placeholder="Nuevo rubro (ej.: Yesería)" value={nuevo} onChange={(e) => setNuevo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } }} />
            <button type="button" className="btn btn-sec" onClick={agregar}>Agregar</button>
          </div>
        </fieldset>

        {usuarios.length > 0 && (
          <fieldset className="grupo">
            <legend>Encargados asignados</legend>
            {usuarios.map((u) => (
              <label key={u.id} className="check"><input type="checkbox" checked={enc.includes(u.id)} onChange={() => setEnc((a) => (a.includes(u.id) ? a.filter((x) => x !== u.id) : [...a, u.id]))} /> {u.nombre} <span className="texto-suave">({u.email})</span></label>
            ))}
          </fieldset>
        )}
        <button className="btn btn-primario btn-bloque" disabled={cargando}>{cargando ? 'Creando…' : 'Crear obra'}</button>
      </form>
    </main>
  );
}
