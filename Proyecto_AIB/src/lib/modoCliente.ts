// ---------------------------------------------------------------------------
// «Probar como cliente»
// ---------------------------------------------------------------------------
// El ingeniero entra directo a su panel, con ABI. Si quiere ver la app como
// la ve un cliente, lo pide desde el panel y queda así mientras dure la
// pestaña (sessionStorage): al cerrarla, la próxima vez vuelve a su panel.
// ---------------------------------------------------------------------------

const CLAVE = 'aib-probar-como-cliente';

export function leerModoCliente(): boolean {
  try {
    return sessionStorage.getItem(CLAVE) === '1';
  } catch {
    return false;
  }
}

export function activarModoCliente(): void {
  try {
    sessionStorage.setItem(CLAVE, '1');
  } catch {
    // Sin almacenamiento, el estado de la navegación lo deja entrar igual.
  }
}

export function salirModoCliente(): void {
  try {
    sessionStorage.removeItem(CLAVE);
  } catch {
    // Nada que borrar.
  }
}
