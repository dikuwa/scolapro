import { SCOLAPRO_BRAND } from "@/lib/brand";

export function ScolaProMark({ className = "size-9", title = "ScolaPro" }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="7" y="8" width="44" height="48" rx="11" fill="#06112e" />
      <path d="M18 18.5h23.5c3 0 5.5 2.5 5.5 5.5v24H23.5c-3 0-5.5-2.5-5.5-5.5v-24Z" fill="#fff" opacity="0.98" />
      <path d="M22 20.5h17.5c2 0 3.5 1.5 3.5 3.5v18H25.5c-2 0-3.5-1.5-3.5-3.5v-18Z" fill="#f5f7fb" />
      <path d="M25.5 27h13M25.5 32h10M25.5 37h7.5" stroke="#06112e" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M43.5 13.5 56 26l-5.6 5.6-12.5-12.5 5.6-5.6Z" fill="#009b87" />
      <path d="m37.9 19.1-2.4 8.1 8-2.5-5.6-5.6Z" fill="#009b87" />
      <path d="M51 27.2V47c0 5-4 9-9 9H18" fill="none" stroke="#009b87" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function ScolaProWordmark({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-2.5 ${className}`}>
      <ScolaProMark className={compact ? "size-8 shrink-0" : "size-9 shrink-0"} />
      <span className="min-w-0 leading-none">
        <span className={compact ? "text-sm font-bold tracking-[-0.035em]" : "text-[0.98rem] font-bold tracking-[-0.04em]"}>
          <span className="text-[#06112e] dark:text-white">Scola</span>
          <span className="text-[#009b87]">Pro</span>
        </span>
        {!compact ? <span className="sr-only">{SCOLAPRO_BRAND.productDescription}</span> : null}
      </span>
    </span>
  );
}
