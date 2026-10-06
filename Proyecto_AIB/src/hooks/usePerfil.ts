// ---------------------------------------------------------------------------
// usePerfil — rol de la cuenta (cliente o ingeniero) y si es el administrador
// ---------------------------------------------------------------------------
// Si la tabla `perfiles` todavía no existe (no se ejecutó
// supabase_roles_plantillas.sql), no se rompe nada: la cuenta se trata como
// cliente y `sinConfigurar` avisa para poder explicarlo en pantalla.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type Rol = 'cliente' | 'ingeniero';

interface EstadoPerfil {
  rol: Rol;
  /** El administrador del marketplace: ve todo y aprueba ingenieros. */
  esAdmin: boolean;
  cargando: boolean;
  /** true si la base de datos aún no tiene la tabla de perfiles. */
  sinConfigurar: boolean;
}

export function usePerfil(userId: string | null | undefined): EstadoPerfil {
  const [estado, setEstado] = useState<EstadoPerfil>({
    rol: 'cliente',
    esAdmin: false,
    cargando: true,
    sinConfigurar: false,
  });

  useEffect(() => {
    if (!userId) return;
    let activo = true;

    supabase
      .from('perfiles')
      .select('rol, es_admin')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!activo) return;
        if (error) {
          // 42P01 = la tabla no existe. Cualquier otro error también degrada a
          // cliente: es la opción que no abre nada que no deba abrirse.
          setEstado({
            rol: 'cliente',
            esAdmin: false,
            cargando: false,
            sinConfigurar: error.code === '42P01' || error.code === 'PGRST205',
          });
          return;
        }
        setEstado({
          rol: data?.rol === 'ingeniero' ? 'ingeniero' : 'cliente',
          esAdmin: data?.rol === 'ingeniero' && data?.es_admin === true,
          cargando: false,
          sinConfigurar: false,
        });
      });

    return () => {
      activo = false;
    };
  }, [userId]);

  return estado;
}
