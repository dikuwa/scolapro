import Image from "next/image";
import { SCOLAPRO_BRAND } from "@/lib/brand";

/**
 * Official ScolaPro brand assets.
 *
 * The application currently ships one light palette (see the token set in
 * `globals.css`); there is no coordinated dark token set or class-based theme.
 * Switching these assets on OS-level `dark:` preference made a white logo
 * variant render on a light sidebar and disappear. Reintroduce variant
 * switching only together with a real dark token set — never on the media
 * `dark:` variant alone.
 */
const SCOLAPRO_ASSETS = {
  mark: "/brand/scolapro/icon-blue.svg",
  wordmark: "/brand/scolapro/logo-blue.svg",
} as const;

export function ScolaProMark({ className = "size-9", title = "ScolaPro" }: { className?: string; title?: string }) {
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center ${className}`} role="img" aria-label={title}>
      <Image
        src={SCOLAPRO_ASSETS.mark}
        alt=""
        width={84}
        height={126}
        className="h-full w-full object-contain"
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
          src={SCOLAPRO_ASSETS.wordmark}
          alt=""
          width={561}
          height={126}
          className="h-full w-full object-contain object-left"
          priority
        />
      </span>
      {!compact ? <span className="sr-only">{SCOLAPRO_BRAND.productDescription}</span> : null}
    </span>
  );
}
