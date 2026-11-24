// Vista del cliente: sólo sus obras. Avance, clima y días de trabajo, novedades, fotos y consultas. Nunca ve importes.
import { useEffect, useState } from 'react';
import { Routes, Route, Link, useParams, Navigate } from 'react-router-dom';
import { misObrasCliente, portalObra, listarReclamos } from '../datos.js';
import { dmy, ESTADO_OBRA } from '../lib.js';
import { useAuth } from '../ctx.js';
import { Marca, Aviso, Chip, Segmentado } from '../components/ui.jsx';
import { NuevoReclamo, ReclamoDetalle, ListaReclamos } from '../components/Gremios.jsx';
import PortalObra from '../components/Portal.jsx';

function Cabecera() {
  const { user, logout } = useAuth();
  return (
    <header className="cabecera">
      <Link to="/" className="cabecera-marca" aria-label="Inicio"><Marca compacta claro alto={30} /><span className="cabecera-app">Mi obra</span></Link>
      <nav className="cabecera-nav">
        <span className="cabecera-user">{user.nombre}</span>
        <a href="ayuda/" target="_blank" rel="noopener" className="link-cab">Ayuda</a>
        <button className="btn btn-fantasma btn-chico" onClick={logout}>Salir</button>
      </nav>
    </header>
  );
}

function MisObras() {
  const [obras, setObras] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { misObrasCliente().then(setObras).catch((e) => setError(e.message)); }, []);
  if (obras?.length === 1) return <Navigate to={`/obra/${obras[0].id}`} replace />;
  return (
    <main className="contenedor">
      <h1>Mis obras</h1>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {obras?.length === 0 && <div className="vacio"><p>Todavía no tenés obras asociadas. Pedile a Andorinas que te asigne tu obra.</p></div>}
      <div className="grilla-obras">
        {obras?.map((o) => (
          <Link key={o.id} to={`/obra/${o.id}`} className="tarjeta-obra">
            <div className="fila-entre"><h2>{o.nombre}</h2><Chip tipo={o.estado === 'en_curso' ? 'ok' : 'neutro'}>{ESTADO_OBRA[o.estado]}</Chip></div>
            <div className="texto-suave chico">{o.ubicacion}{o.ubicacion ? ' · ' : ''}Inicio {dmy(o.fecha_inicio)}</div>
          </Link>
        ))}
      </div>
    </main>
  );
}

function ObraCliente() {
  const { obraId } = useParams();
  const [p, setP] = useState(null);
  const [consultas, setConsultas] = useState([]);
  const [tab, setTab] = useState('obra');
  const [modal, setModal] = useState(null);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);
  const refrescar = () => setVersion((v) => v + 1);
  useEffect(() => { portalObra(obraId).then(setP).catch((e) => setError(e.message)); }, [obraId]);
  useEffect(() => { listarReclamos(obraId).then(setConsultas).catch(() => {}); }, [obraId, version]);
  if (error && !p) return <main className="contenedor"><Aviso tipo="error">{error}</Aviso><Link className="btn" to="/">Mis obras</Link></main>;
  if (!p) return <main className="contenedor"><div className="esqueleto" /></main>;
  const obra = { id: p.obra.id, nombre: p.obra.nombre };
  const abiertas = consultas.filter((r) => r.estado !== 'resuelto').length;
  return (
    <>
      <main className="contenedor">
        <div className="fila-entre envolver" style={{ marginBottom: 12 }}>
          <Segmentado value={tab} onChange={setTab} nombre="Secciones" opciones={[['obra', 'Mi obra'], ['consultas', `Consultas${abiertas ? ` (${abiertas})` : ''}`]]} />
          <button className="btn btn-primario" onClick={() => setModal({ tipo: 'nueva' })}>✉ Hacer una consulta</button>
        </div>
        {tab === 'obra' && <PortalObra p={p} />}
        {tab === 'consultas' && (
          <section className="panel">
            <h2>Consultas</h2>
            <p className="texto-suave chico">Tus consultas a Andorinas y los mensajes que te envían, con su respuesta.</p>
            <ListaReclamos reclamos={consultas} onAbrir={(id) => setModal({ tipo: 'detalle', id })} vacia="Todavía no hay consultas." />
          </section>
        )}
      </main>
      {modal?.tipo === 'nueva' && <NuevoReclamo obra={obra} rubros={[]} gremios={[]} esCliente onClose={() => setModal(null)}
        onListo={() => { setModal(null); setTab('consultas'); refrescar(); }} />}
      {modal?.tipo === 'detalle' && <ReclamoDetalle obra={obra} id={modal.id} onClose={() => setModal(null)} onCambio={refrescar} />}
    </>
  );
}

export default function ClienteApp() {
  return (
    <>
      <Cabecera />
      <Routes>
        <Route path="/" element={<MisObras />} />
        <Route path="/obra/:obraId" element={<ObraCliente />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
