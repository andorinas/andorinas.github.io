import { createClient } from '@supabase/supabase-js';

// Valores públicos (la clave "anon/publishable" está pensada para ir en el navegador;
// la seguridad la dan las políticas RLS y las funciones del esquema).
const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configurado = Boolean(URL && KEY);

// Enlaces de email enviados por el administrador desde el panel de Supabase (por ejemplo "Send password
// recovery"): llegan con los datos en el "#" (#access_token=…&type=recovery) en lugar del flujo PKCE de la app.
// Se toman antes de crear el cliente y se limpia la dirección para que no la interprete el router.
function tomarEnlaceDelEmail() {
  if (typeof window === 'undefined') return null;
  const h = window.location.hash.replace(/^#\/?/, '');
  if (!/(^|&)(access_token|error_code|error_description)=/.test(h)) return null;
  const p = Object.fromEntries(new URLSearchParams(h));
  window.history.replaceState(null, '', window.location.pathname + window.location.search + '#/');
  return p;
}
export const enlaceEmail = tomarEnlaceDelEmail();

export const supabase = configurado
  ? createClient(URL, KEY, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;
