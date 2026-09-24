// biome-ignore-all lint/suspicious/noMisplacedAssertion: assertion helper is invoked only from tests.
import assert from "node:assert/strict";
import { test } from "node:test";
import { utils as cfbUtils, write as writeCfb } from "cfb";
import { validateMatterDocument } from "./validation";

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

function zipStored(files: Record<string, string>) {
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
  return Buffer.concat([...local, centralBytes, eocd]);
}

function ooxml(kind: "word" | "excel") {
  const office = kind === "word" ? "word" : "xl";
  const main = kind === "word" ? "document" : "workbook";
  const contentType =
    kind === "word"
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";
  return zipStored({
    "[Content_Types].xml": `<Types><Override PartName="/${office}/${main}.xml" ContentType="${contentType}"/></Types>`,
    [`${office}/${main}.xml`]: "<main/>",
  });
}

function ole(stream: "WordDocument" | "Workbook") {
  const container = cfbUtils.cfb_new();
  cfbUtils.cfb_add(container, stream, Buffer.from("fixture"));
  return Buffer.from(writeCfb(container, { type: "buffer" }));
}

function accepts(filename: string, mime: string, bytes: Uint8Array) {
  return validateMatterDocument({ filename, declaredMimeType: mime, bytes });
}

async function rejects(filename: string, mime: string, bytes: Uint8Array) {
  await assert.rejects(accepts(filename, mime, bytes));
}

test("all initial allowlist formats accept matching bounded fixtures", async () => {
  const fixtures: [string, string, Uint8Array][] = [
    ["record.pdf", "application/pdf", Buffer.from("%PDF-1.7 fixture")],
    ["photo.jpg", "image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0xd9])],
    [
      "scan.png",
      "image/png",
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ],
    ["letter.docx", "application/zip", ooxml("word")],
    ["letter.doc", "application/octet-stream", ole("WordDocument")],
    ["notes.txt", "text/plain", Buffer.from("plain text\n")],
    ["notes.md", "text/plain", Buffer.from("# markdown\n")],
    ["data.json", "application/json", Buffer.from('{"safe":true}')],
    ["data.csv", "text/csv", Buffer.from("name,value\nA,1\n")],
    [
      "data.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ooxml("excel"),
    ],
    ["data.xls", "application/vnd.ms-excel", ole("Workbook")],
  ];
  for (const [filename, mime, bytes] of fixtures) {
    const result = await accepts(filename, mime, bytes);
    assert.equal(result.originalFilename, filename);
    assert.ok(result.mimeType);
  }
});

test("OOXML container identity rejects generic ZIP, swapped extensions and macros", async () => {
  const genericZip = zipStored({ "readme.txt": "not office" });
  await rejects("bad.docx", "application/zip", genericZip);
  await rejects("bad.xlsx", "application/zip", genericZip);
  await rejects("swapped.xlsx", "application/zip", ooxml("word"));
  await rejects("swapped.docx", "application/zip", ooxml("excel"));
  await rejects("macro.docm", "application/zip", ooxml("word"));
  await rejects("macro.xlsm", "application/zip", ooxml("excel"));
});

test("legacy OLE formats require a valid container with the matching Office stream", async () => {
  await rejects("fake.doc", "application/msword", Buffer.from("not OLE"));
  await rejects("fake.xls", "application/vnd.ms-excel", Buffer.from("not OLE"));
  await rejects("wrong.xls", "application/octet-stream", ole("WordDocument"));
  await rejects("wrong.doc", "application/octet-stream", ole("Workbook"));
});

test("text, JSON, MIME and extension checks reject binary or mismatched input", async () => {
  await rejects("binary.txt", "text/plain", Buffer.from([0, 1, 2, 3]));
  await rejects("bad.json", "application/json", Buffer.from("{broken"));
  await rejects("wrong.pdf", "image/jpeg", Buffer.from("%PDF-1.7"));
  await rejects("fake.pdf", "application/pdf", Buffer.from("MZ executable"));
  await rejects("archive.zip", "application/zip", zipStored({ a: "b" }));
  await rejects(
    "notes.txt",
    "application/octet-stream",
    Buffer.from("plain text")
  );
});

test("OOXML and legacy Office accept only tested MIME aliases with strong byte identification", async () => {
  assert.equal(
    (await accepts("letter.docx", "application/octet-stream", ooxml("word")))
      .mimeType,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
  assert.equal(
    (await accepts("letter.doc", "application/x-msword", ole("WordDocument")))
      .mimeType,
    "application/msword"
  );
  await rejects("notes.txt", "application/octet-stream", Buffer.from("text"));
});
