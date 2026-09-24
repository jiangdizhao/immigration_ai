import { read as readCfb } from "cfb";
import { type Entry, fromBufferPromise, type ZipFile } from "yauzl";
import {
  MATTER_DOCUMENT_FORMATS,
  MAX_JSON_DOCUMENT_BYTES,
  MAX_MATTER_DOCUMENT_BYTES,
  MAX_OOXML_CONTENT_TYPES_BYTES,
  MAX_OOXML_ENTRIES,
  MAX_OOXML_EXPANDED_BYTES,
  MAX_TEXT_DOCUMENT_BYTES,
  type MatterDocumentFormat,
} from "./formats";

export {
  MAX_JSON_DOCUMENT_BYTES,
  MAX_MATTER_DOCUMENT_BYTES,
  MAX_TEXT_DOCUMENT_BYTES,
} from "./formats";

export const MAX_FILENAME_LENGTH = 255;
const ZIP_SIGNATURE = 0x04_03_4b_50;
const OLE_CFB_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const DOCX_MAIN_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
const XLSX_MAIN_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";

export class MatterDocumentValidationError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "MatterDocumentValidationError";
    this.status = status;
  }
}

export function normalizeOriginalFilename(filename: string): string {
  const basename = filename.replaceAll("\\", "/").split("/").at(-1) ?? "";
  const safe = basename
    .replace(/\p{Cc}/gu, "")
    .trim()
    .slice(0, MAX_FILENAME_LENGTH);
  if (!safe || safe === "." || safe === "..") {
    throw new MatterDocumentValidationError("Choose a valid file name.");
  }
  return safe;
}

function getExtension(filename: string) {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(dot).toLowerCase() : "";
}

function inferSignatureFormat(bytes: Uint8Array): MatterDocumentFormat | null {
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    return (
      MATTER_DOCUMENT_FORMATS.find((format) => format.id === "pdf") ?? null
    );
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return (
      MATTER_DOCUMENT_FORMATS.find((format) => format.id === "jpeg") ?? null
    );
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return (
      MATTER_DOCUMENT_FORMATS.find((format) => format.id === "png") ?? null
    );
  }
  return null;
}

function decodeUtf8Text(bytes: Uint8Array, maxBytes: number): string {
  if (bytes.byteLength > maxBytes) {
    throw new MatterDocumentValidationError(
      "This text file exceeds its size limit.",
      413
    );
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new MatterDocumentValidationError(
      "Text files must use valid UTF-8 encoding."
    );
  }
  let suspiciousControls = 0;
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (code === 0) {
      throw new MatterDocumentValidationError(
        "The selected file does not appear to be a text document."
      );
    }
    if (
      (code < 32 && code !== 9 && code !== 10 && code !== 12 && code !== 13) ||
      code === 127
    ) {
      suspiciousControls += 1;
    }
  }
  if (text.length > 0 && suspiciousControls / text.length > 0.01) {
    throw new MatterDocumentValidationError(
      "The selected file does not appear to be a text document."
    );
  }
  return text;
}

async function readZipTextEntry(zip: ZipFile, entry: Entry): Promise<string> {
  if (
    entry.uncompressedSize > MAX_OOXML_CONTENT_TYPES_BYTES ||
    entry.compressedSize > MAX_OOXML_CONTENT_TYPES_BYTES
  ) {
    throw new MatterDocumentValidationError("The Office container is invalid.");
  }
  const stream = await zip.openReadStreamPromise(entry);
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const item of stream) {
    const chunk = Buffer.isBuffer(item) ? item : Buffer.from(item);
    total += chunk.byteLength;
    if (total > MAX_OOXML_CONTENT_TYPES_BYTES) {
      stream.destroy();
      throw new MatterDocumentValidationError(
        "The Office container is invalid."
      );
    }
    chunks.push(chunk);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks, total)
    );
  } catch {
    throw new MatterDocumentValidationError("The Office container is invalid.");
  }
}

async function validateOoxmlContainer(
  bytes: Uint8Array,
  kind: "docx" | "xlsx"
): Promise<void> {
  if (
    bytes.byteLength < 4 ||
    Buffer.from(bytes).readUInt32LE(0) !== ZIP_SIGNATURE
  ) {
    throw new MatterDocumentValidationError("Upload a valid Office document.");
  }

  let zip: ZipFile;
  try {
    zip = await fromBufferPromise(Buffer.from(bytes), {
      autoClose: true,
      decodeStrings: true,
      lazyEntries: true,
      strictFileNames: true,
      validateEntrySizes: true,
    });
  } catch {
    throw new MatterDocumentValidationError("The Office container is invalid.");
  }

  const names = new Set<string>();
  let entryCount = 0;
  let expandedTotal = 0;
  let contentTypes: string | null = null;
  let failed: Error | null = null;
  try {
    for await (const entry of zip.eachEntry()) {
      entryCount += 1;
      expandedTotal += entry.uncompressedSize;
      if (
        entryCount > MAX_OOXML_ENTRIES ||
        expandedTotal > MAX_OOXML_EXPANDED_BYTES ||
        entry.isEncrypted()
      ) {
        throw new MatterDocumentValidationError(
          "The Office container is invalid."
        );
      }
      const normalizedName = entry.fileName.replaceAll("\\", "/");
      if (names.has(normalizedName)) {
        throw new MatterDocumentValidationError(
          "The Office container is invalid."
        );
      }
      names.add(normalizedName);
      if (/^vbaProject\.bin$/i.test(normalizedName.split("/").at(-1) ?? "")) {
        throw new MatterDocumentValidationError(
          "Macro-enabled Office files are not supported."
        );
      }
      if (normalizedName === "[Content_Types].xml") {
        contentTypes = await readZipTextEntry(zip, entry);
      }
      if (
        normalizedName.startsWith("/") ||
        normalizedName.split("/").includes("..")
      ) {
        throw new MatterDocumentValidationError(
          "The Office container is invalid."
        );
      }
    }
  } catch (error) {
    failed =
      error instanceof Error
        ? error
        : new MatterDocumentValidationError("The Office container is invalid.");
  } finally {
    zip.close();
  }
  if (failed) {
    if (failed instanceof MatterDocumentValidationError) {
      throw failed;
    }
    throw new MatterDocumentValidationError("The Office container is invalid.");
  }

  const expectedMain =
    kind === "docx" ? "word/document.xml" : "xl/workbook.xml";
  const wrongMain = kind === "docx" ? "xl/workbook.xml" : "word/document.xml";
  const expectedContentType =
    kind === "docx" ? DOCX_MAIN_CONTENT_TYPE : XLSX_MAIN_CONTENT_TYPE;
  if (
    !names.has("[Content_Types].xml") ||
    !names.has(expectedMain) ||
    names.has(wrongMain) ||
    !contentTypes?.includes(expectedContentType)
  ) {
    throw new MatterDocumentValidationError(
      `Upload a valid ${kind.toUpperCase()} Office document.`
    );
  }
}

