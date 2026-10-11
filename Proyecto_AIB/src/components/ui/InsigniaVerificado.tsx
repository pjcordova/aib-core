/** Qué significa la insignia: lo que el administrador comprueba antes de darla. */
export const QUE_ES_VERIFICADO = 'AIB+ comprobó su identidad y revisó trabajos reales suyos.';

/**
 * «✓ Verificado»: el administrador comprobó la identidad del ingeniero y
 * revisó trabajos reales suyos (supabase_verificados.sql).
 */
export function InsigniaVerificado({ tamano = 'sm' }: { tamano?: 'sm' | 'md' }) {
  return (
    <span
      title={QUE_ES_VERIFICADO}
      className={
        'inline-flex shrink-0 items-center gap-1 rounded-full border border-accent-alt/60 bg-accent-alt/15 font-medium text-ink ' +
        (tamano === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[11px]')
      }
    >
      <svg width={tamano === 'md' ? 14 : 12} height={tamano === 'md' ? 14 : 12} viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M8 0l2 1.6 2.5-.2.8 2.4 2.2 1.2-.7 2.4.7 2.4-2.2 1.2-.8 2.4-2.5-.2L8 16l-2-1.6-2.5.2-.8-2.4L.5 11l.7-2.4L.5 6.2l2.2-1.2.8-2.4 2.5.2z"
          fill="#c4a26a"
        />
        <path d="M5 8.2l2 2 4-4" fill="none" stroke="#1a2d4d" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Verificado
    </span>
  );
}
