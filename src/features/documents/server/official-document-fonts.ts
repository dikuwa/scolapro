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

/** Shared blackletter school-name font for official school documents. */
export function loadOfficialOldEnglishFontBytes(): Promise<Uint8Array> {
  if (!oldEnglishFontBytesPromise) {
    oldEnglishFontBytesPromise = (async () => {
      const fontPath = join(process.cwd(), ...oldEnglishFontRelativePath);
      const bytes = await readFile(fontPath);
      return new Uint8Array(bytes);
    })();
  }
  return oldEnglishFontBytesPromise;
}
