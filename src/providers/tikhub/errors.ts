import { ProviderRequestError } from "../provider-runtime.ts";

/**
 * The runtime error codes TikHub raises. Only codes `mapExecutionErrorStatus`
 * knows may reach the wire: a code it does not recognize is answered with
 * HTTP 400 whatever status the error carries.
 */
export type TikHubErrorCode = "authorization_failed" | "invalid_input" | "provider_error" | "rate_limited";

/** Preserves TikHub-specific error categories within the open-source runtime error contract. */
export class TikHubRequestError extends ProviderRequestError {
  constructor(code: TikHubErrorCode, message: string, status: number, _cause?: unknown, details?: unknown) {
    super(status, message, details, code);
  }
}
