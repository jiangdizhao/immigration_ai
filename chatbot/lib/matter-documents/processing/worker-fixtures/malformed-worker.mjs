import { parentPort, threadId } from "node:worker_threads";

parentPort?.postMessage({
  type: "result",
  threadId,
  output: { result: "invalid" },
});
