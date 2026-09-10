// ---------------------------------------------------------------------------
// useAuth — sesión de Supabase como estado de React
// ---------------------------------------------------------------------------
// Dos detalles que no son cosméticos:
//
// 1. `onAuthStateChange` de Supabase emite con frecuencia (INITIAL_SESSION,
//    refrescos de token, cambios de foco) y cada emisión traía un objeto nuevo.
//    Guardarlo tal cual re-renderizaba toda la app aunque la sesión fuera la
//    misma, lo que a su vez recreaba los callbacks que se pasan como props.
//    Comparamos el access_token y solo actualizamos si cambió de verdad.
//
// 2. `signOut` se recreaba en cada render. Estabilizarlo evita que los hijos
//    que lo reciban como prop vean una identidad distinta cada vez.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthState {
  session: Session | null;
  initializing: boolean;
  signOut: () => Promise<void>;
}

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let active = true;

    /** Solo provoca render si la sesión cambió de verdad. */
    const aplicar = (siguiente: Session | null) => {
      setSession((anterior) => {
        if (anterior?.access_token === siguiente?.access_token) return anterior;
        return siguiente;
      });
    };

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      aplicar(data.session);
      setInitializing(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, siguiente) => {
      if (!active) return;
      aplicar(siguiente);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return { session, initializing, signOut };
}
