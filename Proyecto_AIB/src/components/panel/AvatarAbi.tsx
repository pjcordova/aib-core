/** La cara de ABI: un robot sencillo, con los colores de la marca. */
export function AvatarAbi({ tamano = 48 }: { tamano?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-2xl border border-accent/30 bg-accent/10 text-accent"
      style={{ width: tamano, height: tamano }}
      aria-hidden="true"
    >
      <svg width={tamano * 0.6} height={tamano * 0.6} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2.5v3" />
        <circle cx="12" cy="2.5" r="0.9" fill="currentColor" stroke="none" />
        <rect x="4" y="6" width="16" height="13" rx="4" />
        <circle cx="9" cy="12" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="15" cy="12" r="1.4" fill="currentColor" stroke="none" />
        <path d="M9.5 15.8h5" />
        <path d="M2 11.5v3M22 11.5v3" />
      </svg>
    </span>
  );
}
