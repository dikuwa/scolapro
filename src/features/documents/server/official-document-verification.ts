import "server-only";

import QRCode from "qrcode";
import { buildOfficialDocumentVerificationPayload } from "../official-document-verification-payload";

export async function renderOfficialDocumentVerificationQrSvg(input: {
  token: string;
  origin: string;
}) {
  const payload = buildOfficialDocumentVerificationPayload(input);
  return QRCode.toString(payload, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 160,
    color: { dark: "#17233B", light: "#FFFFFF" },
  });
}
