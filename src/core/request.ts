/**
 * Query parameter values accepted by provider HTTP helpers.
 */
export type QueryValue = string | number | boolean | null | undefined;

/**
 * Convert defined scalar values into URL query strings.
 *
 * Empty strings, null, and undefined are omitted because provider list APIs
 * usually treat them as absent filters rather than meaningful values.
 */
export function queryParams(input: Record<string, QueryValue>): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    output[key] = String(value);
  }
  return output;
}

/**
 * Convert boolean query flags where true is encoded as "1" and false as "0".
 */
export function queryFlag(value: boolean | undefined): string | undefined {
  return value === undefined ? undefined : value ? "1" : "0";
}

/**
 * Encode one provider path segment after converting provider input to string.
 */
export function encodePathSegment(value: unknown): string {
  return encodeURIComponent(String(value));
}

/**
 * Return a shallow JSON object without undefined values.
 */
export function jsonObject(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      output[key] = value;
    }
  }
  return output;
}

/**
 * Return JSON-compatible data with undefined object properties removed at every
 * depth. Array slots are preserved because provider APIs often treat array
 * position as meaningful.
 */
export function compactJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => compactJson(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .map(([key, child]) => [key, compactJson(child)]),
  );
}

export interface BoundedResponseBytesOptions {
  maxBytes: number;
  fieldName: string;
  createError: (message: string) => Error;
}

/**
 * Read a response body into memory while enforcing a byte limit.
 */
