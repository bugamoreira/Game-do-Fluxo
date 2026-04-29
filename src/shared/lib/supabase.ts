// ============================================================
// Supabase Client — usa proxy do Netlify para evitar bloqueios
// de cross-origin (Chrome, firewalls corporativos, SSL inspection).
//
// Em produção: window.location.origin (browser fala com mesmo domínio,
// Netlify faz proxy reverso para okmafynejwrwnmvyruwy.supabase.co).
//
// Em dev local: VITE_SUPABASE_URL direto (sem proxy).
// ============================================================

import { createClient } from '@supabase/supabase-js';

const key = import.meta.env.VITE_SUPABASE_KEY as string;

if (!key) {
  throw new Error('Missing VITE_SUPABASE_KEY environment variable');
}

// Em produção (browser): usa o domínio atual (proxy via netlify.toml).
// Em dev (Vite dev server): usa URL direto do Supabase.
const url =
  typeof window !== 'undefined' && import.meta.env.PROD
    ? window.location.origin
    : (import.meta.env.VITE_SUPABASE_URL as string);

if (!url) {
  throw new Error('Missing VITE_SUPABASE_URL environment variable');
}

export const sb = createClient(url, key);
