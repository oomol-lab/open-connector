import type { CredentialValidationResult, ResolvedCredential } from "../../core/types.ts";
import type { OAuthProviderContext } from "../provider-runtime.ts";
import type { LinkedinActionName } from "./actions.ts";

import { compactObject, optionalBoolean, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";
import { linkedinOAuthScopes } from "./actions.ts";

export const linkedinApiBaseUrl = "https://api.linkedin.com";
const linkedinUserinfoUrl = `${linkedinApiBaseUrl}/v2/userinfo`;
const linkedinPostsUrl = `${linkedinApiBaseUrl}/rest/posts`;
export const linkedinApiVersion = "202605";

type LinkedinActionContext = OAuthProviderContext;
type LinkedinActionHandler = (input: Record<string, unknown>, context: LinkedinActionContext) => Promise<unknown>;

export const linkedinActionHandlers: Record<LinkedinActionName, LinkedinActionHandler> = {
  get_current_member(_input, context) {
    return getCurrentLinkedinMember(context);
  },
  create_text_post(input, context) {
    return createLinkedinTextPost(input, context);
  },
  delete_post(input, context) {
    return deleteLinkedinPost(input, context);
  },
  create_article_post(input, context) {
    return createLinkedinArticlePost(input, context);
  },
  create_reshare(input, context) {
    return createLinkedinReshare(input, context);
  },
};

export async function validateLinkedinCredential(
  credential: Extract<ResolvedCredential, { authType: "oauth2" }>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const member = normalizeLinkedinMember(
    await requestLinkedinJson(linkedinUserinfoUrl, credential.accessToken, fetcher, signal),
  );
  const grantedScopes = parseScopeString(credential.metadata.scope, linkedinOAuthScopes);

  return {
    profile: {
      accountId: member.sub,
      displayName: member.name ?? member.email ?? member.sub,
      grantedScopes,
    },
    grantedScopes,
    metadata: compactObject({
      sub: member.sub,
      name: member.name,
      email: member.email,
      picture: member.picture,
    }),
  };
}

async function getCurrentLinkedinMember(context: LinkedinActionContext): Promise<unknown> {
  return {
    member: normalizeLinkedinMember(
      await requestLinkedinJson(linkedinUserinfoUrl, context.accessToken, context.fetcher, context.signal),
    ),
  };
}

async function createLinkedinTextPost(
  input: Record<string, unknown>,
  context: LinkedinActionContext,
): Promise<unknown> {
  return createLinkedinPost(buildLinkedinPostBaseBody(input), context);
}

async function deleteLinkedinPost(input: Record<string, unknown>, context: LinkedinActionContext): Promise<unknown> {
  const postUrn = requiredString(input.postUrn, "postUrn");
  const response = await context.fetcher(`${linkedinPostsUrl}/${encodeURIComponent(postUrn)}`, {
    method: "DELETE",
    headers: buildLinkedinRestHeaders(context.accessToken, { "x-restli-method": "DELETE" }),
    signal: context.signal,
  });
  const payload = await readLinkedinResponse(response);
  if (!response.ok) {
    throw createLinkedinError(response.status, payload);
  }
  return {
    postUrn,
    deleted: true,
    raw: optionalRecord(payload) ?? {},
  };
}

async function createLinkedinArticlePost(
  input: Record<string, unknown>,
  context: LinkedinActionContext,
): Promise<unknown> {
  const article: Record<string, unknown> = {
    source: requiredString(input.sourceUrl, "sourceUrl"),
  };
  const title = optionalString(input.title);
  const description = optionalString(input.description);
  const thumbnailUrn = optionalString(input.thumbnailUrn);
  if (title) {
    article.title = title;
  }
  if (description) {
    article.description = description;
  }
  if (thumbnailUrn) {
    article.thumbnail = thumbnailUrn;
  }

  return createLinkedinPost(
    {
      ...buildLinkedinPostBaseBody(input),
      content: {
        article,
      },
    },
    context,
  );
}

async function createLinkedinReshare(input: Record<string, unknown>, context: LinkedinActionContext): Promise<unknown> {
  return createLinkedinPost(
    {
      author: readLinkedinMemberAuthorUrn(input.authorUrn),
      commentary: optionalString(input.commentary) ?? "",
      visibility: optionalString(input.visibility) ?? "PUBLIC",
      distribution: buildLinkedinMainFeedDistribution(),
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: input.disableReshare === true,
      reshareContext: {
        parent: requiredString(input.parentPostUrn, "parentPostUrn"),
      },
    },
    context,
  );
}

async function createLinkedinPost(body: Record<string, unknown>, context: LinkedinActionContext): Promise<unknown> {
  const response = await context.fetcher(linkedinPostsUrl, {
    method: "POST",
    headers: buildLinkedinRestHeaders(context.accessToken),
    body: JSON.stringify(body),
    signal: context.signal,
  });
  const payload = await readLinkedinResponse(response);
  if (!response.ok) {
    throw createLinkedinError(response.status, payload);
  }

  const postUrn = response.headers.get("x-restli-id") ?? optionalString(optionalRecord(payload)?.id);
  if (!postUrn) {
    throw new ProviderRequestError(502, "LinkedIn create post response is missing post URN");
  }

  return {
    postUrn,
    raw: optionalRecord(payload) ?? {},
  };
}

function buildLinkedinPostBaseBody(input: Record<string, unknown>): Record<string, unknown> {
  return {
    author: readLinkedinMemberAuthorUrn(input.authorUrn),
    commentary: requiredString(input.commentary, "commentary"),
    visibility: optionalString(input.visibility) ?? "PUBLIC",
    distribution: buildLinkedinMainFeedDistribution(),
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: input.disableReshare === true,
  };
}

function readLinkedinMemberAuthorUrn(value: unknown): string {
  const authorUrn = requiredString(value, "authorUrn");
  if (!authorUrn.startsWith("urn:li:person:")) {
    throw new ProviderRequestError(400, "authorUrn must be a LinkedIn member URN supported by Share on LinkedIn");
  }
  return authorUrn;
}

function buildLinkedinMainFeedDistribution(): Record<string, unknown> {
  return {
    feedDistribution: "MAIN_FEED",
    targetEntities: [],
    thirdPartyDistributionChannels: [],
  };
}

async function requestLinkedinJson(
  url: string,
  accessToken: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
  headers: Record<string, string> = {},
): Promise<unknown> {
  const response = await fetcher(url, {
    method: "GET",
    headers: buildLinkedinRestHeaders(accessToken, headers),
    signal,
  });
  const payload = await readLinkedinResponse(response);
  if (!response.ok) {
    throw createLinkedinError(response.status, payload);
  }
  return payload;
}

function buildLinkedinRestHeaders(accessToken: string, headers: Record<string, string> = {}): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
    "linkedin-version": linkedinApiVersion,
    "user-agent": providerUserAgent,
    "x-restli-protocol-version": "2.0.0",
    ...headers,
  };
}