export async function readBoundedResponseBytes(
  response: Response,
  options: BoundedResponseBytesOptions,
): Promise<Uint8Array> {
  const contentLength = parseContentLength(response.headers.get("content-length"));
  if (contentLength !== undefined) {
    assertMaxBytes(contentLength, options);
  }

  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    assertMaxBytes(bytes.byteLength, options);
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      totalBytes += value.byteLength;
      if (totalBytes > options.maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw options.createError(`${options.fieldName} exceeds ${options.maxBytes} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

const localHostnames = new Set(["localhost", "localhost.localdomain", "ip6-localhost", "ip6-loopback"]);
const cloudMetadataHostnames = new Set(["instance-data.ec2.internal", "metadata.google.internal", "metadata.goog"]);
const localHostnameSuffixes = [".localhost", ".localdomain"];
const privateHostnameSuffixes = [".local", ".internal", ".home", ".lan"];
const privateIpv4Cidrs: Array<[number, number]> = [
  [ipv4ToNumber("10.0.0.0"), 8],
  [ipv4ToNumber("100.64.0.0"), 10],
  [ipv4ToNumber("172.16.0.0"), 12],
  [ipv4ToNumber("192.168.0.0"), 16],
];
const reservedIpv4Cidrs: Array<[number, number]> = [
  [ipv4ToNumber("0.0.0.0"), 8],
  [ipv4ToNumber("100.100.100.200"), 32],
  [ipv4ToNumber("127.0.0.0"), 8],
  [ipv4ToNumber("169.254.0.0"), 16],
  [ipv4ToNumber("192.0.0.0"), 24],
  [ipv4ToNumber("192.0.2.0"), 24],
  [ipv4ToNumber("198.18.0.0"), 15],
  [ipv4ToNumber("198.51.100.0"), 24],
  [ipv4ToNumber("203.0.113.0"), 24],
  [ipv4ToNumber("224.0.0.0"), 4],
  [ipv4ToNumber("240.0.0.0"), 4],
];
const reservedIpv6Cidrs: Array<[Uint8Array, number]> = [
  [ipv6ToBytes("::"), 128],
  [ipv6ToBytes("::1"), 128],
  [ipv6ToBytes("100::"), 64],
  [ipv6ToBytes("100:0:0:1::"), 64],
  [ipv6ToBytes("64:ff9b:1::"), 48],
  [ipv6ToBytes("2001:2::"), 48],
  [ipv6ToBytes("2001:db8::"), 32],
  [ipv6ToBytes("3fff::"), 20],
  [ipv6ToBytes("5f00::"), 16],
  [ipv6ToBytes("fe80::"), 10],
  [ipv6ToBytes("ff00::"), 8],
];
const privateIpv6Cidrs: Array<[Uint8Array, number]> = [
  [ipv6ToBytes("fc00::"), 7],
  [ipv6ToBytes("fec0::"), 10],
];
/** IPv6 ranges that embed an IPv4 address checked against the IPv4 policy: [prefix, bits, v4 byte offset]. */
const ipv4EmbeddedIpv6Cidrs: Array<[Uint8Array, number, number]> = [
  [ipv6ToBytes("::ffff:0:0"), 96, 12],
  [ipv6ToBytes("64:ff9b::"), 96, 12],
  [ipv6ToBytes("2002::"), 16, 2],
];

export interface PublicHttpUrlOptions {
  fieldName: string;
  createError: (message: string) => Error;
  /** Allow RFC 1918, shared-address-space, and private hostname targets while retaining reserved-target guards. */
  allowPrivateNetwork?: boolean;
}

/**
 * Deployment-level opt-in that lets self-hosted provider connections (currently
 * Dokploy) target RFC 1918, carrier-grade-NAT, and private-hostname addresses.
 *
 * Off by default so a shared/multi-tenant runtime keeps a public-only SSRF guard
 * and a tenant cannot turn a self-hosted connection into an SSRF pivot into the
 * operator's internal network. Single-tenant, self-hosted operators enable it
 * through the `OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK` environment variable.
 *
 * Even when enabled, reserved, loopback, link-local, cloud-metadata, multicast,
 * and IPv6 targets remain blocked by {@link assertPublicHttpUrl}.
 */
let privateNetworkAccessAllowed = false;

/** Configure whether opted-in providers may target private networks (called once at deployment bootstrap). */
export function setPrivateNetworkAccessAllowed(allowed: boolean): void {
  privateNetworkAccessAllowed = allowed;
}

/** Whether the current deployment allows opted-in providers to target private networks. */
export function isPrivateNetworkAccessAllowed(): boolean {
  return privateNetworkAccessAllowed;
}

/** Parse the `OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK` flag; only explicit truthy values enable it. */
export function parsePrivateNetworkAccessFlag(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

/**
 * Parse a user-supplied URL and reject unsafe network targets.
 *
 * This is a local runtime SSRF guard for provider actions that fetch remote
 * user-supplied content before uploading it to an upstream provider. Callers
 * may explicitly allow private networks for trusted self-hosted services, but
 * loopback, link-local, reserved, multicast, and IPv6 targets remain blocked.
 */
export function assertPublicHttpUrl(value: string, options: PublicHttpUrlOptions): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw options.createError(`${options.fieldName} must be a valid URL`);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw options.createError(`${options.fieldName} must use http or https`);
  }

  const hostname = normalizeHostname(url.hostname);
  if (cloudMetadataHostnames.has(hostname)) {
    throw options.createError(`${options.fieldName} must not target cloud metadata hosts`);
  }
  if (localHostnames.has(hostname) || localHostnameSuffixes.some((suffix) => hostname.endsWith(suffix))) {
    throw options.createError(`${options.fieldName} must not target local hosts`);
  }
  if (!options.allowPrivateNetwork && privateHostnameSuffixes.some((suffix) => hostname.endsWith(suffix))) {
    throw options.createError(`${options.fieldName} must not target local hosts`);
  }

  const ipv4 = parseIpv4(hostname);
  if (ipv4 !== undefined && isBlockedIpv4(ipv4, options.allowPrivateNetwork === true)) {
    throw options.createError(`${options.fieldName} must not target private or reserved IP addresses`);
  }

  if (hostname.includes(":")) {
    throw options.createError(`${options.fieldName} must not target IPv6 addresses`);
  }

  if (hostname !== url.hostname) {
    url.hostname = hostname;
  }
  return url;
}

/**
 * Return whether a resolved IP address (IPv4 or IPv6 text form) is a private,
 * reserved, loopback, link-local, or metadata target that provider egress must
 * not reach.
 *
 * This complements {@link assertPublicHttpUrl}: the URL guard validates literal
 * hostnames before a request, while this check validates the addresses a
 * hostname actually resolves to (closing name→private-IP bypasses). IPv6
 * ranges that embed an IPv4 address (v4-mapped, NAT64, 6to4) are checked
 * against the IPv4 policy. Unparseable input is treated as blocked.
 */
export function isBlockedIpAddress(address: string, allowPrivateNetwork = false): boolean {
  const ipv4 = parseIpv4(address);
  if (ipv4 !== undefined) {
    return isBlockedIpv4(ipv4, allowPrivateNetwork);
  }

  const ipv6 = parseIpv6(address);
  if (ipv6 === undefined) {
    return true;
  }
  if (reservedIpv6Cidrs.some(([network, bits]) => ipv6InCidr(ipv6, network, bits))) {
    return true;
  }
  if (!allowPrivateNetwork && privateIpv6Cidrs.some(([network, bits]) => ipv6InCidr(ipv6, network, bits))) {
    return true;
  }
  for (const [network, bits, offset] of ipv4EmbeddedIpv6Cidrs) {
    if (ipv6InCidr(ipv6, network, bits)) {
      const embedded =
        ((ipv6[offset]! << 24) | (ipv6[offset + 1]! << 16) | (ipv6[offset + 2]! << 8) | ipv6[offset + 3]!) >>> 0;
      return isBlockedIpv4(embedded, allowPrivateNetwork);
    }
  }
  return false;
}

/**
 * Whether a hostname is a canonical dotted-decimal IPv4 literal (each octet
 * 0-255), matching exactly what {@link assertPublicHttpUrl} validates as a
 * literal IPv4. Callers use this to decide a hostname is already an
 * address-validated literal and does not need DNS resolution — it must not
 * over-match looser numeric forms (octal, out-of-range) that resolvers would
 * still interpret as an address.
 */
export function isIpv4Address(hostname: string): boolean {
  return parseIpv4(hostname) !== undefined;
}

function isBlockedIpv4(value: number, allowPrivateNetwork: boolean): boolean {
  if (reservedIpv4Cidrs.some(([network, bits]) => ipv4InCidr(value, network, bits))) {
    return true;
  }
  return !allowPrivateNetwork && privateIpv4Cidrs.some(([network, bits]) => ipv4InCidr(value, network, bits));
}

function normalizeHostname(value: string): string {
  let hostname = value.toLowerCase();
  while (hostname.endsWith(".")) {
    hostname = hostname.slice(0, -1);
  }
  return hostname;
}

function parseIpv4(hostname: string): number | undefined {
  const parts = hostname.split(".");
  if (parts.length !== 4) {
    return undefined;
  }

  let value = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      return undefined;
    }
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) {
      return undefined;
    }
    value = (value << 8) + octet;
  }

  return value >>> 0;
}

function parseIpv6(value: string): Uint8Array | undefined {
  let input = value.toLowerCase();
  const zoneIndex = input.indexOf("%");
  if (zoneIndex !== -1) {
    input = input.slice(0, zoneIndex);
  }
  if (input.startsWith("[") && input.endsWith("]")) {
    input = input.slice(1, -1);
  }
  if (!input.includes(":")) {
    return undefined;
  }

  let head = input;
  let tail = "";
  const compressedIndex = input.indexOf("::");
  if (compressedIndex !== -1) {
    if (input.includes("::", compressedIndex + 1)) {
      return undefined;
    }
    head = input.slice(0, compressedIndex);
    tail = input.slice(compressedIndex + 2);
  }

  const headWords = parseIpv6Words(head);
  const tailWords = parseIpv6Words(tail);
  if (headWords === undefined || tailWords === undefined) {
    return undefined;
  }
  const missing = 8 - headWords.length - tailWords.length;
  if (compressedIndex === -1 ? headWords.length !== 8 : missing < 1) {
    return undefined;
  }

  const words =
    compressedIndex === -1 ? headWords : [...headWords, ...new Array<number>(missing).fill(0), ...tailWords];
  const bytes = new Uint8Array(16);
  for (const [index, word] of words.entries()) {
    bytes[index * 2] = word >>> 8;
    bytes[index * 2 + 1] = word & 0xff;
  }
  return bytes;
}

function parseIpv6Words(value: string): number[] | undefined {
  if (value === "") {
    return [];
  }

  const words: number[] = [];
  const parts = value.split(":");
  for (const [index, part] of parts.entries()) {
    if (part.includes(".")) {
      if (index !== parts.length - 1) {
        return undefined;
      }
      const ipv4 = parseIpv4(part);
      if (ipv4 === undefined) {
        return undefined;
      }
      words.push(ipv4 >>> 16, ipv4 & 0xffff);
      continue;
    }
    if (!/^[0-9a-f]{1,4}$/u.test(part)) {
      return undefined;
    }
    words.push(Number.parseInt(part, 16));
  }
  return words;
}

function ipv6ToBytes(value: string): Uint8Array {
  const parsed = parseIpv6(value);
  if (parsed === undefined) {
    throw new Error(`invalid IPv6 CIDR base: ${value}`);
  }
  return parsed;
}

function ipv6InCidr(value: Uint8Array, network: Uint8Array, bits: number): boolean {
  const fullBytes = Math.floor(bits / 8);
  for (let index = 0; index < fullBytes; index++) {
    if (value[index] !== network[index]) {
      return false;
    }
  }
  const remainderBits = bits % 8;
  if (remainderBits === 0) {
    return true;
  }
  const mask = (0xff << (8 - remainderBits)) & 0xff;
  return (value[fullBytes]! & mask) === (network[fullBytes]! & mask);
}

function parseContentLength(value: string | null): number | undefined {
  if (!value || !/^\d+$/.test(value)) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function assertMaxBytes(byteLength: number, options: BoundedResponseBytesOptions): void {
  if (byteLength > options.maxBytes) {
    throw options.createError(`${options.fieldName} exceeds ${options.maxBytes} bytes`);
  }
}

function ipv4ToNumber(value: string): number {
  const parsed = parseIpv4(value);
  if (parsed === undefined) {
    throw new Error(`invalid IPv4 CIDR base: ${value}`);
  }
  return parsed;
}

function ipv4InCidr(value: number, network: number, bits: number): boolean {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (value & mask) === (network & mask);
}
