import { createClient } from '@supabase/supabase-js';

// Valores públicos (la clave "anon/publishable" está pensada para ir en el navegador;
// la seguridad la dan las políticas RLS y las funciones del esquema).
const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configurado = Boolean(URL && KEY);

export const supabase = configurado
  ? createClient(URL, KEY, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;
