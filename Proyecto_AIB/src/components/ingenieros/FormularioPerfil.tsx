import { useRef, useState } from 'react';
import { normalizarWhatsapp } from '../../lib/contacto';
import { subirFoto } from '../../lib/fotos';
import {
  guardarPerfilIngeniero,
  guardarServicios,
  SERVICIOS_INGENIERO,
  type DatosPerfil,
  type EstadoIngeniero,
} from '../../lib/ingenieros';
import { CATEGORIAS_NEGOCIO } from '../../lib/plantillas';

// ---------------------------------------------------------------------------
// Perfil del ingeniero
// ---------------------------------------------------------------------------
// Lo que ven los clientes al elegir quién les construye la web: foto, nombre,
// una línea que lo resume, con qué rubros prefiere trabajar, experiencia y
// portafolio. El WhatsApp es privado: solo para coordinar con el administrador.
// ---------------------------------------------------------------------------

const VACIO: DatosPerfil = {
  nombre: '',
  titular: '',
  bio: '',
  especialidades: [],
  anios_experiencia: null,
  ciudad: null,
  portafolio_url: null,
  foto_url: null,
  whatsapp: null,
};

interface Props {
  inicial?: (DatosPerfil & { servicios?: string[] }) | null;
  /** Texto del botón: «Enviar solicitud» al postular, «Guardar perfil» al editar. */
  textoBoton: string;
  onGuardado: (estado: EstadoIngeniero) => void;
}

