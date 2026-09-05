import "server-only";

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const requireFromModule = createRequire(import.meta.url);
let oldEnglishFontBytesPromise: Promise<Uint8Array> | null = null;

export function loadOldEnglishFontBytes(): Promise<Uint8Array> {
  if (!oldEnglishFontBytesPromise) {
    oldEnglishFontBytesPromise = (async () => {
      const fontPath = requireFromModule.resolve(
        "@fontsource/unifrakturcook/files/unifrakturcook-latin-700-normal.woff",
      );
      const bytes = await readFile(fontPath);
      return new Uint8Array(bytes);
    })();
  }
  return oldEnglishFontBytesPromise;
}
