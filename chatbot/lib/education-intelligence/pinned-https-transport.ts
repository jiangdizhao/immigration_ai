import type { LookupAddress } from "node:dns";
import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";
import { isIP } from "node:net";
import type {
  AcquisitionDnsResolver,
  AcquisitionTransportResponse,
  PinnedAcquisitionTransport,
} from "./acquisition-core";

function error(code: string): NodeJS.ErrnoException {
  const failure = new Error(code) as NodeJS.ErrnoException;
  failure.code = code;
  return failure;
}

/** DNS is resolved once by acquisition-core and only those addresses are dialed. */
export function pinnedLookup(
  expectedHostname: string,
  addresses: readonly string[]
): LookupFunction {
  const normalizedHost = expectedHostname.toLowerCase();
  const records: LookupAddress[] = addresses.map((address) => {
    const family = isIP(address);
    if (family !== 4 && family !== 6) {
      throw error("EDNSINVALID");
    }
    return { address, family };
  });
  if (records.length === 0) {
    throw error("ENOTFOUND");
  }

  return ((
    hostname: string,
    options: unknown,
    callback: (...args: unknown[]) => void
  ) => {
    if (hostname.toLowerCase() !== normalizedHost) {
      callback(error("EDNSMISMATCH"));
      return;
    }
    const all = Boolean(
      options &&
        typeof options === "object" &&
        "all" in options &&
        (options as { all?: unknown }).all === true
    );
    if (all) {
      callback(null, records);
      return;
    }
    callback(null, records[0]?.address, records[0]?.family);
  }) as LookupFunction;
}

export const educationDnsResolver: AcquisitionDnsResolver = {
  async resolve(hostname, signal) {
    if (signal.aborted) {
      throw error("ABORT_ERR");
    }
    const records = await dnsLookup(hostname, { all: true, verbatim: true });
    if (signal.aborted) {
      throw error("ABORT_ERR");
    }
    return records.map((record) => record.address);
  },
};

function responseHeaders(
  rawHeaders: readonly string[]
): Record<string, string> {
  const headers: Record<string, string> = Object.create(null) as Record<
    string,
    string
  >;
  for (let index = 0; index < rawHeaders.length; index += 2) {
    const name = rawHeaders[index];
    const value = rawHeaders[index + 1];
    if (!name || value === undefined || name.toLowerCase() in headers) {
      throw error("EINVALIDHEADERS");
    }
    headers[name] = value;
  }
  return headers;
}

export const pinnedHttpsTransport: PinnedAcquisitionTransport = {
  capabilities: {
    pinsResolvedAddress: true,
    validatesTlsHostname: true,
    followsRedirects: false,
    automaticDecompression: false,
  },
  request(input): Promise<AcquisitionTransportResponse> {
    return new Promise((resolve, reject) => {
      let url: URL;
      try {
        url = new URL(input.url);
      } catch {
        reject(error("EINVAL"));
        return;
      }
      if (
        url.protocol !== "https:" ||
        url.hostname.toLowerCase() !== input.hostname.toLowerCase() ||
        url.username ||
        url.password ||
        (url.port && url.port !== "443")
      ) {
        reject(error("EACCES"));
        return;
      }

      const request = httpsRequest(
        url,
        {
          method: "GET",
          headers: input.headers,
          agent: false,
          lookup: pinnedLookup(input.hostname, input.resolvedAddresses),
          servername: input.hostname,
          rejectUnauthorized: true,
          signal: input.signal,
          maxHeaderSize: 32 * 1024,
        },
        (response) => {
          let headers: Record<string, string>;
          try {
            headers = responseHeaders(response.rawHeaders);
          } catch (failure) {
            response.destroy();
            reject(failure);
            return;
          }
          resolve({
            status: response.statusCode ?? 0,
            headers,
            connectedAddress: response.socket.remoteAddress ?? "",
            body: response,
          });
        }
      );
      request.once("error", reject);
      request.end();
    });
  },
};