export function FormularioPerfil({ inicial, textoBoton, onGuardado }: Props) {
  const [datos, setDatos] = useState<DatosPerfil>(inicial ?? VACIO);
  const [whatsapp, setWhatsapp] = useState(inicial?.whatsapp ?? '');
  const [anios, setAnios] = useState(inicial?.anios_experiencia != null ? String(inicial.anios_experiencia) : '');
  // Qué servicios ofrece (web, CRM, ERP…): se guardan aparte del perfil.
  const [servicios, setServicios] = useState<string[]>(inicial?.servicios?.length ? inicial.servicios : ['web']);
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const selectorFoto = useRef<HTMLInputElement>(null);

  const cambiar = <K extends keyof DatosPerfil>(campo: K, valor: DatosPerfil[K]) =>
    setDatos((d) => ({ ...d, [campo]: valor }));

  const alternar = (valor: string) =>
    cambiar(
      'especialidades',
      datos.especialidades.includes(valor)
        ? datos.especialidades.filter((v) => v !== valor)
        : [...datos.especialidades, valor].slice(0, 6)
    );

  const alElegirFoto = async (archivo: File | undefined) => {
    if (!archivo) return;
    setSubiendo(true);
    setError('');
    try {
      cambiar('foto_url', await subirFoto(archivo));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos subir la foto.');
    } finally {
      setSubiendo(false);
    }
  };

  const numero = whatsapp.trim() ? normalizarWhatsapp(whatsapp) : null;
  const portafolio = normalizarEnlace(datos.portafolio_url ?? '');
  const problemas = [
    datos.nombre.trim().length < 2 && 'Escribe tu nombre.',
    datos.titular.trim().length < 3 && 'Escribe una línea que te describa.',
    datos.especialidades.length === 0 && 'Elige al menos un rubro.',
    servicios.length === 0 && 'Elige al menos un servicio.',
    whatsapp.trim() && !numero && 'Revisa tu WhatsApp (ej: 987 654 321).',
    portafolio && !enlaceValido(portafolio) && 'Revisa el enlace de tu portafolio (ej: tuportafolio.com).',
    anios && !(Number(anios) >= 0 && Number(anios) <= 60) && 'Revisa los años de experiencia.',
  ].filter(Boolean) as string[];

  const guardar = async () => {
    if (problemas.length > 0 || guardando || subiendo) {
      setError(problemas[0] ?? '');
      return;
    }
    setGuardando(true);
    setError('');
    const resultado = await guardarPerfilIngeniero({
      ...datos,
      nombre: datos.nombre.trim(),
      titular: datos.titular.trim(),
      bio: datos.bio.trim(),
      anios_experiencia: anios ? Math.round(Number(anios)) : null,
      ciudad: datos.ciudad?.trim() || null,
      portafolio_url: portafolio || null,
      whatsapp: numero,
    });
    setGuardando(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    if (!(await guardarServicios(servicios))) {
      setError('Tu perfil se guardó, pero no tus servicios. Vuelve a intentarlo.');
      return;
    }
    onGuardado(resultado.estado);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void guardar();
      }}
      className="space-y-5"
    >
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => selectorFoto.current?.click()}
          className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full border border-line-strong bg-surface-overlay text-xs text-ink-subtle"
          aria-label="Subir tu foto"
        >
          {datos.foto_url ? (
            <img src={datos.foto_url} alt="" className="h-full w-full object-cover" />
          ) : subiendo ? (
            'Subiendo…'
          ) : (
            'Tu foto'
          )}
        </button>
        <div className="text-sm text-ink-muted">
          Una foto tuya, de frente y con buena luz. Da mucha más confianza que un logo.
          <input
            ref={selectorFoto}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              void alElegirFoto(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm text-ink-muted">Nombre y apellido</span>
          <input
            className="field"
            value={datos.nombre}
            maxLength={80}
            onChange={(e) => cambiar('nombre', e.target.value)}
            placeholder="Ej: Ana Torres"
            autoComplete="name"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm text-ink-muted">Ciudad (opcional)</span>
          <input
            className="field"
            value={datos.ciudad ?? ''}
            maxLength={60}
            onChange={(e) => cambiar('ciudad', e.target.value)}
            placeholder="Ej: Lima"
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm text-ink-muted">En una línea, ¿quién eres?</span>
        <input
          className="field"
          value={datos.titular}
          maxLength={100}
          onChange={(e) => cambiar('titular', e.target.value)}
          placeholder="Ej: Ingeniera de software · webs para restaurantes y tiendas"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm text-ink-muted">Sobre ti (opcional)</span>
        <textarea
          className="field min-h-[110px]"
          value={datos.bio}
          maxLength={800}
          onChange={(e) => cambiar('bio', e.target.value)}
          placeholder="Cuéntale al dueño del negocio cómo trabajas, qué has hecho y por qué elegirte."
        />
      </label>

      <fieldset>
        <legend className="mb-2 text-sm text-ink-muted">¿Con qué rubros te gusta trabajar?</legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORIAS_NEGOCIO.map((c) => {
            const elegida = datos.especialidades.includes(c.valor);
            return (
              <button
                key={c.valor}
                type="button"
                onClick={() => alternar(c.valor)}
                aria-pressed={elegida}
                className={
                  'rounded-full border px-3 py-1.5 text-sm transition-colors ' +
                  (elegida
                    ? 'border-accent bg-accent text-white'
                    : 'border-line-strong bg-surface-raised text-ink hover:border-accent/50')
                }
              >
                {c.etiqueta}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm text-ink-muted">¿Qué servicios ofreces?</legend>
        <div className="flex flex-wrap gap-2">
          {SERVICIOS_INGENIERO.map((s) => {
            const elegido = servicios.includes(s.valor);
            return (
              <button
                key={s.valor}
                type="button"
                onClick={() =>
                  setServicios((lista) => (elegido ? lista.filter((v) => v !== s.valor) : [...lista, s.valor]))
                }
                aria-pressed={elegido}
                className={
                  'rounded-full border px-3 py-1.5 text-sm transition-colors ' +
                  (elegido
                    ? 'border-accent bg-accent text-white'
                    : 'border-line-strong bg-surface-raised text-ink hover:border-accent/50')
                }
              >
                {s.etiqueta}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1.5 block text-sm text-ink-muted">Años de experiencia</span>
          <input
            className="field"
            inputMode="numeric"
            value={anios}
            onChange={(e) => setAnios(e.target.value.replace(/\D/g, '').slice(0, 2))}
            placeholder="Ej: 3"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-sm text-ink-muted">Portafolio (opcional)</span>
          <input
            className="field"
            value={datos.portafolio_url ?? ''}
            onChange={(e) => cambiar('portafolio_url', e.target.value)}
            placeholder="tuportafolio.com o github.com/tu-usuario"
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm text-ink-muted">Tu WhatsApp (privado)</span>
        <input
          className="field"
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          placeholder="Ej: 987 654 321"
          inputMode="tel"
          autoComplete="tel"
        />
        <span className="mt-1 block text-[11px] text-ink-subtle">
          Solo lo ve el administrador de AIB+, para coordinar contigo. Los clientes no lo ven.
        </span>
      </label>

      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}

      <button type="submit" disabled={guardando || subiendo} className="btn btn-primary w-full py-3 sm:w-auto sm:px-8">
        {guardando ? 'Guardando…' : textoBoton}
      </button>
    </form>
  );
}

/**
 * El portafolio como lo escriba: «misitio.com», «www.misitio.com» o con
 * http(s)://. Si no trae el protocolo, se le pone https://.
 */
function normalizarEnlace(texto: string): string {
  const limpio = texto.trim().replace(/\s+/g, '');
  if (!limpio) return '';
  return /^https?:\/\//i.test(limpio) ? limpio : `https://${limpio}`;
}

/** Un enlace web con dominio (algo.algo), sin caracteres raros y no muy largo. */
function enlaceValido(enlace: string): boolean {
  return enlace.length <= 300 && /^https?:\/\/[^\s<>"/]+\.[^\s<>"/]{2,}([/?#][^\s<>"]*)?$/i.test(enlace);
}
