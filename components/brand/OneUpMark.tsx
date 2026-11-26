/** The One Up mark: a "1" with a Citron up-chevron and full stop. Same shapes as scripts/gen-icons.mjs. */
export function OneUpMark({ className, tile = false, animate = false }: { className?: string; tile?: boolean; animate?: boolean }) {
  return (
    <svg viewBox="0 0 1024 1024" className={className} aria-hidden="true">
      {tile && <rect width="1024" height="1024" rx="230" fill="#191919" />}
      <g transform="translate(512 512) scale(1) translate(-554 -496)">
        <path className={animate ? "mark-chevron" : undefined} d="M410 290 L540 190 L670 290" fill="none" stroke="#DED97A" strokeWidth="90" strokeLinecap="round" strokeLinejoin="round" />
        <path className={animate ? "mark-one" : undefined} d="M392 470 L540 360 L540 790" fill="none" stroke={tile ? "#F5F5F0" : "currentColor"} strokeWidth="116" strokeLinecap="round" strokeLinejoin="round" />
        <circle className={animate ? "mark-dot" : undefined} cx="716" cy="748" r="58" fill="#DED97A" />
      </g>
    </svg>
  );
}
