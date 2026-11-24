// "Vista del cliente": la empresa ve la obra exactamente como la ve el cliente en su portal.
import { useEffect, useState } from 'react';
import { portalObra, clientesDeObra } from '../datos.js';
import { useObra, useAuth } from '../ctx.js';
import { Aviso } from '../components/ui.jsx';
import PortalObra from '../components/Portal.jsx';

export default function VistaCliente() {
  const { obra, version } = useObra();
  const { user } = useAuth();
  const [p, setP] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [error, setError] = useState(null);
  useEffect(() => {
    portalObra(obra.id).then(setP).catch((e) => setError(e.message));
    clientesDeObra(obra.id).then(setClientes).catch(() => {});
  }, [obra.id, version]);
  return (
    <>
      <div className="aviso aviso-info"><div>
        {clientes.length ? <>Clientes con acceso a esta obra: <strong>{clientes.map((c) => c.nombre).join(', ')}</strong>.</>
          : <>Esta obra todavía no tiene clientes con acceso.{user.rol === 'admin' ? ' Habilitalos en Usuarios como “Cliente” y asignales la obra.' : ''}</>}
        {' '}Las fotos se publican desde la pestaña Fotos y las novedades desde Diario.
      </div></div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {p ? <PortalObra p={p} vistaPrevia /> : !error && <div className="esqueleto" />}
    </>
  );
}
