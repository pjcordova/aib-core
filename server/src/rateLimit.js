// ---------------------------------------------------------------------------
// Limitador de peticiones — cortafuegos de gasto
// ---------------------------------------------------------------------------
// Un bucle en el frontend llegó a lanzar ~7 peticiones por minuto durante 40
// minutos sin que nada lo parara. El bug concreto está arreglado, pero la
// lección es que el servidor no debe depender de que el cliente se porte bien:
// cada endpoint que gasta dinero lleva su propio techo.
//
// Ventana fija en memoria. Suficiente para un servidor único; si algún día hay
// varias instancias, esto se sustituye por Redis.
// ---------------------------------------------------------------------------

function crearLimitador({ maxPorMinuto, nombre }) {
  const ventanas = new Map(); // clave -> { inicio, contador }
  const VENTANA_MS = 60_000;

  // Evita que el mapa crezca sin fin con IPs que ya no vuelven.
  setInterval(() => {
    const ahora = Date.now();
    for (const [clave, dato] of ventanas) {
      if (ahora - dato.inicio > VENTANA_MS * 2) ventanas.delete(clave);
    }
  }, VENTANA_MS).unref();

  return function limitar(req, res, next) {
    const clave = req.ip ?? 'desconocido';
    const ahora = Date.now();
    const dato = ventanas.get(clave);

    if (!dato || ahora - dato.inicio > VENTANA_MS) {
      ventanas.set(clave, { inicio: ahora, contador: 1 });
      return next();
    }

    dato.contador += 1;

    if (dato.contador > maxPorMinuto) {
      const esperaS = Math.ceil((VENTANA_MS - (ahora - dato.inicio)) / 1000);
      console.warn(
        `[AIB+] Límite alcanzado en ${nombre}: ${dato.contador} peticiones de ${clave} en un minuto.`
      );
      res.set('Retry-After', String(esperaS));
      return res.status(429).json({
        success: false,
        error: `Demasiadas peticiones seguidas (${maxPorMinuto}/min como máximo). Espera ${esperaS} s.`,
      });
    }

    return next();
  };
}

module.exports = { crearLimitador };
