import { isIP } from "node:net";
import { canonicalizeEducationUrl } from "./identity";
import {
  type EducationSourceManifest,
  type ManifestIssue,
  type ManifestValidationOptions,
  manifestPathIsAllowed,
  validateEducationSourceManifest,
} from "./source-manifest";

export type AcquisitionBlockCode =
  | "INVALID_MANIFEST"
  | "SOURCE_NOT_APPROVED"
  | "URL_OUT_OF_SCOPE"
  | "UNSAFE_URL"
  | "UNSAFE_DNS"
  | "UNSAFE_TRANSPORT";

export class AcquisitionPolicyError extends Error {
  readonly code: AcquisitionBlockCode;
  readonly issues: readonly ManifestIssue[];

  constructor(
    code: AcquisitionBlockCode,
    message: string,
    issues: readonly ManifestIssue[] = []
  ) {
    super(message);
    this.name = "AcquisitionPolicyError";
    this.code = code;
    this.issues = issues;
  }
}

export function validateManifestForAcquisition(
  manifest: unknown,
  assessedAt: string,
  options: Omit<ManifestValidationOptions, "assessedAt" | "forAcquisition"> = {}
): asserts manifest is EducationSourceManifest {
  const result = validateEducationSourceManifest(manifest, {
    ...options,
    assessedAt,
    forAcquisition: true,
  });
  if (!result.ok) {
    const approvalOnly = result.issues.every(
      (issue) => issue.code === "SOURCE_NOT_APPROVED"
    );
    throw new AcquisitionPolicyError(
      approvalOnly ? "SOURCE_NOT_APPROVED" : "INVALID_MANIFEST",
      approvalOnly
        ? "Source is not approved for acquisition."
        : "Source manifest failed policy validation.",
      result.issues
    );
  }
}

function isUnsafeIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true;
  }
  const [a, b, c] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 &&
      (b === 0 ||
        b === 168 ||
        (b === 88 && c === 99) ||
        (b === 0 && c === 2))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function ipv6Groups(address: string): number[] | undefined {
  let normalized = address.toLowerCase().split("%")[0];
  if (!normalized || isIP(normalized) !== 6) {
    return undefined;
  }
  const lastColon = normalized.lastIndexOf(":");
  const ipv4Tail = normalized.slice(lastColon + 1);
  if (ipv4Tail.includes(".")) {
    if (isIP(ipv4Tail) !== 4) {
      return undefined;
    }
    const octets = ipv4Tail.split(".").map(Number);
    normalized = `${normalized.slice(0, lastColon + 1)}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  const halves = normalized.split("::");
  if (halves.length > 2) {
    return undefined;
  }
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) {
    return undefined;
  }
  const groups = [
    ...left,
    ...Array.from({ length: missing }, () => "0"),
    ...right,
  ].map((part) => Number.parseInt(part || "0", 16));
  return groups.length === 8 &&
    groups.every(
      (part) => Number.isInteger(part) && part >= 0 && part <= 0xff_ff
    )
    ? groups
    : undefined;
}

export function isUnsafeResolvedAddress(address: string): boolean {
  if (address.includes("%")) {
    return true;
  }
  const normalized = address.toLowerCase().split("%")[0];
  const version = isIP(normalized);
  if (version === 4) {
    return isUnsafeIpv4(normalized);
  }
  if (version !== 6) {
    return true;
  }
  const groups = ipv6Groups(normalized);
  if (!groups) {
    return true;
  }
  const [first, second, _third, _fourth, fifth, sixth, seventh, eighth] =
    groups;
  const mappedIpv4 =
    groups.slice(0, 5).every((part) => part === 0) &&
    fifth === 0 &&
    sixth === 0xff_ff;
  if (mappedIpv4) {
    return isUnsafeIpv4(
      `${seventh >> 8}.${seventh & 255}.${eighth >> 8}.${eighth & 255}`
    );
  }
  // Only global-unicast 2000::/3 is permitted; documentation and transition
  // ranges are excluded, as are private, loopback, link-local and multicast.
  const globalUnicast = (first & 0xe0_00) === 0x20_00;
  const documentation = first === 0x20_01 && second === 0x0d_b8;
  const teredo = first === 0x20_01 && second === 0;
  const benchmark = first === 0x20_01 && second === 2;
  const orchid = first === 0x20_01 && (second & 0xff_f0) === 0x20;
  return (
    !globalUnicast ||
    documentation ||
    teredo ||
    benchmark ||
    orchid ||
    (first === 0x20_01 && second === 0x00_10)
  );
}

function safeScopedPath(pathname: string): boolean {
  if (/%(?:2f|5c)/i.test(pathname)) {
    return false;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  let containsControlCharacter = false;
  for (let index = 0; index < decoded.length; index += 1) {
    const code = decoded.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) {
      containsControlCharacter = true;
      break;
    }
  }
  if (decoded.includes("\\") || containsControlCharacter) {
    return false;
  }
  return !decoded.split("/").some((part) => part === "." || part === "..");
}

export function canonicalizeManifestUrl(
  manifest: EducationSourceManifest,
  rawUrl: string
): string {
  let canonical: string;
  try {
    canonical = canonicalizeEducationUrl(rawUrl);
  } catch {
    throw new AcquisitionPolicyError(
      "UNSAFE_URL",
      "URL is not a permitted public HTTPS URL."
    );
  }
  const parsed = new URL(canonical);
  if (
    parsed.username ||
    parsed.password ||
    parsed.port ||
    !manifest.approvedHosts.includes(parsed.hostname) ||
    !safeScopedPath(parsed.pathname) ||
    !manifestPathIsAllowed(manifest, parsed.pathname)
  ) {
    throw new AcquisitionPolicyError(
      "URL_OUT_OF_SCOPE",
      "URL is outside the manifest host or path scope."
    );
  }
  return canonical;
}

export function assertSafeResolvedAddresses(
  addresses: readonly string[]
): readonly string[] {
  if (
    addresses.length === 0 ||
    addresses.length > 32 ||
    addresses.some(isUnsafeResolvedAddress)
  ) {
    throw new AcquisitionPolicyError(
      "UNSAFE_DNS",
      "DNS resolution did not produce an exclusively public address set."
    );
  }
  return [...new Set(addresses)];
}

export function assertConnectionPinning(transport: {
  readonly pinsResolvedAddress: boolean;
  readonly validatesTlsHostname: boolean;
  readonly followsRedirects: boolean;
  readonly automaticDecompression: boolean;
}): void {
  if (
    !transport.pinsResolvedAddress ||
    !transport.validatesTlsHostname ||
    transport.followsRedirects ||
    transport.automaticDecompression
  ) {
    throw new AcquisitionPolicyError(
      "UNSAFE_TRANSPORT",
      "Transport cannot prove pinned HTTPS, manual redirects and bounded undecoded response handling."
    );
  }
}
