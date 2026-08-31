import { ProviderRequestError } from "../provider-runtime.ts";

/**
 * The runtime error codes TikHub raises. Only a code a provider owns may reach
 * the wire: the routes answer a code they do not recognize with HTTP 400
 * whatever status the error carries.
 */
export type TikHubErrorCode = "authorization_failed" | "invalid_input" | "provider_error" | "rate_limited";

/** Puts the error code first and pins it to the codes TikHub is allowed to raise. */
export class TikHubRequestError extends ProviderRequestError {
  constructor(code: TikHubErrorCode, message: string, status: number, details?: unknown) {
    super(status, message, details, code);
  }
}
