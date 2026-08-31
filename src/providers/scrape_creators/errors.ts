import { ProviderRequestError } from "../provider-runtime.ts";

export class ScrapeCreatorsRequestError extends ProviderRequestError {
  constructor(code: string, message: string, status: number, details?: unknown) {
    super(status, message, details, code);
  }
}
