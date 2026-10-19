/**
 * The error codes a provider may put in `ProviderRequestError`'s `code`
 * argument. Every other code `mapExecutionErrorStatus` knows is raised by the
 * connection, policy or dispatch layer, and a provider that borrowed one would
 * answer with a status that has nothing to do with what its upstream said.
 */
export const providerErrorCodes = [
  "authorization_failed",
  "insufficient_credit",
  "invalid_input",
  "provider_error",
  "rate_limited",
] as const;

/** Error codes owned by provider execution. */
export type ProviderErrorCode = (typeof providerErrorCodes)[number];
