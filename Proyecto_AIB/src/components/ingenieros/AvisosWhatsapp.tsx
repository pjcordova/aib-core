import { useEffect, useState } from 'react';
import { ApiError, probarWhatsappIngeniero } from '../../lib/api';
import { guardarAvisoWhatsapp, tengoAvisoWhatsapp } from '../../lib/ingenieros';

/**
 * Para que al ingeniero le llegue un WhatsApp cuando un cliente lo elige y su
 * resumen de cada mañana. Los avisos salen por CallMeBot, que pide que cada
 * persona active su número una vez y le da una clave.
 */
export function AvisosWhatsapp() {
  const [activos, setActivos] = useState<boolean | null>(null);
  const [clave, setClave] = useState('');
  const [estado, setEstado] = useState<'inactivo' | 'guardando' | 'probando'>('inactivo');
  const [mensaje, setMensaje] = useState<{ texto: string; error: boolean } | null>(null);

  useEffect(() => {
    let vigente = true;
    void tengoAvisoWhatsapp().then((a) => {
      if (vigente) setActivos(a);
    });
    return () => {
      vigente = false;
    };
  }, []);

  const guardar = async () => {
    if (!/^[A-Za-z0-9]{4,40}$/.test(clave.trim())) {
      setMensaje({ texto: 'Pega la clave que te mandó CallMeBot (solo letras y números).', error: true });
      return;
    }
    setEstado('guardando');
    setMensaje(null);
    try {
      await guardarAvisoWhatsapp(clave.trim());
      setClave('');
      const listos = await tengoAvisoWhatsapp();
      setActivos(listos);
      setMensaje(
        listos
          ? { texto: 'Clave guardada. Pulsa «Enviarme una prueba» para comprobarlo.', error: false }
          : { texto: 'Clave guardada. Falta tu WhatsApp en el perfil de arriba.', error: true }
      );
    } catch (e) {
      setMensaje({ texto: e instanceof Error ? e.message : 'No pudimos guardar la clave.', error: true });
    } finally {
      setEstado('inactivo');
    }
  };

  const probar = async () => {
    setEstado('probando');
    setMensaje(null);
    try {
      await probarWhatsappIngeniero();
      setMensaje({ texto: '✓ Te mandamos un WhatsApp de prueba. Si no te llega en un minuto, revisa la clave.', error: false });
    } catch (e) {
      setMensaje({ texto: e instanceof ApiError ? e.message : 'No pudimos enviar la prueba.', error: true });
    } finally {
      setEstado('inactivo');
    }
  };

  const desactivar = async () => {
    setEstado('guardando');
    try {
      await guardarAvisoWhatsapp('');
      setActivos(false);
      setMensaje({ texto: 'Avisos desactivados.', error: false });
    } catch (e) {
      setMensaje({ texto: e instanceof Error ? e.message : 'No pudimos desactivarlos.', error: true });
    } finally {
      setEstado('inactivo');
    }
  };

  return (
    <div className="card mt-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xl">Avisos por WhatsApp</h3>
        {activos !== null && (
          <span
            className={
              'rounded-full px-2.5 py-0.5 text-[11px] font-medium ' +
              (activos ? 'bg-positive/10 text-positive' : 'bg-surface-overlay text-ink-subtle')
            }
          >
            {activos ? 'Activados' : 'Sin activar'}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        Te llega un WhatsApp cuando un cliente te elige, y cada mañana tu resumen con lo que tienes pendiente.
      </p>

      <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm text-ink">
        <li>
          Abre{' '}
          <a
            href="https://www.callmebot.com/blog/free-api-whatsapp-messages/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-accent underline underline-offset-2"
          >
            la página de CallMeBot
          </a>{' '}
          y guarda en tus contactos el número que indica.
        </li>
        <li>
          Desde tu WhatsApp (el mismo de tu perfil), mándale: <span className="font-mono">I allow callmebot to send me messages</span>
        </li>
        <li>Te responde con tu clave («apikey»): pégala aquí.</li>
      </ol>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          className="field !w-48"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          placeholder={activos ? 'Clave nueva' : 'Tu clave'}
          aria-label="Clave de CallMeBot"
          autoComplete="off"
        />
        <button type="button" onClick={() => void guardar()} disabled={estado !== 'inactivo'} className="btn btn-primary">
          {estado === 'guardando' ? 'Guardando…' : 'Guardar clave'}
        </button>
        {activos && (
          <>
            <button type="button" onClick={() => void probar()} disabled={estado !== 'inactivo'} className="btn btn-ghost">
              {estado === 'probando' ? 'Enviando…' : 'Enviarme una prueba'}
            </button>
            <button
              type="button"
              onClick={() => void desactivar()}
              disabled={estado !== 'inactivo'}
              className="text-sm text-ink-muted underline underline-offset-2 hover:text-ink"
            >
              Desactivar
            </button>
          </>
        )}
      </div>
      {mensaje && (
        <p role={mensaje.error ? 'alert' : 'status'} className={'mt-3 text-sm ' + (mensaje.error ? 'text-negative' : 'text-positive')}>
          {mensaje.texto}
        </p>
      )}
      <p className="mt-3 text-[11px] text-ink-subtle">
        La clave queda guardada de forma que nadie la puede ver, ni el administrador. Los avisos pasan por CallMeBot y no
        llevan los datos de contacto de tus clientes.
      </p>
    </div>
  );
}
