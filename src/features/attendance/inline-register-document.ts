export type InlineRegisterDocumentSelection = {
  schoolId: string;
  classId: string;
  date: string;
  mode: "week" | "range" | "term";
  termId: string;
  fromWeek: string | null;
  toWeek: string | null;
};

export type InlineRegisterDocument = {
  identity: string;
  html: string;
  pdfBase64: string;
  fileName: string;
};

const resolvedDocuments = new Map<string, Promise<InlineRegisterDocument>>();

export function inlineRegisterDocumentKey(selection: InlineRegisterDocumentSelection) {
  const period = selection.mode === "term"
    ? "term"
    : selection.mode === "range"
      ? `${selection.fromWeek ?? ""}:${selection.toWeek ?? ""}`
      : selection.fromWeek ?? "";

  return [selection.schoolId, selection.classId, selection.termId, selection.mode, period].join(":");
}

function inlineRegisterDocumentUrl(selection: InlineRegisterDocumentSelection) {
  const params = new URLSearchParams({
    school: selection.schoolId,
    class: selection.classId,
    date: selection.date,
    mode: selection.mode,
    term: selection.termId,
    format: "bundle",
  });
  if (selection.mode !== "term" && selection.fromWeek) params.set("fromWeek", selection.fromWeek);
  if (selection.mode === "range" && selection.toWeek) params.set("toWeek", selection.toWeek);
  return `/api/attendance/register-teacher?${params.toString()}`;
}

async function responseError(response: Response) {
  const payload = await response.json().catch(() => null) as { error?: unknown } | null;
  return typeof payload?.error === "string" && payload.error.trim()
    ? payload.error
    : "The register document could not be prepared.";
}

function abortableDocument(request: Promise<InlineRegisterDocument>, signal?: AbortSignal) {
  if (!signal) return request;
  return new Promise<InlineRegisterDocument>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("This register document request was superseded.", "AbortError"));
      return;
    }
    const onAbort = () => reject(new DOMException("This register document request was superseded.", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    request.then(
      (document) => {
        signal.removeEventListener("abort", onAbort);
        resolve(document);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

export function resolveInlineRegisterDocument(
  selection: InlineRegisterDocumentSelection,
  signal?: AbortSignal,
) {
  const key = inlineRegisterDocumentKey(selection);
  const cached = resolvedDocuments.get(key);
  if (cached) return abortableDocument(cached, signal);

  const request = fetch(inlineRegisterDocumentUrl(selection), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  }).then(async (response) => {
    if (!response.ok) throw new Error(await responseError(response));
    return response.json() as Promise<InlineRegisterDocument>;
  });

  resolvedDocuments.set(key, request);
  void request.catch(() => {
    if (resolvedDocuments.get(key) === request) resolvedDocuments.delete(key);
  });
  return abortableDocument(request, signal);
}

export function invalidateInlineRegisterDocument(selection: InlineRegisterDocumentSelection) {
  resolvedDocuments.delete(inlineRegisterDocumentKey(selection));
}
