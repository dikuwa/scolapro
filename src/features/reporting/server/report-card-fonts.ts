import "server-only";

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const requireFromModule = createRequire(import.meta.url);
let oldEnglishFontBytesPromise: Promise<Uint8Array> | null = null;

export function loadOldEnglishFontBytes(): Promise<Uint8Array> {
  if (!oldEnglishFontBytesPromise) {
    oldEnglishFontBytesPromise = (async () => {
      const packagePath = requireFromModule.resolve("@fontsource/unifrakturcook/package.json");
      const fontPath = join(
        dirname(packagePath),
        "files",
        ["unifrakturcook", "latin", "700", "normal"].join("-") + ".woff",
      );
      const bytes = await readFile(fontPath);
      return new Uint8Array(bytes);
    })();
  }
  return oldEnglishFontBytesPromise;
}