function hasOleSignature(bytes: Uint8Array) {
  return (
    bytes.byteLength >= OLE_CFB_SIGNATURE.length &&
    OLE_CFB_SIGNATURE.every((byte, index) => bytes[index] === byte)
  );
}

function validateOleContainer(bytes: Uint8Array, kind: "doc" | "xls") {
  if (!hasOleSignature(bytes)) {
    throw new MatterDocumentValidationError(
      "Upload a valid legacy Office document."
    );
  }
  try {
    const container = readCfb(Buffer.from(bytes), {
      type: "buffer",
      WTF: true,
    });
    const streamNames = container.FileIndex.filter(
      (entry) => entry.type === 2
    ).map((entry) => entry.name.toLowerCase());
    const isWord = streamNames.includes("worddocument");
    const isExcel =
      streamNames.includes("workbook") || streamNames.includes("book");
    if (
      (kind === "doc" && (!isWord || isExcel)) ||
      (kind === "xls" && (!isExcel || isWord))
    ) {
      throw new MatterDocumentValidationError(
        `Upload a valid legacy ${kind.toUpperCase()} document.`
      );
    }
  } catch (error) {
    if (error instanceof MatterDocumentValidationError) {
      throw error;
    }
    throw new MatterDocumentValidationError(
      "The legacy Office container is invalid."
    );
  }
}

function validateStrategy(bytes: Uint8Array, format: MatterDocumentFormat) {
  switch (format.validationStrategy) {
    case "signature": {
      const detected = inferSignatureFormat(bytes);
      if (!detected || detected.id !== format.id) {
        throw new MatterDocumentValidationError(
          "The file content does not match its extension and type."
        );
      }
      return;
    }
    case "ole_cfb":
      validateOleContainer(bytes, format.id as "doc" | "xls");
      return;
    case "utf8_text":
      decodeUtf8Text(bytes, MAX_TEXT_DOCUMENT_BYTES);
      return;
    case "json": {
      const text = decodeUtf8Text(bytes, MAX_JSON_DOCUMENT_BYTES);
      try {
        JSON.parse(text);
      } catch {
        throw new MatterDocumentValidationError("Upload valid JSON content.");
      }
      return;
    }
    case "ooxml_zip":
      return validateOoxmlContainer(bytes, format.id as "docx" | "xlsx");
    default: {
      const exhaustive: never = format.validationStrategy;
      throw new Error(`Unknown validation strategy: ${exhaustive}`);
    }
  }
}

export async function validateMatterDocument(input: {
  bytes: Uint8Array;
  declaredMimeType: string;
  filename: string;
}): Promise<{
  format: MatterDocumentFormat;
  mimeType: MatterDocumentFormat["canonicalMimeType"];
  originalFilename: string;
}> {
  if (input.bytes.byteLength === 0) {
    throw new MatterDocumentValidationError("The selected file is empty.");
  }
  if (input.bytes.byteLength > MAX_MATTER_DOCUMENT_BYTES) {
    throw new MatterDocumentValidationError(
      "Files must be 25 MiB or smaller.",
      413
    );
  }

  const originalFilename = normalizeOriginalFilename(input.filename);
  const extension = getExtension(originalFilename);
  const format = MATTER_DOCUMENT_FORMATS.find((item) =>
    item.extensions.includes(extension)
  );
  if (!format) {
    throw new MatterDocumentValidationError(
      "Supported files are PDF, JPEG, PNG, DOCX, DOC, TXT, MD, JSON, CSV, XLSX, and XLS."
    );
  }

  const declaredMimeType = input.declaredMimeType
    .split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  const mimeAllowed =
    format.acceptedMimeTypes.includes(declaredMimeType ?? "") &&
    (declaredMimeType !== "application/octet-stream" ||
      (format.allowOctetStream === true &&
        (format.validationStrategy === "ooxml_zip" ||
          format.validationStrategy === "ole_cfb")));
  if (!mimeAllowed) {
    throw new MatterDocumentValidationError(
      "The file type does not match its extension."
    );
  }

  await validateStrategy(input.bytes, format);
  return {
    format,
    mimeType: format.canonicalMimeType,
    originalFilename,
  };
}
