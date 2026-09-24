import { parentPort, threadId } from "node:worker_threads";

const secretProbe = process.env.MATTER_DOCUMENT_WORKER_SECRET_PROBE;
const openAiKey = process.env.OPENAI_API_KEY;
parentPort?.postMessage({
  type: "result",
  threadId,
  output: {
    result: {
      status: "complete",
      method: "native",
      units: [
        {
          locator: { kind: "lines", lineStart: 1, lineEnd: 1 },
          extractedText: secretProbe ?? "probe-absent",
          extractionMethod: "native",
          provenance: {
            secretProbeAbsent: secretProbe === undefined,
            openAiKeyAbsent: openAiKey === undefined,
          },
        },
      ],
      truncated: false,
    },
    pendingVisionPages: [],
  },
});
