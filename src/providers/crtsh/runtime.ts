import type { ProviderActionHandlers, ProviderFetch } from "../provider-runtime.ts";

import { looseArray, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  parseProviderJsonBodyText,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  readProviderErrorTextBody,
  readProviderTextBody,
  requiredInputString,
  runProviderRequest,
  setSearchParams,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";

export const crtshApiBaseUrl = "https://crt.sh";

const defaultLimit = 100;

export interface CrtshRuntimeContext {
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type CrtshActionHandler = (input: Record<string, unknown>, context: CrtshRuntimeContext) => Promise<unknown>;

export const crtshActionHandlers: ProviderActionHandlers<"crtsh", CrtshActionHandler> = {
  async search_certificates(input, context) {
    const domain = domainQueryParam(input.domain);
    const limit = optionalInteger(input.limit) ?? defaultLimit;
    const payload = await requestCrtsh({ context, domain });
    const records = looseArray(payload);
    const certificates: Record<string, unknown>[] = [];
    for (const item of records) {
      const record = optionalRecord(item);
      if (!record) continue;
      certificates.push(normalizeCertificate(record));
      if (certificates.length >= limit) break;
    }
    return {
      certificates,
      returned: certificates.length,
      total_matches: records.length,
    };
  },
};

/**
 * crt.sh treats `q` as a SQL LIKE pattern where % is the wildcard. Keep the
 * charset tight so a model-supplied URL or junk never reaches the query string.
 */
function domainQueryParam(value: unknown): string {
  const domain = requiredInputString(value, "domain").trim();
  if (!/^[A-Za-z0-9%][A-Za-z0-9.\-_%]*$/.test(domain)) {
    throw providerInputError(
      "domain must be a domain such as example.com, optionally with % wildcards like %.example.com.",
    );
  }
  return domain;
}

interface CrtshRequest {
  context: CrtshRuntimeContext;
  domain: string;
}

async function requestCrtsh(request: CrtshRequest): Promise<unknown> {
  const url = new URL(crtshApiBaseUrl);
  // Explicit ILIKE: crt.sh defaults hyphenated queries to "Single" matching,
  // which disables % wildcards (see certwatch_db web_apis.fnc).
  setSearchParams(url, { q: request.domain, output: "json", match: "ILIKE" });
  return runProviderRequest({ label: "crt.sh", signal: request.context.signal }, async (signal) => {
    const response = await request.context.fetcher(url, {
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal,
    });
    if (!response.ok) {
      throw await readCrtshError(response);
    }
    return parseProviderJsonBodyText(await readProviderTextBody(response, "crt.sh response"), {
      emptyBody: [],
      invalidJsonMessage: "crt.sh returned malformed JSON",
    });
  });
}

function normalizeCertificate(record: Record<string, unknown>): Record<string, unknown> {
  return {
    ...record,
    id: optionalInteger(record.id) ?? 0,
    issuer_ca_id: optionalInteger(record.issuer_ca_id) ?? 0,
    issuer_name: optionalString(record.issuer_name) ?? "",
    common_name: optionalString(record.common_name) ?? "",
    name_value: optionalString(record.name_value) ?? "",
    not_before: optionalString(record.not_before) ?? "",
    not_after: optionalString(record.not_after) ?? "",
    serial_number: optionalString(record.serial_number) ?? "",
  };
}

/**
 * Map a crt.sh error onto the runtime's status conventions. crt.sh serves HTML
 * error pages when overloaded, so surface a short excerpt instead of the page.
 * The search endpoint needs no credentials, so an authorization failure is not
 * something reconnecting can fix.
 */
export async function readCrtshError(response: Response): Promise<ProviderRequestError> {
  const text = (await readProviderErrorTextBody(response, "crt.sh error response")).trim();
  const message = text.slice(0, 200) || `crt.sh request failed with HTTP ${response.status}`;
  const status = response.status;
  return new ProviderRequestError(
    status,
    message,
    withRetryAfterSeconds(response, {}),
    status === 429 ? "rate_limited" : "provider_error",
  );
}
