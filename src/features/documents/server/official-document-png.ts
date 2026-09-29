import "server-only";

import { inflateRawSync } from "node:zlib";

/**
 * Bounded integrity gate for PNG assets handed to the bundled PDF image decoder.
 *
 * pdf-lib decodes PNG through `@pdf-lib/upng`, whose hand-written deflate loop
 * keeps reading once the declared stream is exhausted. When an asset's deflate
 * payload is truncated or does not match its IHDR geometry, that loop never
 * observes an end-of-stream marker and spins forever inside the request, which
 * blocks the whole Node.js event loop (issue #863: the governed Namib High crest
 * stalled every class-list Preview/Print and PDF export and also wedged every
 * other request served by the same process).
 *
 * A timeout cannot rescue an unbounded synchronous loop, so the only safe
 * boundary is to prove the payload is complete *before* the decoder runs. Native
 * zlib always terminates on the same malformed input, so this gate mirrors the
 * exact byte range `@pdf-lib/upng` inflates and requires the result to equal the
 * declared decoded image size.
 *
 * The gate intentionally performs no chunk CRC or zlib adler32 verification:
 * upstream decoders do not require them, and rejecting an asset for a stale
 * checksum would drop otherwise renderable school marks.
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_HEADER_BYTES = 8;
/** Upper bound for a single decoded image plane. Also bounds native inflate work. */
const MAX_DECODED_PAYLOAD_BYTES = 32 * 1024 * 1024;

type PngHeader = {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  interlace: number;
};

const channelsByColorType: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const adam7Passes: Array<[number, number, number, number]> = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
];

function hasPngSignature(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_HEADER_BYTES) return false;
  return PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

function readPngHeader(bytes: Uint8Array): PngHeader | null {
  // IHDR is required to be the first chunk; anything else is not a readable still image.
  if (bytes.length < 33) return null;
  if (String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]) !== "IHDR") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    width: view.getUint32(16),
    height: view.getUint32(20),
    bitDepth: bytes[24],
    colorType: bytes[25],
    interlace: bytes[28],
  };
}

/** Walks the chunk stream, rejecting fragments whose declared length runs past the file. */
function collectImageData(bytes: Uint8Array): Uint8Array | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fragments: Uint8Array[] = [];
  let offset = PNG_HEADER_BYTES;
  let sawEnd = false;

  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) return null;
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    if (!/^[A-Za-z]{4}$/.test(type)) return null;
    if (type === "IDAT") fragments.push(bytes.subarray(dataStart, dataEnd));
    if (type === "IEND") {
      sawEnd = true;
      break;
    }
    offset = dataEnd + 4;
  }

  if (!sawEnd || !fragments.length) return null;
  let total = 0;
  for (const fragment of fragments) total += fragment.length;
  const joined = new Uint8Array(total);
  let cursor = 0;
  for (const fragment of fragments) {
    joined.set(fragment, cursor);
    cursor += fragment.length;
  }
  return joined;
}

function expectedPayloadBytes(header: PngHeader): number | null {
  const channels = channelsByColorType[header.colorType];
  if (!channels || header.width < 1 || header.height < 1) return null;
  if (![1, 2, 4, 8, 16].includes(header.bitDepth)) return null;

  const bytesPerPixel = Math.max(1, Math.ceil((channels * header.bitDepth) / 8));
  const bitsPerPixel = channels * header.bitDepth;
  if (header.interlace === 0) {
    return header.height * (1 + Math.ceil((header.width * bitsPerPixel) / 8));
  }

  // Adam7 reduces sub-byte samples to one byte per sample.
  const sampleBytes = header.bitDepth < 8 ? 1 : bytesPerPixel;
  let total = 0;
  for (const [xStart, yStart, xStep, yStep] of adam7Passes) {
    const passWidth = Math.ceil((header.width - xStart) / xStep);
    const passHeight = Math.ceil((header.height - yStart) / yStep);
    if (passWidth <= 0 || passHeight <= 0) continue;
    total += passHeight * (1 + passWidth * sampleBytes);
  }
  return total;
}

const verdictCache = new WeakMap<Uint8Array, boolean>();

/**
 * True only when the PNG deflate payload is complete and decodes to exactly the
 * image size declared by IHDR. Any doubt resolves to `false`, so callers skip the
 * optional asset instead of risking an unbounded decode.
 */
export function isBoundedDecodablePng(bytes: Uint8Array | null | undefined): boolean {
  if (!bytes?.length || !hasPngSignature(bytes)) return false;
  const cached = verdictCache.get(bytes);
  if (cached !== undefined) return cached;

  const verdict = evaluatePng(bytes);
  verdictCache.set(bytes, verdict);
  return verdict;
}

function evaluatePng(bytes: Uint8Array): boolean {
  const header = readPngHeader(bytes);
  if (!header) return false;

  const expected = expectedPayloadBytes(header);
  if (expected === null || expected <= 0 || expected > MAX_DECODED_PAYLOAD_BYTES) return false;

  const imageData = collectImageData(bytes);
  // Strip the zlib wrapper header (2) and adler32 trailer (4), mirroring the
  // byte range the bundled PDF decoder inflates.
  if (!imageData || imageData.length <= 6) return false;

  try {
    const decoded = inflateRawSync(imageData.subarray(2, imageData.length - 4));
    return decoded.length === expected;
  } catch {
    return false;
  }
}