async function readLinkedinResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function normalizeLinkedinMember(value: unknown): {
  sub: string;
  name?: string;
  givenName?: string;
  familyName?: string;
  email?: string;
  emailVerified?: boolean;
  locale?: string;
  picture?: string;
  raw: Record<string, unknown>;
} {
  const record = optionalRecord(value);
  const sub = optionalString(record?.sub);
  if (!sub) {
    throw new ProviderRequestError(502, "LinkedIn userinfo response is missing sub");
  }
  return {
    sub,
    ...compactObject({
      name: optionalString(record?.name),
      givenName: optionalString(record?.given_name),
      familyName: optionalString(record?.family_name),
      email: optionalString(record?.email),
      emailVerified: optionalBoolean(record?.email_verified),
      locale: optionalString(record?.locale),
      picture: optionalString(record?.picture),
    }),
    raw: record ?? {},
  };
}

function createLinkedinError(status: number, payload: unknown): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ??
    optionalString(record?.error_description) ??
    optionalString(record?.error) ??
    "LinkedIn API request failed";

  if (status === 401) {
    return new ProviderRequestError(401, message, payload);
  }
  if (status === 403) {
    return new ProviderRequestError(403, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? status : 502, message, payload);
}

function requiredString(value: unknown, fieldName: string): string {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return stringValue;
}

function parseScopeString(value: unknown, fallbackScopes: string[]): string[] {
  const raw = optionalString(value);
  if (!raw) {
    return [...fallbackScopes];
  }
  return raw
    .split(" ")
    .map((scope) => scope.trim())
    .filter((scope, index, scopes) => scope.length > 0 && scopes.indexOf(scope) === index);
}
