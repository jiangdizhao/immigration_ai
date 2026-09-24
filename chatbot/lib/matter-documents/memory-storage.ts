// biome-ignore-all lint/suspicious/useAwait: test-only in-memory storage implements the asynchronous production interface.
import type { MatterDocumentStorage } from "./types";

// Deterministic local/test adapter. Runtime routes use the private S3 adapter.
export class MemoryMatterDocumentStorage implements MatterDocumentStorage {
  readonly objects = new Map<string, Uint8Array>();

  async put({ key, body }: Parameters<MatterDocumentStorage["put"]>[0]) {
    this.objects.set(key, body.slice());
  }

  async get({ key }: Parameters<MatterDocumentStorage["get"]>[0]) {
    const body = this.objects.get(key);
    if (!body) {
      throw new Error("Object not found");
    }
    return body.slice();
  }

  async delete({ key }: Parameters<MatterDocumentStorage["delete"]>[0]) {
    this.objects.delete(key);
  }
}
