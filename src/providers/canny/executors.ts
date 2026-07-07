import type {
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { CannyActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderProxyUrl,
  defineApiKeyProviderExecutors,
  normalizeProviderProxyHeaders,
  providerUserAgent,
  ProviderRequestError,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "canny";
const cannyApiBaseUrl = "https://canny.io/api";

type CannyActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const cannyActionHandlers: Record<CannyActionName, CannyActionHandler> = {
  list_boards(_input, context) {
    return listBoards(context);
  },
  retrieve_board(input, context) {
    return retrieveBoard(input, context);
  },
  list_users(input, context) {
    return listUsers(input, context);
  },
  retrieve_user(input, context) {
    return retrieveUser(input, context);
  },
  create_or_update_user(input, context) {
    return createOrUpdateUser(input, context);
  },
  list_posts(input, context) {
    return listPosts(input, context);
  },
  retrieve_post(input, context) {
    return retrievePost(input, context);
  },
  create_post(input, context) {
    return createPost(input, context);
  },
  update_post(input, context) {
    return updatePost(input, context);
  },
  list_comments(input, context) {
    return listComments(input, context);
  },
  create_comment(input, context) {
    return createComment(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, cannyActionHandlers);

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const url = createProviderProxyUrl(cannyApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("content-type", "application/json");
    headers.set("user-agent", providerUserAgent);
    const response = await fetch(url.toString(), {
      method: input.method,
      headers,
      body: JSON.stringify({ ...optionalRecord(input.body), apiKey: credential.apiKey }),
      signal: context.signal,
    });
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `provider request failed with HTTP ${response.status}`);
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "provider request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await cannyRequest("/v1/boards/list", { apiKey: input.apiKey }, { fetcher, signal });
    const body = requireObjectPayload(payload, "board list");
    const boards = requireArrayField(body.boards, "boards");
    return {
      profile: {
        accountId: "canny",
        displayName: "Canny API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: cannyApiBaseUrl,
        validationEndpoint: "/v1/boards/list",
        boardCount: boards.length,
      },
    };
  },
};

async function listBoards(context: ApiKeyProviderContext) {
  const payload = await cannyRequest("/v1/boards/list", { apiKey: context.apiKey }, context);
  return { boards: requireArrayField(requireObjectPayload(payload, "board list").boards, "boards") };
}

async function retrieveBoard(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await cannyRequest(
    "/v1/boards/retrieve",
    { apiKey: context.apiKey, id: requiredInputString(input.boardID, "boardID") },
    context,
  );
  return { board: requireObjectPayload(payload, "board") };
}

async function listUsers(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await cannyRequest(
    "/v2/users/list",
    compactObject({
      apiKey: context.apiKey,
      limit: optionalInteger(input.limit),
      cursor: optionalString(input.cursor),
    }),
    context,
  );
  const body = requireObjectPayload(payload, "user list");
  return compactObject({
    users: requireArrayField(body.users, "users"),
    hasNextPage: body.hasNextPage === true,
    cursor: optionalString(body.cursor),
  });
}

async function retrieveUser(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  assertExactlyOneIdentifier(input);
  const payload = await cannyRequest(
    "/v1/users/retrieve",
    compactObject({
      apiKey: context.apiKey,
      id: optionalString(input.id),
      userID: optionalString(input.userID),
      email: optionalString(input.email),
    }),
    context,
  );
  return { user: requireObjectPayload(payload, "user") };
}

async function createOrUpdateUser(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  assertAtLeastOneIdentifier(input);
  const payload = await cannyRequest(
    "/v1/users/create_or_update",
    compactObject({
      apiKey: context.apiKey,
      id: optionalString(input.id),
      userID: optionalString(input.userID),
      email: optionalString(input.email),
      name: requiredInputString(input.name, "name"),
      alias: optionalString(input.alias),
      created: optionalString(input.created),
      avatarURL: optionalString(input.avatarURL),
      companies: Array.isArray(input.companies) ? input.companies : undefined,
      customFields: optionalRecord(input.customFields),
    }),
    context,
  );
  return { user: { id: requiredInputString(requireObjectPayload(payload, "created user").id, "id") } };
}

async function listPosts(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await cannyRequest(
    "/v1/posts/list",
    compactObject({
      apiKey: context.apiKey,
      boardID: optionalString(input.boardID),
      authorID: optionalString(input.authorID),
      companyID: optionalString(input.companyID),
      search: optionalString(input.search),
      sort: optionalString(input.sort),
      status: optionalString(input.status),
      tagIDs: optionalStringArray(input.tagIDs),
      limit: optionalInteger(input.limit),
      skip: optionalInteger(input.skip),
    }),
    context,
  );
  const body = requireObjectPayload(payload, "post list");
  return { posts: requireArrayField(body.posts, "posts"), hasMore: body.hasMore === true };
}

async function retrievePost(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await cannyRequest(
    "/v1/posts/retrieve",
    { apiKey: context.apiKey, id: requiredInputString(input.postID, "postID") },
    context,
  );
  return { post: requireObjectPayload(payload, "post") };
}

async function createPost(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await cannyRequest(
    "/v1/posts/create",
    compactObject({
      apiKey: context.apiKey,
      boardID: requiredInputString(input.boardID, "boardID"),
      title: requiredInputString(input.title, "title"),
      details: requiredInputString(input.details, "details"),
      authorID: requiredInputString(input.authorID, "authorID"),
      byID: optionalString(input.byID),
      ownerID: optionalString(input.ownerID),
      categoryID: optionalString(input.categoryID),
      createdAt: optionalString(input.createdAt),
      eta: optionalString(input.eta),
      etaPublic: optionalBoolean(input.etaPublic),
      imageURLs: optionalStringArray(input.imageURLs),
      customFields: optionalRecord(input.customFields),
    }),
    context,
  );
  const body = requireObjectPayload(payload, "created post");
  return { post: compactObject({ id: requiredInputString(body.id, "id"), url: optionalString(body.url) }) };
}

async function updatePost(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  if (
    ![input.title, input.details, input.eta, input.etaPublic, input.imageURLs, input.customFields].some(
      (item) => item !== undefined,
    )
  ) {
    throw new ProviderRequestError(400, "At least one mutable field is required.");
  }
  const payload = await cannyRequest(
    "/v1/posts/update",
    compactObject({
      apiKey: context.apiKey,
      postID: requiredInputString(input.postID, "postID"),
      title: optionalString(input.title),
      details: optionalString(input.details),
      eta: optionalString(input.eta),
      etaPublic: optionalBoolean(input.etaPublic),
      imageURLs: optionalStringArray(input.imageURLs),
      customFields: optionalRecord(input.customFields),
    }),
    context,
  );
  if (payload === "success") return { success: true };
  return { success: requireObjectPayload(payload, "updated post").success === true };
}

async function listComments(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await cannyRequest(
    "/v1/comments/list",
    compactObject({
      apiKey: context.apiKey,
      postID: optionalString(input.postID),
      boardID: optionalString(input.boardID),
      authorID: optionalString(input.authorID),
      companyID: optionalString(input.companyID),
      limit: optionalInteger(input.limit),
      skip: optionalInteger(input.skip),
    }),
    context,
  );
  const body = requireObjectPayload(payload, "comment list");
  return { comments: requireArrayField(body.comments, "comments"), hasMore: body.hasMore === true };
}

async function createComment(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  if (!optionalString(input.value) && !optionalStringArray(input.imageURLs)?.length) {
    throw new ProviderRequestError(400, "Either value or imageURLs is required.");
  }
  const payload = await cannyRequest(
    "/v1/comments/create",
    compactObject({
      apiKey: context.apiKey,
      postID: requiredInputString(input.postID, "postID"),
      authorID: requiredInputString(input.authorID, "authorID"),
      value: optionalString(input.value),
      parentID: optionalString(input.parentID),
      internal: optionalBoolean(input.internal),
      createdAt: optionalString(input.createdAt),
      imageURLs: optionalStringArray(input.imageURLs),
      shouldNotifyVoters: optionalBoolean(input.shouldNotifyVoters),
    }),
    context,
  );
  return { comment: { id: requiredInputString(requireObjectPayload(payload, "created comment").id, "id") } };
}

async function cannyRequest(
  path: string,
  body: Record<string, unknown>,
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">,
) {
  const response = await context.fetcher(`${cannyApiBaseUrl}${path}`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": providerUserAgent,
    },
    body: JSON.stringify(body),
    signal: context.signal,
  });
  const payload = await readResponse(response);
  if (!response.ok) throw toCannyError(response.status, payload);
  return payload;
}

