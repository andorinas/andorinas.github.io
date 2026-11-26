// Ayuda dentro de la app: cada usuario ve sólo los videos e instructivo de su perfil (bucket privado 'ayuda').
// El administrador, además, puede subir o reemplazar cada archivo.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { materialAyuda, subirAyuda } from '../datos.js';
import { useAuth, useToast } from '../ctx.js';
import { Aviso, useCargando } from '../components/ui.jsx';

const PERFIL = { empresa: 'Administradores y encargados', gremios: 'Gremios', clientes: 'Clientes' };

function Material({ m }) {
  if (!m.url) return <p className="texto-suave chico">Todavía no está disponible.</p>;
  if (m.tipo === 'pdf') return (
    <div className="fila-inline">
      <a className="btn btn-primario" href={m.url} target="_blank" rel="noopener noreferrer">Abrir el instructivo</a>
      <a className="btn btn-sec" href={m.url} download>⬇ Descargar PDF</a>
    </div>
  );
  return <video className="ayuda-video" controls playsInline preload="metadata" src={`${m.url}#t=4`} />;
}

function Reemplazar({ m, onListo }) {
  const toast = useToast();
  const [cargando, run] = useCargando();
  const subir = (archivo) => run(async () => {
    try { await subirAyuda(m.ruta, archivo); toast(`${m.titulo}: archivo actualizado`); onListo(); }
    catch (e) { toast(e.message, 'error'); }
  });
  return (
    <label className={`btn btn-sec btn-chico ${cargando ? 'deshabilitado' : ''}`}>
      {cargando ? 'Subiendo…' : m.url ? '⟳ Reemplazar archivo' : '⬆ Subir archivo'}
      <input type="file" hidden disabled={cargando} accept={m.tipo === 'pdf' ? 'application/pdf' : 'video/mp4'}
        onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) subir(f); }} />
    </label>
  );
}

export default function Ayuda() {
  const { user } = useAuth();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let vivo = true;
    materialAyuda(user.rol).then((x) => vivo && setItems(x)).catch((e) => vivo && setError(e.message));
    return () => { vivo = false; };
  }, [user.rol, version]);
  const admin = user.rol === 'admin';
  const visibles = (items || []).filter((m) => admin || m.url);
  const grupos = [...new Set(visibles.map((m) => m.perfil))];
  return (
    <main className="contenedor ayuda">
      <Link to="/" className="link chico">← Volver</Link>
      <h1>Ayuda</h1>
      <p className="texto-suave">Videos cortos{user.rol === 'admin' || user.rol === 'encargado' ? ' y el instructivo completo' : ''} para usar la app. Las pantallas son de una obra de ejemplo.</p>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {items === null && !error && <div className="esqueleto" />}
      {items && !visibles.length && <Aviso tipo="info">Todavía no hay material de ayuda cargado. Ante cualquier duda, consultá con Andorinas.</Aviso>}
      {admin && items && <Aviso tipo="info">Como administrador ves el material de todos los perfiles y podés subirlo o reemplazarlo. Cada usuario ve sólo el de su perfil.</Aviso>}
      {grupos.map((g) => (
        <section key={g} className="ayuda-grupo">
          {(admin || user.rol === 'encargado') && <h2 className="ayuda-perfil">{PERFIL[g]}</h2>}
          <div className="ayuda-grilla">
            {visibles.filter((m) => m.perfil === g).map((m) => (
              <article key={m.ruta} className="panel ayuda-item">
                <h3>{m.titulo}</h3>
                <Material m={m} />
                <p className="chico texto-suave">{m.texto}</p>
                {admin && <Reemplazar m={m} onListo={() => setVersion((v) => v + 1)} />}
              </article>
            ))}
          </div>
        </section>
      ))}
      <p className="chico texto-suave">¿Olvidaste tu contraseña? En la pantalla de ingreso tocá “Olvidé mi contraseña”.</p>
    </main>
  );
}
