import { ProviderRequestError } from "../provider-runtime.ts";

/**
 * The runtime error codes Scrape Creators raises. Only a code a provider owns
 * may reach the wire: the routes answer a code they do not recognize with
 * HTTP 400 whatever status the error carries.
 */
export type ScrapeCreatorsErrorCode = "authorization_failed" | "invalid_input" | "provider_error" | "rate_limited";

/** Puts the error code first and pins it to the codes Scrape Creators may raise. */
export class ScrapeCreatorsRequestError extends ProviderRequestError {
  constructor(code: ScrapeCreatorsErrorCode, message: string, status: number, details?: unknown) {
    super(status, message, details, code);
  }
}
