const VERIFICATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;

export function isOfficialDocumentVerificationToken(token: string) {
  return VERIFICATION_TOKEN_PATTERN.test(token);
}

export function officialDocumentVerificationPath(token: string) {
  if (!isOfficialDocumentVerificationToken(token)) {
    throw new Error("Invalid official-document verification token.");
  }
  return `/verify/${token}`;
}

export function buildOfficialDocumentVerificationPayload(input: {
  token: string;
  origin: string;
}) {
  const origin = new URL(input.origin);
  if (origin.protocol !== "https:" && origin.protocol !== "http:") {
    throw new Error("Verification origin must use HTTP or HTTPS.");
  }

  origin.pathname = officialDocumentVerificationPath(input.token);
  origin.search = "";
  origin.hash = "";
  return origin.toString();
}
