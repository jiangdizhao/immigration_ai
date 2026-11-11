import { deflateRawSync } from "node:zlib";

/**
 * Test-only synthetic document builders for Phase 14-B acceptance tests.
 *
 * These produce genuinely valid ZIP/DOCX and PDF byte streams so the evidence path is
 * exercised against the real Phase 12 native parsers instead of a stub. They are
 * imported only by tests and never by runtime code.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xed_b8_83_20 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xff_ff_ff_ff;
  for (const byte of bytes) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xff_ff_ff_ff) >>> 0;
}

type ZipEntry = { name: string; data: Uint8Array };

/** Build a deflated ZIP archive (the container a real .docx uses). */
export function buildZip(entries: ZipEntry[]): Uint8Array {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, "utf8");
    const stored = deflateRawSync(Buffer.from(entry.data));
    const checksum = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04_03_4b_50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x08_00, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(stored.byteLength, 18);
    local.writeUInt32LE(entry.data.byteLength, 22);
    local.writeUInt16LE(nameBytes.byteLength, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBytes, stored);

    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02_01_4b_50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x08_00, 8);
    directory.writeUInt16LE(8, 10);
    directory.writeUInt32LE(checksum, 16);
    directory.writeUInt32LE(stored.byteLength, 20);
    directory.writeUInt32LE(entry.data.byteLength, 24);
    directory.writeUInt16LE(nameBytes.byteLength, 28);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, nameBytes);

    offset += local.byteLength + nameBytes.byteLength + stored.byteLength;
  }
  const directoryBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06_05_4b_50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directoryBytes.byteLength, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(
    [...chunks, directoryBytes, end].flatMap((c) => [...c])
  );
}

const WORD_NAMESPACE =
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

/** Build a minimal but valid .docx containing the provided paragraphs. */
export function buildDocx(paragraphs: string[]): Uint8Array {
  const xmlEscape = (value: string) =>
    value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
  const body = paragraphs
    .map(
      (paragraph) =>
        `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(paragraph)}</w:t></w:r></w:p>`
    )
    .join("");
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${WORD_NAMESPACE}"><w:body>${body}</w:body></w:document>`;
  return buildZip([
    {
      name: "[Content_Types].xml",
      data: new TextEncoder().encode(
        '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
      ),
    },
    {
      name: "_rels/.rels",
      data: new TextEncoder().encode(
        '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
      ),
    },
    { name: "word/document.xml", data: new TextEncoder().encode(document) },
  ]);
}

const PDF_ESCAPE: Record<string, string> = {
  "(": "\\(",
  ")": "\\)",
  "\\": "\\\\",
};

/** Build a minimal single-page, standard-font PDF with one text run per line. */
export function buildPdf(lines: string[]): Uint8Array {
  const text = lines
    .map((line, index) => {
      const escaped = line.replace(/[()\\]/gu, (character) => {
        return PDF_ESCAPE[character] ?? character;
      });
      return `${index === 0 ? "" : "0 -16 Td "}(${escaped}) Tj`;
    })
    .join(" ");
  const content = `BT /F1 12 Tf 72 720 Td ${text} ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefStart = body.length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    xref += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }
  body += `${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}
