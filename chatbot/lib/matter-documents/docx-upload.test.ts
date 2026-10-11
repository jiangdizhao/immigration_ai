// biome-ignore-all lint/suspicious/noMisplacedAssertion: assertion helper is invoked only from tests.
import assert from "node:assert/strict";
import { test } from "node:test";
import { matterDocumentDisplayStatus } from "./display-status";
import { MATTER_DOCUMENT_MIME } from "./formats";
import { runParserWorker } from "./processing/parser-worker";
import { processMatterDocument } from "./processing/registry";
import { validateMatterDocument } from "./validation";

/**
 * Confirmed production defect: a valid DOCX was rejected with
 * "The file type does not match its extension." because the browser reported a
 * nonstandard `File.type`. These tests pin the corrected boundary: the
 * extension allowlist still applies, the real OOXML Word container identity is
 * verified, and the accepted MIME is normalised server-side.
 */

function crc32(bytes: Uint8Array) {
  let crc = 0xff_ff_ff_ff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xed_b8_83_20 : 0);
    }
  }
  return (crc ^ 0xff_ff_ff_ff) >>> 0;
}

function zipStored(
  files: Record<string, string>,
  options?: { truncate?: boolean }
) {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = Buffer.from(name);
    const data = Buffer.from(content);
    const checksum = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04_03_4b_50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    local.push(header, nameBytes, data);

    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02_01_4b_50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt32LE(checksum, 16);
    directory.writeUInt32LE(data.length, 20);
    directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(nameBytes.length, 28);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, nameBytes);
    offset += header.length + nameBytes.length + data.length;
  }
  const centralBytes = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06_05_4b_50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(centralBytes.length, 12);
  eocd.writeUInt32LE(offset, 16);
  const archive = Buffer.concat([...local, centralBytes, eocd]);
  return options?.truncate ? archive.subarray(0, 40) : archive;
}

const CONTENT_TYPES_HEAD = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"></Default>`;

function wordContainer(text = "Hello DOCX") {
  return zipStored({
    "[Content_Types].xml": `${CONTENT_TYPES_HEAD}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"></Override></Types>`,
    "word/document.xml": `<w:document xmlns:w="urn:w"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
  });
}

function excelContainer() {
  return zipStored({
    "[Content_Types].xml": `${CONTENT_TYPES_HEAD}<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"></Override></Types>`,
    "xl/workbook.xml": "<workbook><sheets/></workbook>",
  });
}

function macroWordContainer() {
  return zipStored({
    "[Content_Types].xml": `${CONTENT_TYPES_HEAD}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"></Override></Types>`,
    "word/document.xml":
      '<w:document xmlns:w="urn:w"><w:body><w:p><w:r><w:t>Macro</w:t></w:r></w:p></w:body></w:document>',
    "word/vbaProject.bin": "MZ macros",
  });
}

async function validate(
  filename: string,
  declaredMimeType: string,
  bytes: Uint8Array
) {
  return await validateMatterDocument({ bytes, declaredMimeType, filename });
}

async function rejects(
  filename: string,
  declaredMimeType: string,
  bytes: Uint8Array
) {
  await assert.rejects(() => validate(filename, declaredMimeType, bytes));
}

test("a valid DOCX is accepted with the standard Word MIME type", async () => {
  const result = await validate(
    "letter.docx",
    MATTER_DOCUMENT_MIME.docx,
    wordContainer()
  );
  assert.equal(result.format.id, "docx");
  assert.equal(result.mimeType, MATTER_DOCUMENT_MIME.docx);
  assert.equal(result.originalFilename, "letter.docx");
});

test("a valid DOCX is accepted for every observed nonstandard browser MIME", async () => {
  const nonstandard = [
    "",
    "application/msword",
    "application/vnd.ms-word",
    "application/vnd.ms-word.document.12",
    "application/x-docx",
    "text/x-docx",
    "application/word",
    "application/octet-stream",
    "binary/octet-stream",
    "application/zip",
    "application/x-zip-compressed",
    "APPLICATION/OCTET-STREAM",
    "application/octet-stream; charset=binary",
    "application/x-unknown-please-accept",
  ];
  for (const declared of nonstandard) {
    const result = await validate("statement.docx", declared, wordContainer());
    assert.equal(result.format.id, "docx", `declared: ${declared}`);
    assert.equal(
      result.mimeType,
      MATTER_DOCUMENT_MIME.docx,
      `declared MIME must be normalised server-side: ${declared}`
    );
  }
});

test("DOCX extension matching is case-insensitive and the filename is normalised", async () => {
  const result = await validate(
    "C:\\\\Users\\\\rico\\\\FORM 956.DOCX",
    "application/x-docx",
    wordContainer()
  );
  assert.equal(result.originalFilename, "FORM 956.DOCX");
  assert.equal(result.format.id, "docx");
});

