import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import '@fontsource/montserrat/400.css';
import '@fontsource/montserrat/500.css';
import '@fontsource/montserrat/600.css';
import '@fontsource/montserrat/700.css';
import '@fontsource/montserrat/800.css';
import './styles.css';
import { AuthCtx, ToastCtx, useAuth, useToast } from './ctx.js';
import { supabase, configurado } from './supabase.js';
import { perfilActual, ingresar, nuevaPassword, salir } from './datos.js';
import { Marca, Sheet, Campo, Aviso, useCargando } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Obras from './pages/Obras.jsx';
import NuevaObra from './pages/NuevaObra.jsx';
import Usuarios from './pages/Usuarios.jsx';
import Cotizaciones from './pages/Cotizaciones.jsx';
import ObraLayout from './pages/ObraLayout.jsx';
import Tablero from './pages/Tablero.jsx';
import Movimientos from './pages/Movimientos.jsx';
import Avance from './pages/Avance.jsx';
import Configuracion from './pages/Configuracion.jsx';

function Toasts({ items }) {
  return <div className="toasts" aria-live="polite">{items.map((t) => <div key={t.id} className={`toast toast-${t.tipo}`}>{t.msg}</div>)}</div>;
}

function MiPassword({ onClose, recuperacion }) {
  const toast = useToast();
  const { user } = useAuth();
  const [f, setF] = useState({ actual: '', nueva: '', repetir: '' });
  const [error, setError] = useState(null);
  const [cargando, run] = useCargando();
  const enviar = (e) => {
    e.preventDefault();
    if (f.nueva.length < 8) return setError('La nueva contraseña debe tener al menos 8 caracteres');
    if (f.nueva !== f.repetir) return setError('Las contraseñas nuevas no coinciden');
    run(async () => {
      try {
        if (!recuperacion) await ingresar(user.email, f.actual); // verifica la contraseña actual
        await nuevaPassword(f.nueva);
        await supabase.auth.signOut({ scope: 'others' }).catch(() => {});
        toast('Contraseña actualizada'); onClose();
      } catch (err) { setError(/incorrectos/.test(err.message) ? 'La contraseña actual no es correcta' : err.message); }
    });
  };
  return (
    <Sheet titulo={recuperacion ? 'Elegí una contraseña nueva' : 'Mi contraseña'} onClose={onClose}>
      <form className="form" onSubmit={enviar}>
        {error && <Aviso tipo="error">{error}</Aviso>}
        {!recuperacion && <Campo label="Contraseña actual" req><input type="password" autoComplete="current-password" value={f.actual} onChange={(e) => setF({ ...f, actual: e.target.value })} required /></Campo>}
        <Campo label="Nueva contraseña" req hint="Mínimo 8 caracteres"><input type="password" autoComplete="new-password" minLength={8} value={f.nueva} onChange={(e) => setF({ ...f, nueva: e.target.value })} required /></Campo>
        <Campo label="Repetir nueva contraseña" req><input type="password" autoComplete="new-password" value={f.repetir} onChange={(e) => setF({ ...f, repetir: e.target.value })} required /></Campo>
        <p className="texto-suave chico">Se cerrarán tus sesiones abiertas en otros dispositivos.</p>
        <div className="pie-form"><button type="button" className="btn btn-fantasma" onClick={onClose}>Cancelar</button><button className="btn btn-primario" disabled={cargando}>Guardar</button></div>
      </form>
    </Sheet>
  );
}

function Cabecera() {
  const { user, logout } = useAuth();
  const [clave, setClave] = useState(false);
  return (
    <header className="cabecera">
      <Link to="/" className="cabecera-marca" aria-label="Inicio"><Marca compacta claro alto={30} /><span className="cabecera-app">ControlAr</span></Link>
      <nav className="cabecera-nav">
        <Link to="/cotizaciones" className="link-cab">Dólar BNA</Link>
        {user.rol === 'admin' && <Link to="/usuarios" className="link-cab">Usuarios</Link>}
        <button className="cabecera-user btn-texto-cab" title={`${user.email} · cambiar contraseña`} onClick={() => setClave(true)}>{user.nombre} · {user.rol === 'admin' ? 'Administrador' : 'Encargado'}</button>
        <button className="link-cab btn-texto-cab solo-celular" onClick={() => setClave(true)} aria-label="Mi contraseña">🔑</button>
        <button className="btn btn-fantasma btn-chico" onClick={logout}>Salir</button>
      </nav>
      {clave && <MiPassword onClose={() => setClave(false)} />}
    </header>
  );
}

