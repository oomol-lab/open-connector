/**
 * SM3 (GB/T 32905-2016), the Chinese national cryptographic hash standard.
 *
 * Node's OpenSSL exposes SM3 through `createHash("sm3")`, but the Cloudflare
 * Workers runtime is built on BoringSSL and has no SM3 digest, so a provider
 * signing with SM3 would only work on some of the deployment targets this
 * project supports. The algorithm is therefore written out in full here, so the
 * same bytes come out on Node, Docker, Fly, and Workers alike.
 *
 * The construction mirrors SHA-256: the same length padding, a 256-bit chaining
 * value, and a 64-round compression function. It differs in the message
 * expansion, the round constants, and the permutations P0/P1.
 */

/** The eight-word chaining value, held as u32 so every operation wraps for free. */
type Sm3State = Uint32Array;

const sm3InitialVector: readonly number[] = [
  0x7380166f, 0x4914b2b9, 0x172442d7, 0xda8a0600, 0xa96f30bc, 0x163138aa, 0xe38dee4d, 0xb0fb0e4e,
];

/** The round constant Tj, which takes its second value from round 16 on. */
const sm3EarlyRoundConstant = 0x79cc4519;
const sm3LateRoundConstant = 0x7a879d8a;

const sm3BlockBytes = 64;

function rotateLeft(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

/** The P0 permutation, applied to the second round output. */
function permute0(value: number): number {
  return (value ^ rotateLeft(value, 9) ^ rotateLeft(value, 17)) >>> 0;
}

/** The P1 permutation, applied during message expansion. */
function permute1(value: number): number {
  return (value ^ rotateLeft(value, 15) ^ rotateLeft(value, 23)) >>> 0;
}

/**
 * Append the 0x80 terminator, zero padding, and the 64-bit big-endian bit
 * length, the way SHA-256 and SM3 both define it.
 */
function padMessage(message: Uint8Array): Uint8Array {
  const paddedLength = (Math.floor((message.length + 8) / sm3BlockBytes) + 1) * sm3BlockBytes;
  const padded = new Uint8Array(paddedLength);
  padded.set(message);
  padded[message.length] = 0x80;
  // The trailer is a bit count, so it outgrows 32 bits past a 512 MB message.
  new DataView(padded.buffer).setBigUint64(paddedLength - 8, BigInt(message.length) * 8n, false);
  return padded;
}

/** Compress one 64-byte block into the chaining value, in place. */
function compressBlock(state: Sm3State, view: DataView, offset: number): void {
  const expanded = new Uint32Array(68);
  for (let index = 0; index < 16; index += 1) {
    expanded[index] = view.getUint32(offset + index * 4, false);
  }
  for (let index = 16; index < 68; index += 1) {
    const mixed = expanded[index - 16]! ^ expanded[index - 9]! ^ rotateLeft(expanded[index - 3]!, 15);
    expanded[index] = permute1(mixed) ^ rotateLeft(expanded[index - 13]!, 7) ^ expanded[index - 6]!;
  }

  let [a, b, c, d, e, f, g, h] = state;
  for (let round = 0; round < 64; round += 1) {
    const early = round < 16;
    const constant = rotateLeft(early ? sm3EarlyRoundConstant : sm3LateRoundConstant, round % 32);
    const rotatedA = rotateLeft(a!, 12);
    const ss1 = rotateLeft((rotatedA + e! + constant) >>> 0, 7);
    const ss2 = (ss1 ^ rotatedA) >>> 0;
    const ff = early ? a! ^ b! ^ c! : (a! & b!) | (a! & c!) | (b! & c!);
    const gg = early ? e! ^ f! ^ g! : (e! & f!) | (~e! & g!);
    // The first round output consumes W'j = Wj XOR Wj+4, the second consumes Wj.
    const tt1 = ((ff >>> 0) + d! + ss2 + (expanded[round]! ^ expanded[round + 4]!)) >>> 0;
    const tt2 = ((gg >>> 0) + h! + ss1 + expanded[round]!) >>> 0;
    d = c;
    c = rotateLeft(b!, 9);
    b = a;
    a = tt1;
    h = g;
    g = rotateLeft(f!, 19);
    f = e;
    e = permute0(tt2);
  }

  const next = [a, b, c, d, e, f, g, h];
  for (let index = 0; index < 8; index += 1) {
    state[index] = state[index]! ^ next[index]!;
  }
}

/**
 * Hash a message with SM3 and return the 64-character lowercase hex digest.
 *
 * A string is hashed as its UTF-8 bytes, which is what every SM3 reference
 * sample and the SF Express signing documentation assume.
 */
export function sm3Hex(message: string | Uint8Array): string {
  const bytes = typeof message === "string" ? new TextEncoder().encode(message) : message;
  const padded = padMessage(bytes);
  const view = new DataView(padded.buffer, padded.byteOffset, padded.byteLength);
  const state: Sm3State = Uint32Array.from(sm3InitialVector);
  for (let offset = 0; offset < padded.length; offset += sm3BlockBytes) {
    compressBlock(state, view, offset);
  }
  return Array.from(state, (word) => word.toString(16).padStart(8, "0")).join("");
}
