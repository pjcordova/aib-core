import { useEffect, useState } from 'react';
import { enlaceWhatsapp } from '../lib/contacto';
import type { ProyectoCompleto } from '../lib/proyectos';
import { enlaceResena, mensajeResena, urlResena, type EnlaceResena } from '../lib/recordatorios';

/**
 * En el encargo «Publicada»: la reseña del cliente, o el botón para pedírsela
 * por WhatsApp con su enlace (/resena/…), que abre sin cuenta.
 */
export function ResenaEncargo({ encargo, publicada }: { encargo: ProyectoCompleto; publicada: boolean }) {
  const [enlace, setEnlace] = useState<EnlaceResena | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!publicada) return;
    let vigente = true;
    void enlaceResena(encargo.id).then((r) => {
      if (vigente) setEnlace(r);
    });
    return () => {
      vigente = false;
    };
  }, [encargo.id, publicada]);

  if (!publicada || !enlace) return null;

  if (enlace.estado === 'ya_resenada') {
    const { estrellas, comentario } = enlace.resena;
    return (
      <div className="mb-6 rounded-xl border border-line p-4">
        <p className="text-[11px] font-semibold tracking-wide text-accent uppercase">Reseña de tu cliente</p>
        <p className="mt-1 text-lg text-accent-alt" aria-label={`${estrellas} de 5 estrellas`}>
          {'★'.repeat(estrellas)}
          <span className="text-line-strong">{'★'.repeat(5 - estrellas)}</span>
        </p>
        {comentario && <p className="mt-1 text-sm text-ink">«{comentario}»</p>}
      </div>
    );
  }

  if (enlace.estado !== 'ok') return null;

  const c = encargo.contacto;
  const datos = {
    cliente: c?.nombre.split(/\s+/)[0] ?? null,
    negocio: encargo.ficha?.empresa ?? encargo.servicio,
    token: enlace.token,
  };
  const whatsapp = c ? enlaceWhatsapp(c.whatsapp, mensajeResena(datos)) : null;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(urlResena(enlace.token));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  };

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-accent-alt/50 bg-accent-alt/10 p-4">
      <div className="min-w-0 grow basis-60">
        <p className="font-medium text-ink">Pídele su reseña a {datos.cliente ?? 'tu cliente'}</p>
        <p className="mt-0.5 text-sm text-ink-muted">
          Ya está listo. Su opinión sale en tu página y ayuda a que otros clientes te elijan. Se abre sin cuenta.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {whatsapp && (
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn btn-primary !px-3 !py-1.5 text-sm">
            Pedir por WhatsApp
          </a>
        )}
        <button type="button" onClick={() => void copiar()} className="btn btn-ghost !px-3 !py-1.5 text-sm">
          {copiado ? '✓ Copiado' : 'Copiar enlace'}
        </button>
      </div>
    </div>
  );
}
