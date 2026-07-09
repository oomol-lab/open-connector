export type QqMailProtocolErrorKind =
  | "auth"
  | "folder_not_found"
  | "uid_not_found"
  | "timeout"
  | "network"
  | "provider";

export class QqMailProtocolError extends Error {
  readonly kind: QqMailProtocolErrorKind;

  constructor(kind: QqMailProtocolErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}
