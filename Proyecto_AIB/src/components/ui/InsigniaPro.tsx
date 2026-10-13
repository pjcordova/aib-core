/** Qué significa la insignia, para el cliente. */
export const QUE_ES_PRO = 'Ingeniero con plan Pro en AIB+.';

/**
 * «Pro»: el ingeniero tiene el plan Pro o Negocio (supabase_destacados.sql y
 * supabase_plan_pro.sql). Va junto a «Verificado», más discreta.
 */
export function InsigniaPro({ tamano = 'sm' }: { tamano?: 'sm' | 'md' }) {
  return (
    <span
      title={QUE_ES_PRO}
      className={
        'inline-flex shrink-0 items-center rounded-full bg-accent font-semibold tracking-wider text-accent-alt uppercase ' +
        (tamano === 'md' ? 'px-2.5 py-1 text-[11px]' : 'px-2 py-0.5 text-[10px]')
      }
    >
      Pro
    </span>
  );
}
