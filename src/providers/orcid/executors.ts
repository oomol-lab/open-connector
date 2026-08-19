import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { OAuthProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineOAuthProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";
const service = "orcid";
const baseUrl = "https://pub.orcid.org/v3.0";
const orcidUserInfoUrl = "https://orcid.org/oauth/userinfo";
const handlers = {
  async search_records(input: Record<string, unknown>, context: OAuthProviderContext) {
    const start = integer(input.start, 0);
    const rows = integer(input.rows, 20);
    if (start + rows > 10000)
      throw new ProviderRequestError(400, "ORCID Public API search is limited to the first 10,000 results");
    const url = new URL(`${baseUrl}/expanded-search/`);
    url.searchParams.set("q", string(input.query, "query"));
    url.searchParams.set("start", String(start));
    url.searchParams.set("rows", String(rows));
    const payload = await request(url, context);
    return { total: integer(payload["num-found"]), start, rows, results: array(payload["expanded-result"]) };
  },
  async get_record(input: Record<string, unknown>, context: OAuthProviderContext) {
    const orcidId = normalize(string(input.orcidId, "orcidId"));
    const payload = await request(new URL(`${baseUrl}/${orcidId}/record`), context);
    const person = objectOrEmpty(payload.person);
    const name = objectOrEmpty(person.name);
    const given = objectOrEmpty(name["given-names"]).value;
    const family = objectOrEmpty(name["family-name"]).value;
    return {
      orcidId,
      name: [given, family].filter((value) => typeof value === "string").join(" ") || null,
      record: payload,
    };
  },
  async get_works(input: Record<string, unknown>, context: OAuthProviderContext) {
    const orcidId = normalize(string(input.orcidId, "orcidId"));
    const payload = await request(new URL(`${baseUrl}/${orcidId}/works`), context);
    return { orcidId, works: array(payload.group), raw: payload };
  },
};
export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher, signal }) {
    const response = await fetcher(orcidUserInfoUrl, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.accessToken}`,
        "user-agent": providerUserAgent,
      },
      signal,
    });
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ProviderRequestError(502, "ORCID userinfo returned invalid JSON");
    }
    if (!response.ok) {
      throw new ProviderRequestError(
        response.status === 401 || response.status === 403
          ? 401
          : response.status === 429
            ? 429
            : response.status < 500
              ? 400
              : 502,
        "ORCID userinfo request failed",
        payload,
      );
    }
    const user = optionalRecord(payload);
    if (!user) {
      throw new ProviderRequestError(502, "ORCID userinfo response is invalid");
    }
    const orcidId = optionalString(user.sub) ?? optionalString(user.orcid);
    if (!orcidId) {
      throw new ProviderRequestError(502, "ORCID userinfo response is missing sub");
    }
    const displayName = optionalString(user.name) ?? orcidId;
    return {
      profile: {
        accountId: orcidId,
        displayName,
      },
      grantedScopes: ["openid"],
      metadata: compactObject({
        validationEndpoint: orcidUserInfoUrl,
        orcidId,
        name: optionalString(user.name),
        givenName: optionalString(user.given_name),
        familyName: optionalString(user.family_name),
      }),
    };
  },
};
async function request(url: URL, context: OAuthProviderContext): Promise<Record<string, unknown>> {
  const response = await context.fetcher(url, {
    headers: {
      accept: "application/vnd.orcid+json",
      authorization: `Bearer ${context.accessToken}`,
      "user-agent": providerUserAgent,
    },
    signal: context.signal,
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ProviderRequestError(502, "ORCID returned invalid JSON");
  }
  if (!response.ok)
    throw new ProviderRequestError(
      response.status === 401 || response.status === 403
        ? 401
        : response.status === 429
          ? 429
          : response.status < 500
            ? 400
            : 502,
      "ORCID request failed",
      payload,
    );
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw new ProviderRequestError(502, "ORCID response is invalid");
  return payload as Record<string, unknown>;
}
function string(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new ProviderRequestError(400, `${name} is required`);
  return value.trim();
}
function integer(value: unknown, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  if (!Number.isInteger(value)) throw new ProviderRequestError(502, "ORCID response is missing an integer field");
  return value as number;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new ProviderRequestError(502, "ORCID response is missing an array");
  return value;
}
function objectOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
function normalize(value: string): string {
  return value.toUpperCase().replace(/^HTTPS?:\/\/ORCID\.ORG\//, "");
}
