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

function ThemeAwareAsset({
  lightSrc,
  darkSrc,
  width,
  height,
  priority = false,
}: {
  lightSrc: string;
  darkSrc: string;
  width: number;
  height: number;
  priority?: boolean;
}) {
  return (
    <>
      <Image
        src={lightSrc}
        alt=""
        width={width}
        height={height}
        className="scolapro-brand-light absolute inset-0 h-full w-full object-contain object-left"
        priority={priority}
      />
      <Image
        src={darkSrc}
        alt=""
        width={width}
        height={height}
        className="scolapro-brand-dark absolute inset-0 h-full w-full object-contain object-left"
        priority={priority}
      />
    </>
  );
}

export function ScolaProMark({
  className = "size-9",
  title = "ScolaPro",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      role="img"
      aria-label={title}
    >
      <ThemeAwareAsset
        lightSrc={SCOLAPRO_ASSETS.mark.light}
        darkSrc={SCOLAPRO_ASSETS.mark.dark}
        width={84}
        height={126}
        priority
      />
    </span>
  );
}

export function ScolaProWordmark({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex min-w-0 items-center ${className}`}>
      <span
        className={compact ? "relative h-7 w-[126px] shrink-0" : "relative h-8 w-36 shrink-0"}
        role="img"
        aria-label={SCOLAPRO_BRAND.name}
      >
        <ThemeAwareAsset
          lightSrc={SCOLAPRO_ASSETS.wordmark.light}
          darkSrc={SCOLAPRO_ASSETS.wordmark.dark}
          width={561}
          height={126}
          priority
        />
      </span>
      {!compact ? <span className="sr-only">{SCOLAPRO_BRAND.productDescription}</span> : null}
    </span>
  );
}
