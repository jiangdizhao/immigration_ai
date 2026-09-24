import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const requireFromWorker = createRequire(import.meta.url);
const pdfJsEntry = requireFromWorker.resolve("pdfjs-dist/legacy/build/pdf.mjs");
const bundledFontPath =
  resolve(dirname(fileURLToPath(import.meta.url)), "standard_fonts") + sep;
const packageFontPath =
  resolve(dirname(pdfJsEntry), "../../standard_fonts") + sep;

export const pdfJsSafeOptions = {
  isEvalSupported: false,
  enableXfa: false,
  stopAtErrors: true,
  useSystemFonts: false,
  disableFontFace: true,
  standardFontDataUrl: existsSync(bundledFontPath)
    ? bundledFontPath
    : packageFontPath,
};
