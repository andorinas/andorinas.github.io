import { useState } from 'react';
import { ingresar, registrarse, recuperarPassword } from '../datos.js';
import { useAuth } from '../ctx.js';
import { Marca, Aviso, Segmentado, useCargando } from '../components/ui.jsx';

// Perfiles de la portada. El acceso es el mismo para todos: la app abre la pantalla que
// corresponde según el rol de la cuenta; esto sólo orienta a quien entra.
const PERFILES = [
  { id: 'cliente', icono: '🏠', titulo: 'Soy cliente', texto: 'Seguí el avance de tu obra, fotos, lluvias y novedades.',
    registro: 'Si Andorinas todavía no te dio acceso, creá tu cuenta y avisales para que te asignen la obra.' },
  { id: 'proveedor', icono: '🛠️', titulo: 'Soy proveedor o gremio', texto: 'Cargá tu avance, fotos y respondé consultas.',
    registro: 'Después de crear la cuenta, Andorinas te habilita y te asigna las obras donde trabajás.' },
  { id: 'admin', icono: '📋', titulo: 'Administración de obra', texto: 'Presupuestos, gastos, pagos y avance. Equipo de Andorinas.',
    registro: 'Después de crear la cuenta, el administrador te habilita y te asigna las obras.' },
];
const leerPerfil = () => { try { return localStorage.getItem('perfil-ingreso'); } catch { return null; } };
const guardarPerfil = (v) => { try { if (v) localStorage.setItem('perfil-ingreso', v); else localStorage.removeItem('perfil-ingreso'); } catch { /* sin almacenamiento */ } };

export default function Login() {
  const { setUser } = useAuth();
  const [modo, setModo] = useState('ingresar');
  const [perfilId, setPerfilId] = useState(() => {
    const guardado = leerPerfil();
    if (PERFILES.some((x) => x.id === guardado)) return guardado;
    return new URLSearchParams(window.location.search).has('code') ? 'admin' : null;
  });
  const perfil = PERFILES.find((x) => x.id === perfilId);
  const [f, setF] = useState({ email: '', password: '', nombre: '' });
  const [error, setError] = useState(() => (new URLSearchParams(window.location.search).has('code')
    ? 'No se pudo usar el enlace del email: abrilo en el mismo navegador donde lo pediste, o pedí uno nuevo con “Olvidé mi contraseña”.' : null));
  const [aviso, setAviso] = useState(null);
  const [cargando, run] = useCargando();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const elegir = (id) => { setPerfilId(id); guardarPerfil(id); setModo('ingresar'); setError(null); setAviso(null); };

  const enviar = (e) => {
    e.preventDefault();
    run(async () => {
      try {
        setError(null); setAviso(null);
        if (modo === 'ingresar') setUser(await ingresar(f.email, f.password));
        else if (modo === 'registrarse') {
          if (f.password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');
          const r = await registrarse(f);
          setAviso(r.requiereConfirmacion
            ? 'Te enviamos un email para confirmar la cuenta. Después ingresá y pedile al administrador que te habilite.'
            : 'Cuenta creada. Ingresá y pedile al administrador que te habilite.');
          setModo('ingresar');
        } else {
          await recuperarPassword(f.email);
          setAviso('Si el email está registrado, te llega un enlace para elegir una contraseña nueva.');
        }
      } catch (err) { setError(err.message); }
    });
  };

  return (
    <main className="login">
      <div className="login-arte" aria-hidden="true">
        <Marca claro alto={260} />
        <p>Arquitectura e Ingeniería<br />Proyecto y Dirección<br />Cómputo y presupuesto</p>
      </div>
      <form className="login-form" onSubmit={enviar}>
        <div className="login-marca"><Marca alto={120} /></div>
        {!perfil ? (
          <>
            <h1>Bienvenido</h1>
            <p className="texto-suave">¿Cómo querés ingresar?</p>
            <div className="perfiles">
              {PERFILES.map((x) => (
                <button type="button" key={x.id} className="perfil-opcion" onClick={() => elegir(x.id)}>
                  <span className="perfil-icono" aria-hidden="true">{x.icono}</span>
                  <span><strong>{x.titulo}</strong><span className="texto-suave chico">{x.texto}</span></span>
                  <span className="perfil-flecha" aria-hidden="true">›</span>
                </button>
              ))}
            </div>
            <a href="ayuda/" target="_blank" rel="noopener" className="link chico">¿Cómo se usa? Ver videos e instructivo</a>
          </>
        ) : (<>
        <button type="button" className="link chico perfil-volver" onClick={() => elegir(null)}>‹ Cambiar tipo de ingreso</button>
        <h1><span aria-hidden="true">{perfil.icono} </span>{perfil.titulo}</h1>
        <p className="texto-suave">{perfil.texto}</p>
        {modo !== 'recuperar' && <Segmentado value={modo} onChange={(m) => { setModo(m); setError(null); }} nombre="Acceso" opciones={[['ingresar', 'Ingresar'], ['registrarse', 'Crear cuenta']]} />}
        {error && <Aviso tipo="error">{error}</Aviso>}
        {aviso && <Aviso tipo="info">{aviso}</Aviso>}
        {modo === 'registrarse' && (
          <label className="campo"><span className="campo-label">Nombre y apellido</span>
            <input autoComplete="name" value={f.nombre} onChange={set('nombre')} required maxLength={80} /></label>
        )}
        <label className="campo"><span className="campo-label">Email</span>
          <input type="email" autoComplete="username" value={f.email} onChange={set('email')} required autoFocus /></label>
        {modo !== 'recuperar' && (
          <label className="campo"><span className="campo-label">Contraseña{modo === 'registrarse' ? ' (mínimo 8 caracteres)' : ''}</span>
            <input type="password" autoComplete={modo === 'ingresar' ? 'current-password' : 'new-password'} value={f.password} onChange={set('password')} required minLength={modo === 'registrarse' ? 8 : undefined} /></label>
        )}
        <button className="btn btn-primario btn-bloque" disabled={cargando}>
          {cargando ? 'Un momento…' : modo === 'ingresar' ? 'Ingresar' : modo === 'registrarse' ? 'Crear cuenta' : 'Enviar enlace'}
        </button>
        {modo === 'ingresar' && <button type="button" className="link chico" onClick={() => { setModo('recuperar'); setError(null); }}>Olvidé mi contraseña</button>}
        {modo === 'recuperar' && <button type="button" className="link chico" onClick={() => setModo('ingresar')}>Volver a ingresar</button>}
        {modo === 'registrarse' && <p className="texto-suave chico">{perfil.registro}</p>}
        <a href="ayuda/" target="_blank" rel="noopener" className="link chico">¿Cómo se usa? Ver videos e instructivo</a>
        </>)}
      </form>
    </main>
  );
}