async function readResponse(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function toCannyError(status: number, payload: unknown) {
  const message = extractErrorMessage(payload) ?? `canny request failed with status ${status}`;
  if ([400, 401, 403, 404].includes(status)) return new ProviderRequestError(400, message, payload);
  if (status === 429) return new ProviderRequestError(429, message, payload);
  return new ProviderRequestError(status >= 500 ? status : 502, message, payload);
}

function extractErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) return payload;
  const body = optionalRecord(payload);
  return optionalString(body?.error) ?? optionalString(body?.message);
}

function requireObjectPayload(payload: unknown, subject: string) {
  const record = optionalRecord(payload);
  if (!record) throw new ProviderRequestError(502, `malformed canny ${subject} payload`, payload);
  return record;
}

function requireArrayField(value: unknown, fieldName: string) {
  if (!Array.isArray(value)) throw new ProviderRequestError(502, `malformed canny payload: ${fieldName}`, value);
  return value;
}

function requiredInputString(value: unknown, fieldName: string) {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function optionalInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function optionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function optionalStringArray(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
  return items.length > 0 ? items : undefined;
}

function assertExactlyOneIdentifier(input: Record<string, unknown>) {
  const count = [input.id, input.userID, input.email].filter((value) => optionalString(value)).length;
  if (count !== 1) throw new ProviderRequestError(400, "Exactly one of id, userID, or email is required.");
}

function assertAtLeastOneIdentifier(input: Record<string, unknown>) {
  const count = [input.id, input.userID, input.email].filter((value) => optionalString(value)).length;
  if (count < 1) throw new ProviderRequestError(400, "At least one of id, userID, or email is required.");
}
