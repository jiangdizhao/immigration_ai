import { SaxesParser } from "saxes";
import WordExtractor from "word-extractor";
import { read, utils, type WorkBook } from "xlsx";
import { type Entry, fromBufferPromise, type ZipFile } from "yauzl";
import { DOCUMENT_PROCESSING_LIMITS, ProcessingLimitError } from "./limits";
import { createUnitCollector, finishCollected } from "./text";
import type { ProcessingResult } from "./types";

async function readZipEntry(
  zip: ZipFile,
  entry: Entry,
  maxBytes: number
): Promise<Uint8Array> {
  if (entry.uncompressedSize > maxBytes || entry.isEncrypted()) {
    throw new ProcessingLimitError();
  }
  const stream = await zip.openReadStreamPromise(entry);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const part of stream) {
    const chunk = Buffer.from(part);
    size += chunk.length;
    if (size > maxBytes) {
      stream.destroy();
      throw new ProcessingLimitError();
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

async function unzipEntries(
  bytes: Uint8Array
): Promise<Map<string, Uint8Array>> {
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
    throw new Error("malformed_document");
  }
  const result = new Map<string, Uint8Array>();
  let total = 0;
  let count = 0;
  try {
    for await (const entry of zip.eachEntry()) {
      count += 1;
      total += entry.uncompressedSize;
      if (
        count > 4096 ||
        total > DOCUMENT_PROCESSING_LIMITS.zipExpandedBytes ||
        entry.isEncrypted()
      ) {
        throw new ProcessingLimitError();
      }
      const name = entry.fileName.replaceAll("\\", "/");
      if (name.startsWith("/") || name.split("/").includes("..")) {
        throw new Error("malformed_document");
      }
      if (name === "word/document.xml") {
        result.set(
          name,
          await readZipEntry(
            zip,
            entry,
            DOCUMENT_PROCESSING_LIMITS.docxXmlBytes
          )
        );
      }
    }
  } finally {
    zip.close();
  }
  if (!result.has("word/document.xml")) {
    throw new Error("malformed_document");
  }
  return result;
}

export async function extractDocx(
  bytes: Uint8Array
): Promise<ProcessingResult> {
  const entries = await unzipEntries(bytes);
  const xml = new TextDecoder("utf-8", { fatal: true }).decode(
    entries.get("word/document.xml")
  );
  const parser = new SaxesParser({ xmlns: false });
  const collector = createUnitCollector();
  let paragraph = 0;
  let table = 0;
  let row = 0;
  let inParagraph = false;
  let inTable = false;
  let current = "";
  parser.on("opentag", ({ name }) => {
    if (name === "w:tbl") {
      inTable = true;
      table += 1;
      if (table > DOCUMENT_PROCESSING_LIMITS.docxTableCount) {
        throw new ProcessingLimitError();
      }
    }
    if (name === "w:tr" && inTable) {
      row += 1;
    }
    if (name === "w:p") {
      paragraph += 1;
      inParagraph = true;
      current = "";
      if (paragraph > DOCUMENT_PROCESSING_LIMITS.docxBlocks) {
        throw new ProcessingLimitError();
      }
    }
    if (name === "w:tab") {
      current += "\t";
    }
    if (name === "w:br" || name === "w:cr") {
      current += "\n";
    }
  });
  parser.on("text", (value) => {
    if (inParagraph) {
      current += value;
    }
  });
  parser.on("closetag", ({ name }) => {
    if (name === "w:p") {
      if (current.trim()) {
        collector.add(
          {
            kind: "document_block",
            paragraphStart: paragraph,
            paragraphEnd: paragraph,
          },
          current,
          inTable ? { table, row } : {}
        );
      }
      inParagraph = false;
    }
    if (name === "w:tbl") {
      inTable = false;
    }
  });
  try {
    parser.write(xml).close();
  } catch (error) {
    if (error instanceof ProcessingLimitError) {
      throw error;
    }
    throw new Error("malformed_document");
  }
  return finishCollected(collector);
}

export async function extractDoc(bytes: Uint8Array): Promise<ProcessingResult> {
  let doc: Awaited<ReturnType<InstanceType<typeof WordExtractor>["extract"]>>;
  try {
    doc = await new WordExtractor().extract(Buffer.from(bytes));
  } catch {
    throw new Error("malformed_document");
  }
  const text = doc.getBody();
  const collector = createUnitCollector();
  const paragraphs = text.split(/\r\n|\n|\r/);
  for (let index = 0; index < paragraphs.length; index += 1) {
    const value = paragraphs[index] ?? "";
    if (!value.trim()) {
      continue;
    }
    collector.add(
      {
        kind: "document_block",
        paragraphStart: index + 1,
        paragraphEnd: index + 1,
      },
      value
    );
    if (collector.truncated) {
      break;
    }
  }
  return finishCollected(collector);
}

async function assertSpreadsheetZipBound(bytes: Uint8Array): Promise<void> {
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
    throw new Error("malformed_document");
  }
  let count = 0;
  let expandedBytes = 0;
  try {
    for await (const entry of zip.eachEntry()) {
      count += 1;
      expandedBytes += entry.uncompressedSize;
      if (
        count > 4096 ||
        expandedBytes > DOCUMENT_PROCESSING_LIMITS.zipExpandedBytes ||
        entry.isEncrypted()
      ) {
        throw new ProcessingLimitError();
      }
    }
  } finally {
    zip.close();
  }
}

