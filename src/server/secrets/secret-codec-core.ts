export interface ISecretCodec {
  readonly encrypted: boolean;
  encode(plaintext: string): Promise<string>;
  decode(stored: string): Promise<string>;
}

export class PlainTextSecretCodec implements ISecretCodec {
  readonly encrypted = false;

  async encode(plaintext: string): Promise<string> {
    return plaintext;
  }

  async decode(stored: string): Promise<string> {
    return stored;
  }
}
