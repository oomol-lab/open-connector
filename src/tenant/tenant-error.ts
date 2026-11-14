/**
 * Error with a stable code and HTTP status, raised by tenant resolution and
 * tenant-scope checks. Route handlers translate `status`/`code` directly into
 * the response.
 */
export class TenantError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
