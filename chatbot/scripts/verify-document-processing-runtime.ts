// biome-ignore-all lint/suspicious/noMisplacedAssertion: this executable verification gate fails closed on runtime contracts.
// biome-ignore-all lint/complexity/noVoid: the top-level catch sets a nonzero command exit status.
// biome-ignore-all lint/suspicious/useAwait: the mocked Vision adapter satisfies an asynchronous provider interface.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { createCanvas } from "@napi-rs/canvas";
import { utils, type WorkBook, write } from "xlsx";
import yazl from "yazl";
import {
  MATTER_DOCUMENT_FORMATS,
  MATTER_DOCUMENT_MIME,
} from "../lib/matter-documents/formats";
import { runParserWorker } from "../lib/matter-documents/processing/parser-worker";
import { processMatterDocument } from "../lib/matter-documents/processing/registry";
import { validateMatterDocument } from "../lib/matter-documents/validation";

type Tier = "small" | "medium" | "large";
type Fixture = { bytes: Uint8Array; expected: string };
const MARKERS: Record<
  Exclude<keyof typeof MATTER_DOCUMENT_MIME, "jpeg" | "png">,
  string
> = {
  pdf: "SYNTHETIC PDF EVIDENCE",
  docx: "SYNTHETIC DOCX EVIDENCE",
  doc: "JSDoc feature showcase",
  txt: "SYNTHETIC TXT EVIDENCE",
  markdown: "SYNTHETIC MARKDOWN EVIDENCE",
  json: "SYNTHETIC JSON EVIDENCE",
  csv: "SYNTHETIC CSV EVIDENCE",
  xlsx: "SYNTHETIC XLSX EVIDENCE",
  xls: "SYNTHETIC XLS EVIDENCE",
};

function makePdf(pages: string[]): Uint8Array {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>"];
  objects.push(
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`
  );
  for (let index = 0; index < pages.length; index += 1) {
    const pageId = 3 + index * 2;
    const streamId = pageId + 1;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents ${streamId} 0 R >>`
    );
    const stream = `BT /F1 12 Tf 20 200 Td (${pages[index]}) Tj ET`;
    objects.push(
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
    );
  }
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    output += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Uint8Array(Buffer.from(output));
}

function makeZip(entries: Record<string, string>): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const archive = new yazl.ZipFile();
    const chunks: Buffer[] = [];
    archive.outputStream.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.outputStream.on("error", reject);
    archive.outputStream.on("end", () =>
      resolve(new Uint8Array(Buffer.concat(chunks)))
    );
    for (const [name, contents] of Object.entries(entries)) {
      archive.addBuffer(Buffer.from(contents), name);
    }
    archive.end();
  });
}

