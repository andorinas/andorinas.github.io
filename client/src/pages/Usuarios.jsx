import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib.js';
import { descargarRespaldo } from '../datos.js';
import { useAuth, useToast } from '../ctx.js';
import { Chip, Aviso, useCargando } from '../components/ui.jsx';

const ROL = { admin: 'Administrador', encargado: 'Encargado', pendiente: 'Pendiente' };

export default function Usuarios() {
  const { user } = useAuth();
  const toast = useToast();
  const [lista, setLista] = useState([]);
  const [obras, setObras] = useState([]);
  const [bajando, run] = useCargando();
  const cargar = () => api('/api/usuarios').then(setLista).catch((e) => toast(e.message, 'error'));
  useEffect(() => { cargar(); api('/api/obras').then(setObras); }, []);

  const patch = async (u, body, msg) => { try { await api(`/api/usuarios/${u.id}`, { method: 'PATCH', body }); toast(msg); cargar(); } catch (e) { toast(e.message, 'error'); } };
  const [guardando, setGuardando] = useState(false);
  const toggleObra = async (u, oid) => {
    if (guardando) return;
    setGuardando(true);
    try { await patch(u, { obras: u.obras.includes(oid) ? u.obras.filter((x) => x !== oid) : [...u.obras, oid] }, 'Asignación actualizada'); }
    finally { setGuardando(false); }
  };
  const pendientes = lista.filter((u) => u.rol === 'pendiente' && u.activo);
  const enlace = window.location.href.split('#')[0];

  return (
    <main className="contenedor">
      <Link to="/" className="volver">← Obras</Link>
      <div className="titulo-fila">
        <h1>Usuarios</h1>
        <button className="btn btn-sec" disabled={bajando} onClick={() => run(async () => { try { await descargarRespaldo(); toast('Copia de seguridad descargada'); } catch (e) { toast(e.message, 'error'); } })}>
          {bajando ? 'Preparando…' : '⬇ Descargar copia de seguridad'}
        </button>
      </div>
      <Aviso tipo="info">
        Para sumar a alguien: compartile el enlace <strong>{enlace}</strong>. Crea su cuenta con “Crear cuenta”, aparece acá como <strong>pendiente</strong> y lo habilitás como encargado (eligiendo sus obras) o administrador.
        Si olvida la contraseña, la recupera desde “Olvidé mi contraseña”.
      </Aviso>

      {pendientes.length > 0 && (
        <section className="panel">
          <h2>Esperando habilitación ({pendientes.length})</h2>
          <ul className="lista-usuarios">
            {pendientes.map((u) => (
              <li key={u.id}>
                <div className="fila-entre envolver">
                  <div><strong>{u.nombre || u.email}</strong><div className="chico texto-suave">{u.email}</div></div>
                  <div className="fila-inline">
                    <button className="btn btn-primario btn-chico" onClick={() => patch(u, { rol: 'encargado' }, `${u.nombre || u.email} habilitado como encargado`)}>Habilitar encargado</button>
                    <button className="btn btn-sec btn-chico" onClick={() => window.confirm(`¿Dar acceso de ADMINISTRADOR a ${u.email}? Verá y configurará todas las obras.`) && patch(u, { rol: 'admin' }, 'Habilitado como administrador')}>Administrador</button>
                    <button className="link chico" onClick={() => patch(u, { activo: false }, 'Solicitud rechazada')}>Rechazar</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel">
        <h2>Equipo</h2>
        <ul className="lista-usuarios">
          {lista.filter((u) => u.rol !== 'pendiente' || !u.activo).map((u) => (
            <li key={u.id} className={u.activo ? '' : 'apagado'}>
              <div className="fila-entre envolver">
                <div><strong>{u.nombre || u.email}</strong> <Chip tipo={u.rol === 'admin' ? 'info' : 'neutro'}>{ROL[u.rol]}</Chip>
                  <div className="chico texto-suave">{u.email}{!u.activo && ' · inactivo'}</div></div>
                {u.id !== user.id && (
                  <div className="fila-inline">
                    {u.rol === 'encargado' && u.activo && <button className="link chico" onClick={() => window.confirm(`¿Hacer administrador a ${u.email}?`) && patch(u, { rol: 'admin' }, 'Ahora es administrador')}>Hacer administrador</button>}
                    {u.rol === 'admin' && <button className="link chico" onClick={() => patch(u, { rol: 'encargado' }, 'Ahora es encargado')}>Pasar a encargado</button>}
                    <button className="link chico" onClick={() => patch(u, { activo: !u.activo }, u.activo ? 'Usuario desactivado' : 'Usuario reactivado')}>{u.activo ? 'Desactivar' : 'Reactivar'}</button>
                  </div>
                )}
              </div>
              {u.rol === 'encargado' && u.activo && (
                <div className="obras-asignadas">
                  <span className="chico texto-suave">Obras asignadas:</span>
                  {obras.map((o) => <label key={o.id} className="check chico"><input type="checkbox" checked={u.obras.includes(o.id)} onChange={() => toggleObra(u, o.id)} /> {o.nombre}</label>)}
                  {!obras.length && <span className="chico texto-suave">todavía no hay obras</span>}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