test("a DOCX accepted through a nonstandard MIME is genuinely extracted by the word worker", async () => {
  const validated = await validate(
    "evidence.docx",
    "application/vnd.ms-word.document.12",
    wordContainer("Extracted Word evidence")
  );
  assert.equal(validated.mimeType, MATTER_DOCUMENT_MIME.docx);

  const parsed = await runParserWorker({
    format: "docx",
    bytes: wordContainer("Extracted Word evidence"),
    renderScannedPages: false,
  });
  assert.ok(parsed.result.units.length > 0);
  assert.match(
    parsed.result.units.map((unit) => unit.extractedText).join("\n"),
    /Extracted Word evidence/u
  );
  assert.equal(
    parsed.result.units.every((unit) => unit.extractionMethod === "native"),
    true
  );
});

test("processing a DOCX with no usable text does not become analysis-ready evidence", async () => {
  const result = await processMatterDocument({
    format: "docx",
    bytes: wordContainer(""),
    documentId: "document-empty-docx",
  });
  const text = result.units.map((unit) => unit.extractedText.trim()).join("");
  assert.equal(text, "");
  assert.equal(
    matterDocumentDisplayStatus({
      processingStatus: "complete",
      runStatus: result.status,
      unitCount: result.units.filter((unit) => unit.extractedText.trim())
        .length,
    }),
    "no_usable_evidence"
  );
});

test("fake DOCX, renamed ZIP files and mismatched Office containers are rejected", async () => {
  await rejects(
    "fake.docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    Buffer.from("plain text pretending to be a DOCX")
  );
  await rejects(
    "renamed.zip.docx",
    "application/x-docx",
    zipStored({ "readme.txt": "not an office document" })
  );
  await rejects(
    "photos.docx",
    "application/octet-stream",
    zipStored({ "holiday.jpg": "binary" })
  );
  await rejects("swapped.docx", "application/zip", excelContainer());
  await rejects("swapped.xlsx", "application/zip", wordContainer());
  await rejects("macro.docm", "application/zip", wordContainer());
  await rejects("macro.dotm", "application/zip", wordContainer());
  await rejects("macro.docx", "application/x-docx", macroWordContainer());
  await rejects(
    "truncated.docx",
    "application/zip",
    zipStored({ a: "b" }, { truncate: true })
  );
  await rejects(
    "image.docx",
    "application/x-docx",
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  );
});

test("a positively conflicting MIME family is still rejected before content inspection", async () => {
  await rejects("letter.docx", "application/pdf", wordContainer());
  await rejects("letter.docx", "image/png", wordContainer());
  await rejects("letter.docx", "text/plain", wordContainer());
  await rejects("letter.pdf", "image/jpeg", Buffer.from("%PDF-1.7"));
  await rejects("notes.txt", "application/octet-stream", Buffer.from("notes"));
  await rejects("records.xlsx", "application/pdf", excelContainer());
});

test("image and text formats keep their signature identity checks", async () => {
  await rejects("fake.pdf", "application/pdf", Buffer.from("MZ executable"));
  await rejects("binary.txt", "text/plain", Buffer.from([0, 1, 2, 3]));
  await rejects("bad.json", "application/json", Buffer.from("{broken"));
  await assert.doesNotReject(() =>
    validate("notes.txt", "text/plain", Buffer.from("plain text\n"))
  );
  await assert.doesNotReject(() =>
    validate(
      "scan.png",
      "image/png",
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    )
  );
});

test("oversized and empty uploads are rejected regardless of MIME", async () => {
  await rejects("empty.docx", "application/x-docx", new Uint8Array(0));
  await rejects(
    "huge.docx",
    "application/x-docx",
    new Uint8Array(25 * 1024 * 1024 + 1)
  );
  await rejects("notes.txt", "text/plain", new Uint8Array(0));
});

test("the display status distinguishes storage success from usable evidence", () => {
  assert.equal(
    matterDocumentDisplayStatus({
      processingStatus: "complete",
      runStatus: "complete",
      unitCount: 4,
    }),
    "available_to_ai"
  );
  assert.equal(
    matterDocumentDisplayStatus({
      processingStatus: "complete",
      runStatus: "complete",
      unitCount: 0,
    }),
    "no_usable_evidence"
  );
  assert.equal(
    matterDocumentDisplayStatus({
      processingStatus: "complete",
      runStatus: "needs_review",
      unitCount: 0,
    }),
    "no_usable_evidence"
  );
  assert.equal(
    matterDocumentDisplayStatus({
      processingStatus: "complete",
      runStatus: "partial",
      unitCount: 2,
    }),
    "incomplete"
  );
  assert.equal(
    matterDocumentDisplayStatus({
      processingStatus: "failed",
      runStatus: "failed",
      unitCount: 0,
    }),
    "failed"
  );
  assert.equal(
    matterDocumentDisplayStatus({
      processingStatus: "processing",
      runStatus: "processing",
      unitCount: 0,
    }),
    "processing"
  );
  assert.equal(
    matterDocumentDisplayStatus({ processingStatus: "not_started" }),
    "not_started"
  );
  // A stored document marked complete without a verified run is never claimed
  // to be AI-usable.
  assert.equal(
    matterDocumentDisplayStatus({ processingStatus: "complete" }),
    "no_usable_evidence"
  );
});
