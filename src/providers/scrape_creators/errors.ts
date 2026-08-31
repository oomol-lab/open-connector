import { ProviderRequestError } from "../provider-runtime.ts";

/**
 * The runtime error codes Scrape Creators raises. Only codes
 * `mapExecutionErrorStatus` knows may reach the wire: a code it does not
 * recognize is answered with HTTP 400 whatever status the error carries.
 */
export type ScrapeCreatorsErrorCode = "authorization_failed" | "invalid_input" | "provider_error" | "rate_limited";

export class ScrapeCreatorsRequestError extends ProviderRequestError {
  constructor(code: ScrapeCreatorsErrorCode, message: string, status: number, details?: unknown) {
    super(status, message, details, code);
  }
}
