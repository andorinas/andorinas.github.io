import { useState } from 'react';
import { ingresar, registrarse, recuperarPassword } from '../datos.js';
import { useAuth } from '../ctx.js';
import { Isologo, Aviso, Segmentado, useCargando } from '../components/ui.jsx';

export default function Login() {
  const { setUser } = useAuth();
  const [modo, setModo] = useState('ingresar');
  const [f, setF] = useState({ email: '', password: '', nombre: '' });
  const [error, setError] = useState(() => (new URLSearchParams(window.location.search).has('code')
    ? 'No se pudo usar el enlace del email: abrilo en el mismo navegador donde lo pediste, o pedí uno nuevo con “Olvidé mi contraseña”.' : null));
  const [aviso, setAviso] = useState(null);
  const [cargando, run] = useCargando();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

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
        <Isologo size={180} color="#ffffff" />
        <p>Arquitectura e Ingeniería<br />Proyecto y Dirección<br />Cómputo y presupuesto</p>
      </div>
      <form className="login-form" onSubmit={enviar}>
        <div className="login-marca"><Isologo size={56} /><div><div className="marca-nombre grande">ANDORINAS</div><div className="marca-sub">Ingeniería &amp; Construcción</div></div></div>
        <h1>ControlAr</h1>
        <p className="texto-suave">Presupuestos, gastos, pagos y avance de obra.</p>
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
        {modo === 'registrarse' && <p className="texto-suave chico">Después de crear la cuenta, el administrador te habilita y te asigna las obras.</p>}
      </form>
    </main>
  );
}
