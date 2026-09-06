import Image from "next/image";
import { SCOLAPRO_BRAND } from "@/lib/brand";

const SCOLAPRO_ASSETS = {
  mark: {
    light: "/brand/scolapro/icon-blue.svg",
    dark: "/brand/scolapro/icon-white.svg",
  },
  wordmark: {
    light: "/brand/scolapro/logo-blue.svg",
    dark: "/brand/scolapro/logo-white.svg",
  },
} as const;

export function ScolaProMark({ className = "size-9", title = "ScolaPro" }: { className?: string; title?: string }) {
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center ${className}`} role="img" aria-label={title}>
      <Image
        src={SCOLAPRO_ASSETS.mark.light}
        alt=""
        width={84}
        height={126}
        className="h-full w-full object-contain dark:hidden"
        priority
      />
      <Image
        src={SCOLAPRO_ASSETS.mark.dark}
        alt=""
        width={84}
        height={126}
        className="hidden h-full w-full object-contain dark:block"
        priority
      />
    </span>
  );
}

export function ScolaProWordmark({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  return (
    <span className={`inline-flex min-w-0 items-center ${className}`}>
      <span className={compact ? "relative h-7 w-[126px] shrink-0" : "relative h-8 w-36 shrink-0"} role="img" aria-label={SCOLAPRO_BRAND.name}>
        <Image
          src={SCOLAPRO_ASSETS.wordmark.light}
          alt=""
          width={561}
          height={126}
          className="h-full w-full object-contain object-left dark:hidden"
          priority
        />
        <Image
          src={SCOLAPRO_ASSETS.wordmark.dark}
          alt=""
          width={561}
          height={126}
          className="hidden h-full w-full object-contain object-left dark:block"
          priority
        />
      </span>
      {!compact ? <span className="sr-only">{SCOLAPRO_BRAND.productDescription}</span> : null}
    </span>
  );
}
