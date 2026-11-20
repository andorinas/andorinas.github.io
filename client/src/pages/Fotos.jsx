import { useEffect, useState } from 'react';
import { listarFotos, agregarFotos, subirFotos } from '../datos.js';
import { hoyISO } from '../lib.js';
import { useObra, useToast } from '../ctx.js';
import { Campo, FechaInput, Aviso, Sheet, useCargando } from '../components/ui.jsx';
import { FotosInput, GaleriaFotos } from '../components/Gremios.jsx';

function SubirFotos({ obra, onClose, onListo }) {
  const toast = useToast();
  const [f, setF] = useState({ rubro_id: '', descripcion: '', fecha: hoyISO() });
  const [archivos, setArchivos] = useState([]);
  const [error, setError] = useState(null);
  const [cargando, run] = useCargando();
  const enviar = (e) => {
    e.preventDefault();
    if (!archivos.length) return setError('Elegí al menos una foto');
    run(async () => {
      try {
        setError(null);
        const fotos = await subirFotos(obra.id, archivos);
        const n = await agregarFotos(obra.id, { ...f, rubro_id: f.rubro_id || null, fotos });
        toast(`${n} foto(s) agregada(s)`); onListo();
      } catch (err) { setError(err.message); }
    });
  };
  return (
    <Sheet titulo="Agregar fotos de obra" obra={obra.nombre} onClose={onClose}>
      <form className="form" onSubmit={enviar}>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <Campo label="Fotos" req><FotosInput archivos={archivos} onChange={setArchivos} max={12} /></Campo>
        <div className="fila-campos">
          <Campo label="Rubro"><select value={f.rubro_id} onChange={(e) => setF({ ...f, rubro_id: e.target.value })}>
            <option value="">General de la obra</option>
            {obra.rubros.filter((r) => r.activo).map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select></Campo>
          <Campo label="Fecha"><FechaInput value={f.fecha} onChange={(v) => setF({ ...f, fecha: v })} /></Campo>
        </div>
        <Campo label="Descripción" hint="Opcional"><input value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} maxLength={300} placeholder="Ej.: Hormigonado losa PB" /></Campo>
        <div className="pie-form">
          <button type="button" className="btn btn-fantasma" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primario" disabled={cargando}>{cargando ? 'Subiendo…' : 'Agregar fotos'}</button>
        </div>
      </form>
    </Sheet>
  );
}

export default function Fotos() {
  const { obra, version, refrescar } = useObra();
  const [fotos, setFotos] = useState(null);
  const [rubro, setRubro] = useState('');
  const [origen, setOrigen] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => { listarFotos(obra.id).then(setFotos).catch((e) => setError(e.message)); }, [obra.id, version]);
  const visibles = (fotos || []).filter((f) => (!rubro || String(f.rubro_id) === rubro) && (!origen || f.origen === origen));
  return (
    <section className="panel">
      <div className="fila-entre envolver">
        <h2>Fotos de la obra</h2>
        <button className="btn btn-primario" onClick={() => setSubiendo(true)}>📷 Agregar fotos</button>
      </div>
      <p className="texto-suave chico">Incluye las fotos de la empresa, las de los partes de avance de los gremios y las de los reclamos.</p>
      <div className="fila-inline filtros-fotos">
        <select value={rubro} onChange={(e) => setRubro(e.target.value)} aria-label="Filtrar por rubro">
          <option value="">Todos los rubros</option>
          {obra.rubros.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
        </select>
        <select value={origen} onChange={(e) => setOrigen(e.target.value)} aria-label="Filtrar por origen">
          <option value="">Todo origen</option>
          <option>Galería</option><option>Parte de avance</option><option>Reclamo</option>
        </select>
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {fotos === null ? <div className="esqueleto" /> : <GaleriaFotos fotos={visibles} />}
      {subiendo && <SubirFotos obra={obra} onClose={() => setSubiendo(false)} onListo={() => { setSubiendo(false); refrescar(); }} />}
    </section>
  );
}
