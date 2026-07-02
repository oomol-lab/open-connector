import type { ISecretCodec } from "./secret-codec-core.ts";

import { PlainTextSecretCodec } from "./secret-codec-core.ts";

const encryptedPrefix = "enc:worker:v1:";
const keySalt = "oomol-connect-worker-secret-store-v1";

export async function createWorkerSecretCodec(encryptionKey: string | undefined): Promise<ISecretCodec> {
  return encryptionKey ? await WorkerAesGcmSecretCodec.create(encryptionKey) : new PlainTextSecretCodec();
}

export class WorkerAesGcmSecretCodec implements ISecretCodec {
  readonly encrypted = true;

  private readonly key: CryptoKey;

  private constructor(key: CryptoKey) {
    this.key = key;
  }

  static async create(passphrase: string): Promise<WorkerAesGcmSecretCodec> {
    if (!passphrase.trim()) {
      throw new Error("Encryption key must not be empty.");
    }

    const material = await crypto.subtle.importKey("raw", utf8(passphrase), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: utf8(keySalt),
        iterations: 100_000,
        hash: "SHA-256",
      },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    return new WorkerAesGcmSecretCodec(key);
  }

  async encode(plaintext: string): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: toArrayBuffer(iv) },
      this.key,
      utf8(plaintext),
    );
    return `${encryptedPrefix}${base64Url(iv)}.${base64Url(encrypted)}`;
  }

  async decode(stored: string): Promise<string> {
    if (!stored.startsWith(encryptedPrefix)) {
      return stored;
    }

    const [ivText, encryptedText] = stored.slice(encryptedPrefix.length).split(".");
    if (!ivText || !encryptedText) {
      throw new Error("Encrypted Worker secret payload is malformed.");
    }

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64Url(ivText) },
      this.key,
      fromBase64Url(encryptedText),
    );
    return new TextDecoder().decode(decrypted);
  }
}

function utf8(value: string): ArrayBuffer {
  return toArrayBuffer(new TextEncoder().encode(value));
}

function base64Url(value: ArrayBuffer | ArrayBufferView): string {
  const bytes =
    value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return Buffer.from(bytes).toString("base64url");
}

function fromBase64Url(value: string): ArrayBuffer {
  return toArrayBuffer(Buffer.from(value, "base64url"));
}

function toArrayBuffer(value: ArrayBufferView): ArrayBuffer {
  const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return new Uint8Array(bytes).buffer;
}