function makeDocx(paragraphs: number, marker: string) {
  const body = Array.from(
    { length: paragraphs },
    (_, index) =>
      `<w:p><w:r><w:t>${marker} paragraph ${index + 1}</w:t></w:r></w:p>`
  ).join("");
  return makeZip({
    "[Content_Types].xml":
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    "_rels/.rels":
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    "word/document.xml": `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
  });
}

function makeImage(format: "jpeg" | "png", width: number, height: number) {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.fillStyle = "#f4f4f4";
  context.fillRect(0, 0, width, height);
  const bytes =
    format === "jpeg"
      ? canvas.toBuffer("image/jpeg")
      : canvas.toBuffer("image/png");
  return new Uint8Array(bytes);
}

function makeWorkbook(rows: number, marker: string, kind: "xlsx" | "xls") {
  const data = [["document marker", "row"]];
  for (let row = 0; row < rows; row += 1) {
    data.push([
      row === 0 ? marker : `synthetic row ${row + 1}`,
      String(row + 1),
    ]);
  }
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, utils.aoa_to_sheet(data), "Synthetic");
  return new Uint8Array(
    write(workbook as WorkBook, {
      type: "buffer",
      bookType: kind === "xlsx" ? "xlsx" : "biff8",
    })
  );
}

async function fixtures(tier: Tier): Promise<Record<string, Fixture>> {
  const scale = { small: 1, medium: 250, large: 2500 }[tier];
  const rows = { small: 5, medium: 500, large: 5000 }[tier];
  const paragraphs = { small: 1, medium: 100, large: 1000 }[tier];
  const pages = { small: 1, medium: 5, large: 25 }[tier];
  const imageSize = {
    small: [16, 16],
    medium: [640, 480],
    large: [1600, 1200],
  }[tier];
  const repeatedLines = Array.from(
    { length: scale },
    (_, index) => `synthetic line ${index + 1}`
  ).join("\n");
  const docBytes = new Uint8Array(
    await readFile("lib/matter-documents/fixtures/legacy-sample.doc")
  );
  const pdfMarker = `${MARKERS.pdf} ${tier}`;
  const docxMarker = `${MARKERS.docx} ${tier}`;
  const xlsxMarker = `${MARKERS.xlsx} ${tier}`;
  const xlsMarker = `${MARKERS.xls} ${tier}`;
  const jsonMarker = `${MARKERS.json} ${tier}`;
  const csvMarker = `${MARKERS.csv} ${tier}`;
  return {
    pdf: {
      bytes: makePdf(
        Array.from(
          { length: pages },
          (_, index) => `${pdfMarker} page ${index + 1}`
        )
      ),
      expected: MARKERS.pdf,
    },
    jpeg: {
      bytes: makeImage("jpeg", imageSize[0], imageSize[1]),
      expected: "SYNTHETIC JPEG VISION TRANSCRIPT",
    },
    png: {
      bytes: makeImage("png", imageSize[0], imageSize[1]),
      expected: "SYNTHETIC PNG VISION TRANSCRIPT",
    },
    docx: {
      bytes: await makeDocx(paragraphs, docxMarker),
      expected: MARKERS.docx,
    },
    doc: { bytes: docBytes, expected: MARKERS.doc },
    txt: {
      bytes: Buffer.from(`${MARKERS.txt} ${tier}\n${repeatedLines}`),
      expected: MARKERS.txt,
    },
    markdown: {
      bytes: Buffer.from(`# ${MARKERS.markdown} ${tier}\n\n${repeatedLines}`),
      expected: MARKERS.markdown,
    },
    json: {
      bytes: Buffer.from(
        JSON.stringify({
          marker: `${jsonMarker}`,
          records: Array.from({ length: rows }, (_, index) => ({
            row: index + 1,
          })),
        })
      ),
      expected: MARKERS.json,
    },
    csv: {
      bytes: Buffer.from(
        `marker,row\n${csvMarker},0\n${Array.from({ length: rows }, (_, index) => `synthetic row ${index + 1},${index + 1}`).join("\n")}`
      ),
      expected: MARKERS.csv,
    },
    xlsx: {
      bytes: makeWorkbook(rows, xlsxMarker, "xlsx"),
      expected: MARKERS.xlsx,
    },
    xls: { bytes: makeWorkbook(rows, xlsMarker, "xls"), expected: MARKERS.xls },
  };
}

function percentile(samples: number[], value: number) {
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil((value / 100) * sorted.length) - 1)];
}

