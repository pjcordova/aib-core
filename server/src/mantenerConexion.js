// ---------------------------------------------------------------------------
// Mantener viva la conexión mientras la IA trabaja
// ---------------------------------------------------------------------------
// Algunas redes (proxies de empresa, el navegador de WhatsApp, ciertos
// operadores) cortan una conexión que pasa unos 30 s sin recibir datos. Una
// maqueta tarda más que eso, y el cliente perdía una respuesta que el
// servidor sí había generado (y cobrado). Pasó con la primera invitación real.
//
// Este middleware va después de la autenticación y de la cuota: envía ya las
// cabeceras (200, JSON) y un espacio cada pocos segundos hasta que la ruta
// responde. Los espacios delante del JSON son válidos, así que el navegador lo
// lee igual que antes.
//
// Como el código de estado ya salió, los errores posteriores viajan en el
// cuerpo ({ success: false, error }), que el cliente ya revisa en cada
// llamada. El código real queda en res.locals.estadoReal para los logs.
// ---------------------------------------------------------------------------

const LATIDO_MS = 10_000;

function mantenerConexion(req, res, next) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  // Que ningún proxy intermedio guarde los espacios hasta el final.
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write(' ');

  const latido = setInterval(() => {
    if (!res.writableEnded) res.write(' ');
  }, LATIDO_MS);
  const parar = () => clearInterval(latido);
  res.on('close', parar);
  res.on('finish', parar);

  // A partir de aquí status() solo anota el código, y json() cierra la
  // respuesta ya empezada.
  let estado = 200;
  res.status = (codigo) => {
    estado = codigo;
    return res;
  };
  res.json = (cuerpo) => {
    parar();
    res.locals.estadoReal = estado;
    const final =
      estado >= 400 && cuerpo && typeof cuerpo === 'object' ? { ...cuerpo, success: false, status: estado } : cuerpo;
    res.end(JSON.stringify(final));
    return res;
  };

  next();
}

module.exports = { mantenerConexion };
