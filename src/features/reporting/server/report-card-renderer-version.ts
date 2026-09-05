import "server-only";

/**
 * Version of the derived report-card renderer, independent from the immutable
 * snapshot/template contract. Bump this when PDF/HTML rendering changes require
 * fresh artifacts for an otherwise unchanged certified snapshot.
 */
export const REPORT_CARD_RENDERER_VERSION = "SCOLAPRO_TERM_REPORT_RENDERER_V3";
