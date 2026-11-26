// Vista del gremio: sólo sus obras y rubros. Informa avances con fotos, hace reclamos y ve sus fotos. Nunca ve importes.
import { useEffect, useState } from 'react';
import { Routes, Route, Link, useParams, Navigate } from 'react-router-dom';
import { misObrasGremio, listarPartes, listarReclamos, listarFotos } from '../datos.js';
import { dmy, pct } from '../lib.js';
import { useAuth } from '../ctx.js';
import { Marca, Aviso, Chip, Segmentado } from '../components/ui.jsx';
import Ayuda from './Ayuda.jsx';
import { ParteForm, NuevoReclamo, ReclamoDetalle, ListaReclamos, TarjetaParte, GaleriaFotos } from '../components/Gremios.jsx';

function Cabecera() {
  const { user, logout } = useAuth();
  return (
    <header className="cabecera">
      <Link to="/" className="cabecera-marca" aria-label="Inicio"><Marca compacta claro alto={30} /><span className="cabecera-app">Gremios</span></Link>
      <nav className="cabecera-nav">
        <span className="cabecera-user">{user.nombre} · Gremio</span>
        <Link to="/ayuda" className="link-cab">Ayuda</Link>
        <button className="btn btn-fantasma btn-chico" onClick={logout}>Salir</button>
      </nav>
    </header>
  );
}

function MisObras() {
  const [obras, setObras] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { misObrasGremio().then(setObras).catch((e) => setError(e.message)); }, []);
  if (obras?.length === 1) return <Navigate to={`/obra/${obras[0].id}`} replace />;
  return (
    <main className="contenedor">
      <h1>Mis obras</h1>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {obras?.length === 0 && <div className="vacio"><p>Todavía no tenés obras asignadas. Pedile a la empresa que te asigne tus rubros.</p></div>}
      <div className="grilla-obras">
        {obras?.map((o) => (
          <Link key={o.id} to={`/obra/${o.id}`} className="tarjeta-obra">
            <h2>{o.nombre}</h2>
            <div className="texto-suave chico">{o.ubicacion}</div>
            <div className="fila-inline">{o.rubros.map((r) => <Chip key={r.id} tipo="info">{r.nombre}</Chip>)}</div>
          </Link>
        ))}
      </div>
    </main>
  );
}

function ObraGremio() {
  const { obraId } = useParams();
  const [obra, setObra] = useState(null);
  const [partes, setPartes] = useState([]);
  const [reclamos, setReclamos] = useState([]);
  const [fotos, setFotos] = useState([]);
  const [tab, setTab] = useState('partes');
  const [modal, setModal] = useState(null);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);
  const refrescar = () => setVersion((v) => v + 1);
  useEffect(() => {
    misObrasGremio().then((l) => setObra(l.find((o) => String(o.id) === obraId) || false)).catch((e) => setError(e.message));
  }, [obraId]);
  useEffect(() => {
    if (!obra) return;
    Promise.all([listarPartes(obra.id), listarReclamos(obra.id), listarFotos(obra.id)])
      .then(([p, r, f]) => { setPartes(p); setReclamos(r); setFotos(f); }).catch((e) => setError(e.message));
  }, [obra, version]);
  if (obra === false) return <main className="contenedor"><Aviso tipo="error">No tenés acceso a esta obra.</Aviso><Link className="btn" to="/">Mis obras</Link></main>;
  if (!obra) return <main className="contenedor"><div className="esqueleto" /></main>;
  const ultimos = {};
  for (const p of partes) if (!ultimos[p.rubro_id]) ultimos[p.rubro_id] = p;
  const abiertos = reclamos.filter((r) => r.estado !== 'resuelto').length;
  return (
    <>
      <div className="obra-barra"><div className="obra-barra-int">
        <div className="obra-activa">
          <Link to="/" className="obra-cambiar" aria-label="Mis obras">‹</Link>
          <div className="obra-activa-txt"><span className="obra-activa-label">Obra</span><strong className="obra-activa-nombre">{obra.nombre}</strong></div>
        </div>
        <div className="acciones-cab">
          <button className="btn btn-accion" onClick={() => setModal({ tipo: 'parte' })}>▲ Informar avance</button>
          <button className="btn btn-accion" onClick={() => setModal({ tipo: 'reclamo' })}>! Nuevo reclamo</button>
        </div>
      </div></div>
      <main className="contenedor con-barra-acciones">
        {error && <Aviso tipo="error">{error}</Aviso>}
        <div className="fila-inline">Tus rubros: {obra.rubros.map((r) => <Chip key={r.id} tipo="info">{r.nombre}</Chip>)}</div>
        <div style={{ margin: '14px 0' }}>
          <Segmentado value={tab} onChange={setTab} nombre="Secciones" opciones={[['partes', 'Mis avances'], ['reclamos', `Reclamos${abiertos ? ` (${abiertos})` : ''}`], ['fotos', 'Mis fotos']]} />
        </div>
        {tab === 'partes' && (
          <section className="panel">
            {!partes.length && <p className="texto-suave">Todavía no informaste avances. Tocá “Informar avance”.</p>}
            <ul className="lista-partes">{partes.map((p) => <TarjetaParte key={p.id} p={p} />)}</ul>
          </section>
        )}
        {tab === 'reclamos' && <section className="panel"><ListaReclamos reclamos={reclamos} onAbrir={(id) => setModal({ tipo: 'detalle', id })} /></section>}
        {tab === 'fotos' && <section className="panel"><GaleriaFotos fotos={fotos} vacia="Todavía no subiste fotos." /></section>}
      </main>
      <div className="barra-acciones barra-acciones-2" role="toolbar" aria-label="Acciones">
        <button onClick={() => setModal({ tipo: 'parte' })}><span className="ico">▲</span>Avance</button>
        <button onClick={() => setModal({ tipo: 'reclamo' })}><span className="ico">!</span>Reclamo</button>
      </div>
      {modal?.tipo === 'parte' && <ParteForm obra={obra} rubros={obra.rubros} ultimos={ultimos} onClose={() => setModal(null)} onListo={() => { setModal(null); setTab('partes'); refrescar(); }} />}
      {modal?.tipo === 'reclamo' && <NuevoReclamo obra={obra} rubros={obra.rubros} gremios={[]} esGremio onClose={() => setModal(null)} onListo={() => { setModal(null); setTab('reclamos'); refrescar(); }} />}
      {modal?.tipo === 'detalle' && <ReclamoDetalle obra={obra} id={modal.id} onClose={() => setModal(null)} onCambio={refrescar} />}
    </>
  );
}

export default function GremioApp() {
  return (
    <>
      <Cabecera />
      <Routes>
        <Route path="/" element={<MisObras />} />
        <Route path="/ayuda" element={<Ayuda />} />
        <Route path="/obra/:obraId" element={<ObraGremio />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
