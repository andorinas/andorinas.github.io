import { useEffect, useState } from 'react';
import { listarReclamos, gremiosDeObra } from '../datos.js';
import { useObra } from '../ctx.js';
import { Aviso, Segmentado } from '../components/ui.jsx';
import { ListaReclamos, NuevoReclamo, ReclamoDetalle } from '../components/Gremios.jsx';

export default function Reclamos() {
  const { obra, version, refrescar } = useObra();
  const [lista, setLista] = useState(null);
  const [gremios, setGremios] = useState([]);
  const [filtro, setFiltro] = useState('abiertos');
  const [nuevo, setNuevo] = useState(false);
  const [abierto, setAbierto] = useState(null);
  const [error, setError] = useState(null);
  const cargar = () => listarReclamos(obra.id).then(setLista).catch((e) => setError(e.message));
  useEffect(() => { cargar(); gremiosDeObra(obra.id).then(setGremios).catch(() => {}); }, [obra.id, version]);
  const visibles = (lista || []).filter((r) => filtro === 'todos' || (filtro === 'abiertos' ? r.estado !== 'resuelto' : r.estado === 'resuelto'));
  return (
    <section className="panel">
      <div className="fila-entre envolver">
        <h2>Reclamos</h2>
        <button className="btn btn-primario" onClick={() => setNuevo(true)}>＋ Reclamo a un gremio</button>
      </div>
      <p className="texto-suave chico">Reclamos de los gremios a la empresa y de la empresa a los gremios, con su conversación y fotos.</p>
      <Segmentado chico value={filtro} onChange={setFiltro} nombre="Filtrar reclamos" opciones={[['abiertos', 'Sin resolver'], ['resueltos', 'Resueltos'], ['todos', 'Todos']]} />
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div style={{ marginTop: 12 }}>{lista === null ? <div className="esqueleto" /> : <ListaReclamos reclamos={visibles} onAbrir={setAbierto} />}</div>
      {nuevo && <NuevoReclamo obra={obra} rubros={obra.rubros.filter((r) => r.activo)} gremios={gremios} onClose={() => setNuevo(false)} onListo={() => { setNuevo(false); refrescar(); }} />}
      {abierto && <ReclamoDetalle obra={obra} id={abierto} onClose={() => setAbierto(null)} onCambio={() => { cargar(); refrescar(); }} />}
    </section>
  );
}
