import "server-only";

/** Immutable report-card snapshot/template identity. This is intentionally separate
 * from REPORT_CARD_RENDERER_VERSION, which may advance when only derived HTML/PDF
 * rendering changes.
 */
export const REPORT_CARD_TEMPLATE_KEY = "TERM_REPORT";
export const REPORT_CARD_SNAPSHOT_TEMPLATE_VERSION = "SCOLAPRO_TERM_REPORT_V1";
