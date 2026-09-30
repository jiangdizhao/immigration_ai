export async function verifyNativeRuntime(adapters) {
  const canvasModule = await adapters.loadCanvas();
  if (
    typeof canvasModule.version !== "string" ||
    canvasModule.version.trim().length === 0
  ) {
    throw new Error("canvas_version_missing");
  }
  const context = canvasModule.createCanvas(1, 1).getContext("2d");
  context.fillRect(0, 0, 1, 1);
  const pixels = context.getImageData(0, 0, 1, 1).data;
  if (pixels.length !== 4 || pixels[3] === 0) {
    throw new Error("canvas_render_failed");
  }
  const parser = await adapters.loadParserRuntime();
  if (
    parser.parserWorkerLoaded !== true ||
    typeof parser.getDocument !== "function" ||
    typeof parser.pdfJsVersion !== "string" ||
    parser.pdfJsVersion.trim().length === 0
  ) {
    throw new Error("parser_runtime_invalid");
  }
  return {
    ...adapters.runtime,
    canvasVersion: canvasModule.version,
    parserWorker: "loaded",
    pdfJsVersion: parser.pdfJsVersion,
    pdfJsApi: "getDocument",
  };
}