export async function extractSpreadsheet(
  bytes: Uint8Array,
  format: "xls" | "xlsx"
): Promise<ProcessingResult> {
  if (format === "xlsx") {
    await assertSpreadsheetZipBound(bytes);
  }
  let workbook: WorkBook;
  try {
    workbook = read(Buffer.from(bytes), {
      type: "buffer",
      raw: true,
      cellFormula: false,
      cellHTML: false,
      cellStyles: false,
      bookVBA: false,
      bookFiles: false,
      WTF: true,
      sheetRows: DOCUMENT_PROCESSING_LIMITS.spreadsheetRows,
    });
  } catch {
    throw new Error("malformed_document");
  }
  if (
    workbook.SheetNames.length > DOCUMENT_PROCESSING_LIMITS.spreadsheetSheets
  ) {
    throw new ProcessingLimitError();
  }
  const collector = createUnitCollector();
  let cellTotal = 0;
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const ref = sheet?.["!ref"];
    if (!sheet || !ref) {
      continue;
    }
    let range: ReturnType<typeof utils.decode_range>;
    try {
      const fullref =
        (sheet as typeof sheet & { "!fullref"?: string })["!fullref"] ?? ref;
      range = utils.decode_range(fullref);
    } catch {
      throw new Error("malformed_document");
    }
    const rows = range.e.r - range.s.r + 1;
    const cols = range.e.c - range.s.c + 1;
    if (
      rows > DOCUMENT_PROCESSING_LIMITS.spreadsheetRows ||
      rows * cols > DOCUMENT_PROCESSING_LIMITS.spreadsheetCells
    ) {
      throw new ProcessingLimitError();
    }
    cellTotal += rows * cols;
    if (cellTotal > DOCUMENT_PROCESSING_LIMITS.spreadsheetCells) {
      throw new ProcessingLimitError();
    }
    for (let row = range.s.r; row <= range.e.r; row += 40) {
      const rowEnd = Math.min(range.e.r, row + 39);
      const values: unknown[][] = [];
      for (let r = row; r <= rowEnd; r += 1) {
        const cells: unknown[] = [];
        for (let col = range.s.c; col <= range.e.c; col += 1) {
          const cell = sheet[utils.encode_cell({ r, c: col })];
          cells.push(cell?.v === undefined ? "" : cell.v);
        }
        values.push(cells);
      }
      collector.add(
        {
          kind: "sheet_rows",
          sheetName,
          rowStart: row + 1,
          rowEnd: rowEnd + 1,
        },
        JSON.stringify(values),
        { formulasEvaluated: false }
      );
      if (collector.truncated) {
        break;
      }
    }
  }
  return finishCollected(collector);
}
