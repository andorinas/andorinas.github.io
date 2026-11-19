import { createContext, useContext } from 'react';

export const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);
export const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
/** Obra activa: { obra, recargarObra, vista, setVista, version, refrescar, abrir(accion, opciones) } */
export const ObraCtx = createContext(null);
export const useObra = () => useContext(ObraCtx);