async function verifyTier(
  tier: Tier,
  iterations: number,
  allowPdfFailure: boolean
) {
  const sampleFixtures = await fixtures(tier);
  const failures: string[] = [];
  for (const format of MATTER_DOCUMENT_FORMATS) {
    const fixture = sampleFixtures[format.id];
    const filename = `synthetic.${format.extensions[0].slice(1)}`;
    const durationSamples: number[] = [];
    const initializationSamples: number[] = [];
    const extractionSamples: number[] = [];
    let unitCount = 0;
    try {
      await validateMatterDocument({
        bytes: fixture.bytes,
        declaredMimeType: MATTER_DOCUMENT_MIME[format.id],
        filename,
      });
      for (let iteration = 0; iteration < iterations; iteration += 1) {
        const startedAt = performance.now();
        const isImage = format.id === "jpeg" || format.id === "png";
        let result: Awaited<ReturnType<typeof processMatterDocument>>;
        if (isImage) {
          result = await processMatterDocument({
            format: format.id,
            bytes: fixture.bytes,
            documentId: `runtime-${format.id}-${tier}`,
            vision: {
              async extract(input) {
                assert.equal(input.mediaType, `image/${format.id}`);
                return `SYNTHETIC ${format.id.toUpperCase()} VISION TRANSCRIPT`;
              },
            },
          });
        } else {
          const parsed = await runParserWorker({
            format: format.id,
            bytes: fixture.bytes,
            renderScannedPages: false,
          });
          result = parsed.result;
          if (parsed.timings) {
            initializationSamples.push(parsed.timings.workerInitializationMs);
            extractionSamples.push(parsed.timings.extractionMs);
          }
        }
        durationSamples.push(performance.now() - startedAt);
        unitCount = result.units.length;
        assert.ok(unitCount > 0, `${format.id}: extracted evidence is empty`);
        assert.ok(
          result.units.some((unit) =>
            unit.extractedText.includes(fixture.expected)
          ),
          `${format.id}: expected evidence marker is missing`
        );
        if (isImage) {
          assert.equal(result.method, "vision_fallback");
        }
      }
      if (format.id === "jpeg" || format.id === "png") {
        const degraded = await processMatterDocument({
          format: format.id,
          bytes: fixture.bytes,
          documentId: `runtime-${format.id}-${tier}-no-vision`,
        });
        assert.equal(degraded.status, "needs_review");
        assert.equal(degraded.units.length, 0);
        assert.equal(degraded.errorCode, "vision_unavailable");
      }
      const p50 = percentile(durationSamples, 50);
      const p95 = percentile(durationSamples, 95);
      const estimate =
        iterations >= 20
          ? `p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms n=${iterations}`
          : `single=${p50.toFixed(1)}ms n=${iterations}`;
      const workerStages =
        initializationSamples.length > 0
          ? ` worker_init_p50/p95=${percentile(initializationSamples, 50).toFixed(1)}/${percentile(initializationSamples, 95).toFixed(1)}ms extraction_p50/p95=${percentile(extractionSamples, 50).toFixed(1)}/${percentile(extractionSamples, 95).toFixed(1)}ms`
          : " worker_init/extraction=n/a(vision)";
      console.log(
        `${format.id} ${tier}: PASS units=${unitCount} bytes=${fixture.bytes.byteLength} ${estimate}${workerStages}`
      );
    } catch (error) {
      const code = error instanceof Error ? error.message : "unknown_failure";
      failures.push(`${format.id} ${tier}: ${code}`);
      if (allowPdfFailure && format.id === "pdf") {
        console.log(`${format.id} ${tier}: EXPECTED_BASELINE_FAILURE ${code}`);
      } else {
        console.log(`${format.id} ${tier}: FAIL ${code}`);
      }
    }
  }
  return failures.filter(
    (failure) => !(allowPdfFailure && failure.startsWith("pdf "))
  );
}

async function main() {
  const memoryBefore = process.memoryUsage();
  const benchmark = process.env.DOCUMENT_PROCESSING_BENCHMARK === "1";
  const baseline = process.env.DOCUMENT_PROCESSING_BASELINE === "1";
  const parsedIterations = Number.parseInt(
    process.env.DOCUMENT_PROCESSING_RUNS ?? (benchmark ? "20" : "1"),
    10
  );
  const iterations = Math.max(1, Math.min(parsedIterations || 1, 100));
  const tiers: Tier[] = benchmark ? ["small", "medium", "large"] : ["small"];
  const failures: string[] = [];
  console.log(
    `document parser runtime: node=${process.version} ${process.platform}/${process.arch} runs=${iterations} tiers=${tiers.join(",")}`
  );
  for (const tier of tiers) {
    failures.push(...(await verifyTier(tier, iterations, baseline)));
  }
  if (failures.length > 0) {
    console.error(`FAIL: ${failures.length} format/tier checks failed`);
    process.exitCode = 1;
  } else {
    console.log(
      `PASS: all required production runtime checks (${tiers.length} tiers)`
    );
  }
  const memoryAfter = process.memoryUsage();
  const mib = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);
  console.log(
    `runtime-memory start_rss_mib=${mib(memoryBefore.rss)} end_rss_mib=${mib(memoryAfter.rss)} end_heap_mib=${mib(memoryAfter.heapUsed)} end_external_mib=${mib(memoryAfter.external)} (end-of-run snapshot; peak not sampled)`
  );
}

await main().catch((error: unknown) => {
  console.error(
    `FAIL: document parser runtime verifier: ${error instanceof Error ? error.message : "unknown_failure"}`
  );
  process.exitCode = 1;
});