function Pendiente() {
  const { user, logout, setUser } = useAuth();
  const [cargando, run] = useCargando();
  const [aviso, setAviso] = useState(null);
  return (
    <main className="login"><div className="login-form">
      <Marca />
      <h1>{user.activo ? 'Cuenta creada' : 'Acceso desactivado'}</h1>
      <p>Hola {user.nombre || user.email}. {user.activo ? <>Tu usuario está <strong>pendiente de habilitación</strong>.</> : <>Tu usuario <strong>no está habilitado</strong> para usar la app.</>}</p>
      <p className="texto-suave">Avisale al administrador de Andorinas para que te asigne las obras. Cuando lo haga, tocá “Ya me habilitaron”.</p>
      {aviso && <Aviso tipo="info">{aviso}</Aviso>}
      <button className="btn btn-primario btn-bloque" disabled={cargando} onClick={() => run(async () => {
        try { const p = await perfilActual(); if (p && p.activo && p.rol !== 'pendiente') setUser(p); else setAviso('Todavía no te habilitaron. Probá de nuevo en un rato.'); }
        catch (e) { setAviso(e.message); }
      })}>Ya me habilitaron</button>
      <button className="btn btn-fantasma btn-bloque" onClick={logout}>Salir</button>
    </div></main>
  );
}

function SinConfigurar() {
  return (
    <main className="login"><div className="login-form">
      <Marca />
      <h1>Falta configurar Supabase</h1>
      <p>Definí <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> (en GitHub: Settings → Secrets and variables → Actions → Variables) y volvé a publicar.</p>
    </div></main>
  );
}

function App() {
  const [user, setUser] = useState(undefined);
  const [recuperacion, setRecuperacion] = useState(false);
  const [toasts, setToasts] = useState([]);
  const toast = (msg, tipo = 'ok') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, msg, tipo }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  };
  useEffect(() => {
    if (!configurado) return;
    perfilActual().then(setUser).catch(() => setUser(null));
    const { data: sub } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'PASSWORD_RECOVERY') setRecuperacion(true);
      if (evento === 'SIGNED_OUT') setUser(null);
      if (evento === 'SIGNED_IN' || evento === 'PASSWORD_RECOVERY') setTimeout(() => perfilActual().then(setUser).catch(() => {}), 0);
    });
    const venc = () => setUser(null);
    window.addEventListener('sesion-vencida', venc);
    return () => { sub.subscription.unsubscribe(); window.removeEventListener('sesion-vencida', venc); };
  }, []);
  const logout = async () => { await salir().catch(() => {}); setUser(null); };

  if (!configurado) return <SinConfigurar />;
  if (user === undefined) return <div className="cargando-pantalla"><Marca /></div>;
  const habilitado = user && user.activo && ['admin', 'encargado'].includes(user.rol);
  return (
    <AuthCtx.Provider value={{ user, setUser, logout }}>
      <ToastCtx.Provider value={toast}>
        <HashRouter>
          {!user ? (
            <Routes><Route path="*" element={<Login />} /></Routes>
          ) : !habilitado ? (
            <Pendiente />
          ) : (
            <>
              <Cabecera />
              <Routes>
                <Route path="/" element={<Obras />} />
                <Route path="/obras/nueva" element={user.rol === 'admin' ? <NuevaObra /> : <Navigate to="/" />} />
                <Route path="/usuarios" element={user.rol === 'admin' ? <Usuarios /> : <Navigate to="/" />} />
                <Route path="/cotizaciones" element={<Cotizaciones />} />
                <Route path="/obras/:obraId" element={<ObraLayout />}>
                  <Route index element={<Tablero />} />
                  <Route path="movimientos" element={<Movimientos />} />
                  <Route path="avance" element={<Avance />} />
                  <Route path="configuracion" element={user.rol === 'admin' ? <Configuracion /> : <Navigate to=".." />} />
                </Route>
                <Route path="*" element={<NoEncontrado />} />
              </Routes>
            </>
          )}
          {user && recuperacion && <MiPassword recuperacion onClose={() => setRecuperacion(false)} />}
        </HashRouter>
        <Toasts items={toasts} />
      </ToastCtx.Provider>
    </AuthCtx.Provider>
  );
}

function NoEncontrado() {
  const nav = useNavigate();
  return <main className="contenedor"><h1>Página no encontrada</h1><button className="btn" onClick={() => nav('/')}>Volver a obras</button></main>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
