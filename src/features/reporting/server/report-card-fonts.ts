import "server-only";

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const requireFromModule = createRequire(import.meta.url);
const oldEnglishFontAsset = "@fontsource/unifrakturcook/files/unifrakturcook-latin-700-normal.woff";
let oldEnglishFontBytesPromise: Promise<Uint8Array> | null = null;

export function loadOldEnglishFontBytes(): Promise<Uint8Array> {
  if (!oldEnglishFontBytesPromise) {
    oldEnglishFontBytesPromise = (async () => {
      // Resolve the exported font asset directly. Resolving package.json first is
      // unnecessary and can be treated as an unresolved module by Next/Turbopack
      // when a local install has changed since the dependency was added.
      const fontPath = requireFromModule.resolve(oldEnglishFontAsset);
      const bytes = await readFile(fontPath);
      return new Uint8Array(bytes);
    })();
  }
  return oldEnglishFontBytesPromise;
}
