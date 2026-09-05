import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

const oldEnglishFontRelativePath = [
  "node_modules",
  "@fontsource",
  "unifrakturcook",
  "files",
  "unifrakturcook-latin-700-normal.woff",
];
let oldEnglishFontBytesPromise: Promise<Uint8Array> | null = null;

export function loadOldEnglishFontBytes(): Promise<Uint8Array> {
  if (!oldEnglishFontBytesPromise) {
    oldEnglishFontBytesPromise = (async () => {
      // This is a runtime asset read, not a module import. Treating the WOFF as a
      // module makes Turbopack reject it as an unknown module type. The matching
      // next.config output-file tracing rule keeps the font in server deployments.
      const fontPath = join(process.cwd(), ...oldEnglishFontRelativePath);
      const bytes = await readFile(fontPath);
      return new Uint8Array(bytes);
    })();
  }
  return oldEnglishFontBytesPromise;
}
