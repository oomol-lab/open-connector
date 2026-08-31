import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalRawString, optionalRecord, requiredRecord, requiredString } from "../../core/cast.ts";
import {
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
  requiredInputString,
} from "../provider-runtime.ts";

export const hashnodeApiUrl = "https://gql-beta.hashnode.com/";

const currentUserSelection = `
  id
  username
  name
  email
  profilePicture
  tagline
  location
  dateJoined
`;

const publicationSummarySelection = `
  id
  title
  url
  isTeam
`;

const pageInfoSelection = `
  hasNextPage
  endCursor
`;

const userSummarySelection = `
  id
  username
  name
`;

const postSummarySelection = `
  id
  title
  subtitle
  slug
  url
  brief
  publishedAt
  updatedAt
`;

const postSelection = `
  ${postSummarySelection}
  content {
    markdown
    html
  }
  author {
    ${userSummarySelection}
  }
  tags {
    id
    name
    slug
  }
  readTimeInMinutes
  views
`;

const postMutationSelection = `
  id
  title
  slug
  url
  publishedAt
  updatedAt
`;

const draftSelection = `
  id
  title
  subtitle
  slug
  content {
    markdown
    html
  }
  author {
    ${userSummarySelection}
  }
  publication {
    ${publicationSummarySelection}
  }
  tags {
    id
    name
    slug
  }
  updatedAt
  scheduledDate
  isSubmittedForReview
`;

interface HashnodeGraphqlPayload {
  data?: Record<string, unknown> | null;
  errors?: unknown[];
}

type HashnodeRequestPhase = "validate" | "execute";

interface HashnodeGraphqlRequest {
  operationName: string;
  query: string;
  variables: Record<string, unknown>;
  apiKey: string;
  fetcher: typeof fetch;
  phase: HashnodeRequestPhase;
  signal?: AbortSignal;
}

export const hashnodeActionHandlers: ProviderActionHandlers<
  "hashnode",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  async get_current_user(_input, context) {
    const user = await requestCurrentUser(context, "execute");
    return { user: parseCurrentUser(user, "Hashnode me response") };
  },
  async list_my_publications(input, context) {
    const payload = await requestHashnodeGraphql({
      operationName: "ListMyHashnodePublications",
      query: `
        query ListMyHashnodePublications($first: Int!, $after: String) {
          me {
            publications(first: $first, after: $after) {
              edges {
                node {
                  ${publicationSummarySelection}
                }
              }
              pageInfo {
                ${pageInfoSelection}
              }
            }
          }
        }
      `,
      variables: compactObject({
        first: readInteger(input.first, 20),
        after: readOptionalTrimmedString(input.after, "after"),
      }),
      ...context,
      phase: "execute",
    });
    const me = requireResponseObject(payload.data?.me, "Hashnode me response");
    const connection = parseConnection(me.publications, "publications", parsePublicationSummary);
    return { publications: connection.items, pageInfo: connection.pageInfo };
  },
  async get_post(input, context) {
    const payload = await requestHashnodeGraphql({
      operationName: "GetHashnodePost",
      query: `
        query GetHashnodePost($id: ID!) {
          post(id: $id) {
            ${postSelection}
          }
        }
      `,
      variables: { id: requiredInputString(input.id, "id") },
      ...context,
      phase: "execute",
    });
    return { post: parseNullableResponse(payload.data?.post, "Hashnode post response", parsePost) };
  },
  async list_publication_posts(input, context) {
    const payload = await requestHashnodeGraphql({
      operationName: "ListHashnodePublicationPosts",
      query: `
        query ListHashnodePublicationPosts(
          $publicationId: ObjectId
          $host: String
          $first: Int!
          $after: String
        ) {
          publication(id: $publicationId, host: $host) {
            ${publicationSummarySelection}
            posts(first: $first, after: $after) {
              edges {
                node {
                  ${postSummarySelection}
                }
              }
              pageInfo {
                ${pageInfoSelection}
              }
            }
          }
        }
      `,
      variables: compactObject({
        publicationId: readOptionalTrimmedString(input.publicationId, "publicationId"),
        host: readOptionalTrimmedString(input.host, "host"),
        first: readInteger(input.first, 20),
        after: readOptionalTrimmedString(input.after, "after"),
      }),
      ...context,
      phase: "execute",
    });
    if (payload.data?.publication === null) {
      throw new ProviderRequestError(400, "Hashnode publication was not found");
    }
    const publication = requireResponseObject(payload.data?.publication, "Hashnode publication response");
    const connection = parseConnection(publication.posts, "posts", parsePostSummary);
    return {
      publication: parsePublicationSummary(publication, "publication"),
      posts: connection.items,
      pageInfo: connection.pageInfo,
    };
  },
  async publish_post(input, context) {
    const payload = await requestHashnodeGraphql({
      operationName: "PublishHashnodePost",
      query: `
        mutation PublishHashnodePost($input: PublishPostInput!) {
          publishPost(input: $input) {
            post {
              ${postMutationSelection}
            }
          }
        }
      `,
      variables: { input: buildPostInput(input, "publish") },
      ...context,
      phase: "execute",
    });
    return { post: parseMutationResource(payload, "publishPost", "post", parsePostMutationResult) };
  },
  async update_post(input, context) {
    const payload = await requestHashnodeGraphql({
      operationName: "UpdateHashnodePost",
      query: `
        mutation UpdateHashnodePost($input: UpdatePostInput!) {
          updatePost(input: $input) {
            post {
              ${postMutationSelection}
            }
          }
        }
      `,
      variables: { input: buildPostInput(input, "update") },
      ...context,
      phase: "execute",
    });
    return { post: parseMutationResource(payload, "updatePost", "post", parsePostMutationResult) };
  },
  async get_draft(input, context) {
    const payload = await requestHashnodeGraphql({
      operationName: "GetHashnodeDraft",
      query: `
        query GetHashnodeDraft($id: ObjectId!) {
          draft(id: $id) {
            ${draftSelection}
          }
        }
      `,
      variables: { id: requiredInputString(input.id, "id") },
      ...context,
      phase: "execute",
    });
    return { draft: parseNullableResponse(payload.data?.draft, "Hashnode draft response", parseDraft) };
  },
  async create_draft(input, context) {
    const payload = await requestHashnodeGraphql({
      operationName: "CreateHashnodeDraft",
      query: `
        mutation CreateHashnodeDraft($input: CreateDraftInput!) {
          createDraft(input: $input) {
            draft {
              ${draftSelection}
            }
          }
        }
      `,
      variables: { input: buildDraftInput(input, "create") },
      ...context,
      phase: "execute",
    });
    return { draft: parseMutationResource(payload, "createDraft", "draft", parseDraft) };
  },
  async update_draft(input, context) {
    const payload = await requestHashnodeGraphql({
      operationName: "UpdateHashnodeDraft",
      query: `
        mutation UpdateHashnodeDraft($input: UpdateDraftInput!) {
          updateDraft(input: $input) {
            draft {
              ${draftSelection}
            }
          }
        }
      `,
      variables: { input: buildDraftInput(input, "update") },
      ...context,
      phase: "execute",
    });
    return { draft: parseMutationResource(payload, "updateDraft", "draft", parseDraft) };
  },
  async publish_draft(input, context) {
    const payload = await requestHashnodeGraphql({
      operationName: "PublishHashnodeDraft",
      query: `
        mutation PublishHashnodeDraft($input: PublishDraftInput!) {
          publishDraft(input: $input) {
            post {
              ${postMutationSelection}
            }
          }
        }
      `,
      variables: { input: { draftId: requiredInputString(input.draftId, "draftId") } },
      ...context,
      phase: "execute",
    });
    return { post: parseMutationResource(payload, "publishDraft", "post", parsePostMutationResult) };
  },
  async delete_draft(input, context) {
    const payload = await requestHashnodeGraphql({
      operationName: "DeleteHashnodeDraft",
      query: `
        mutation DeleteHashnodeDraft($input: DeleteDraftInput!) {
          deleteDraft(input: $input) {
            draft {
              ${draftSelection}
            }
          }
        }
      `,
      variables: { input: { draftId: requiredInputString(input.draftId, "draftId") } },
      ...context,
      phase: "execute",
    });
    const result = requireResponseObject(payload.data?.deleteDraft, "Hashnode deleteDraft response");
    return { draft: parseNullableResponse(result.draft, "Hashnode deleteDraft draft", parseDraft) };
  },
};

export async function fetchHashnodeCurrentUser(
  apiKey: string,
  fetcher: typeof fetch,
  phase: HashnodeRequestPhase,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  return requestCurrentUser({ apiKey, fetcher, signal }, phase);
}

async function requestCurrentUser(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: HashnodeRequestPhase,
): Promise<Record<string, unknown>> {
  const payload = await requestHashnodeGraphql({
    operationName: "GetCurrentHashnodeUser",
    query: `
      query GetCurrentHashnodeUser {
        me {
          ${currentUserSelection}
        }
      }
    `,
    variables: {},
    ...context,
    phase,
  });
  return requireResponseObject(payload.data?.me, "Hashnode me response");
}

function buildPostInput(input: Record<string, unknown>, mode: "publish" | "update") {
  return compactObject({
    id: mode === "update" ? requiredInputString(input.id, "id") : undefined,
    publicationId: mode === "publish" ? requiredInputString(input.publicationId, "publicationId") : undefined,
    title: mode === "publish" ? requiredInputString(input.title, "title") : readOptionalNullableString(input.title),
    contentMarkdown: readOptionalNullableString(input.contentMarkdown),
    subtitle: readOptionalNullableString(input.subtitle),
    coverImage: readOptionalNullableString(input.coverImage),
    slug: readOptionalNullableTrimmedString(input.slug, "slug"),
    tags: normalizeTags(input.tags),
    originalArticleURL: readOptionalNullableString(input.originalArticleURL),
    metaTitle: readOptionalNullableString(input.metaTitle),
    metaDescription: readOptionalNullableString(input.metaDescription),
    ogImage: readOptionalNullableString(input.ogImage),
    disableComments: readOptionalNullableBoolean(input.disableComments),
    isDelisted: readOptionalNullableBoolean(input.isDelisted),
    enableToc: readOptionalNullableBoolean(input.enableToc),
    seriesId: readOptionalNullableTrimmedString(input.seriesId, "seriesId"),
    publishedAt: readOptionalNullableString(input.publishedAt),
  });
}

function buildDraftInput(input: Record<string, unknown>, mode: "create" | "update") {
  return compactObject({
    draftId: mode === "update" ? requiredInputString(input.draftId, "draftId") : undefined,
    publicationId: mode === "create" ? requiredInputString(input.publicationId, "publicationId") : undefined,
    title: readOptionalNullableString(input.title),
    subtitle: readOptionalNullableString(input.subtitle),
    contentMarkdown: readOptionalNullableString(input.contentMarkdown),
    slug: readOptionalNullableTrimmedString(input.slug, "slug"),
    tags: normalizeTags(input.tags),
    seriesId: readOptionalNullableTrimmedString(input.seriesId, "seriesId"),
    disableComments: readOptionalNullableBoolean(input.disableComments),
    originalArticleURL: readOptionalNullableString(input.originalArticleURL),
    publishedAt: readOptionalNullableString(input.publishedAt),
  });
}

async function requestHashnodeGraphql(input: HashnodeGraphqlRequest): Promise<HashnodeGraphqlPayload> {
  let response: Response;
  try {
    response = await input.fetcher(hashnodeApiUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify({
        operationName: input.operationName,
        query: input.query,
        variables: input.variables,
      }),
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Hashnode request failed: ${error.message}` : "Hashnode request failed",
      error,
    );
  }

  const payload = await readHashnodePayload(response);
  if (!response.ok) {
    throw createHashnodeHttpError(response.status, payload, input.phase);
  }
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    throw createHashnodeGraphqlError(payload.errors, input.phase);
  }
  if (!payload.data || typeof payload.data !== "object" || Array.isArray(payload.data)) {
    throw new ProviderRequestError(502, "Hashnode returned no GraphQL data");
  }

  return payload;
}

async function readHashnodePayload(response: Response): Promise<HashnodeGraphqlPayload> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return {};
  }

  try {
    const payload = JSON.parse(text);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("not an object");
    }
    return payload as HashnodeGraphqlPayload;
  } catch {
    throw new ProviderRequestError(502, "Hashnode returned malformed JSON");
  }
}

function createHashnodeHttpError(status: number, payload: HashnodeGraphqlPayload, phase: HashnodeRequestPhase) {
  const message = readFirstGraphqlError(payload.errors)?.message ?? "Hashnode request failed";
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    return createHashnodeGraphqlError(payload.errors, phase);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message, payload);
}

function createHashnodeGraphqlError(errors: unknown[], phase: HashnodeRequestPhase): ProviderRequestError {
  const error = readFirstGraphqlError(errors);
  if (!error) {
    return new ProviderRequestError(502, "Hashnode returned an invalid GraphQL error", errors);
  }

  if (error.code === "UNAUTHENTICATED") {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, error.message, errors);
  }
  if (
    error.code === "FORBIDDEN" ||
    error.code === "NOT_FOUND" ||
    error.code === "BAD_USER_INPUT" ||
    error.code === "GRAPHQL_VALIDATION_FAILED" ||
    error.code === "GRAPHQL_PARSE_FAILED"
  ) {
    return new ProviderRequestError(400, error.message, errors);
  }
  return new ProviderRequestError(502, error.message, errors);
}

function readFirstGraphqlError(errors: unknown[] | undefined) {
  if (!Array.isArray(errors) || errors.length === 0) {
    return undefined;
  }
  const error = optionalRecord(errors[0]);
  const message = optionalRawString(error?.message);
  if (!message) {
    return undefined;
  }
  const extensions = optionalRecord(error?.extensions);
  return {
    message,
    code: optionalRawString(extensions?.code),
  };
}

interface ParsedHashnodeConnection {
  items: Array<Record<string, unknown>>;
  pageInfo: Record<string, unknown>;
}

function parseConnection(
  value: unknown,
  fieldName: string,
  parseItem: (value: unknown, fieldName: string) => Record<string, unknown>,
): ParsedHashnodeConnection {
  const connection = requireResponseObject(value, `Hashnode ${fieldName} response`);
  const edges = requireResponseArray(connection.edges, `${fieldName}.edges`);
  return {
    items: edges.map((edge, index) => {
      const edgeObject = requireResponseObject(edge, `${fieldName}.edges[${index}]`);
      return parseItem(edgeObject.node, `${fieldName}.edges[${index}].node`);
    }),
    pageInfo: parsePageInfo(connection.pageInfo, `${fieldName}.pageInfo`),
  };
}

function parseMutationResource(
  payload: HashnodeGraphqlPayload,
  mutationName: string,
  resourceName: string,
  parseResource: (value: unknown, fieldName: string) => Record<string, unknown>,
): Record<string, unknown> {
  const mutation = requireResponseObject(payload.data?.[mutationName], `Hashnode ${mutationName} response`);
  return parseResource(mutation[resourceName], `Hashnode ${mutationName}.${resourceName} response`);
}

function parseCurrentUser(value: unknown, fieldName: string): Record<string, unknown> {
  const user = requireResponseObject(value, fieldName);
  return {
    id: requireResponseString(user.id, `${fieldName}.id`),
    username: requireResponseString(user.username, `${fieldName}.username`),
    name: requireResponseString(user.name, `${fieldName}.name`),
    email: requireResponseString(user.email, `${fieldName}.email`),
    profilePicture: requireNullableResponseString(user.profilePicture, `${fieldName}.profilePicture`),
    tagline: requireNullableResponseString(user.tagline, `${fieldName}.tagline`),
    location: requireNullableResponseString(user.location, `${fieldName}.location`),
    dateJoined: requireNullableResponseString(user.dateJoined, `${fieldName}.dateJoined`),
  };
}

function parseUserSummary(value: unknown, fieldName: string): Record<string, unknown> {
  const user = requireResponseObject(value, fieldName);
  return {
    id: requireResponseString(user.id, `${fieldName}.id`),
    username: requireResponseString(user.username, `${fieldName}.username`),
    name: requireResponseString(user.name, `${fieldName}.name`),
  };
}

function parsePublicationSummary(value: unknown, fieldName: string): Record<string, unknown> {
  const publication = requireResponseObject(value, fieldName);
  return {
    id: requireResponseString(publication.id, `${fieldName}.id`),
    title: requireResponseString(publication.title, `${fieldName}.title`),
    url: requireNullableResponseString(publication.url, `${fieldName}.url`),
    isTeam: requireResponseBoolean(publication.isTeam, `${fieldName}.isTeam`),
  };
}

function parsePageInfo(value: unknown, fieldName: string): Record<string, unknown> {
  const pageInfo = requireResponseObject(value, fieldName);
  return {
    hasNextPage: requireResponseBoolean(pageInfo.hasNextPage, `${fieldName}.hasNextPage`),
    endCursor: requireNullableResponseString(pageInfo.endCursor, `${fieldName}.endCursor`),
  };
}

function parseTag(value: unknown, fieldName: string): Record<string, unknown> {
  const tag = requireResponseObject(value, fieldName);
  return {
    id: requireResponseString(tag.id, `${fieldName}.id`),
    name: requireResponseString(tag.name, `${fieldName}.name`),
    slug: requireResponseString(tag.slug, `${fieldName}.slug`),
  };
}

function parseContent(value: unknown, fieldName: string): Record<string, unknown> {
  const content = requireResponseObject(value, fieldName);
  return {
    markdown: requireResponseString(content.markdown, `${fieldName}.markdown`),
    html: requireResponseString(content.html, `${fieldName}.html`),
  };
}

function parsePostSummary(value: unknown, fieldName: string): Record<string, unknown> {
  const post = requireResponseObject(value, fieldName);
  return {
    id: requireResponseString(post.id, `${fieldName}.id`),
    title: requireResponseString(post.title, `${fieldName}.title`),
    subtitle: requireNullableResponseString(post.subtitle, `${fieldName}.subtitle`),
    slug: requireResponseString(post.slug, `${fieldName}.slug`),
    url: requireResponseString(post.url, `${fieldName}.url`),
    brief: requireResponseString(post.brief, `${fieldName}.brief`),
    publishedAt: requireResponseString(post.publishedAt, `${fieldName}.publishedAt`),
    updatedAt: requireNullableResponseString(post.updatedAt, `${fieldName}.updatedAt`),
  };
}

function parsePost(value: unknown, fieldName: string): Record<string, unknown> {
  const post = requireResponseObject(value, fieldName);
  return {
    ...parsePostSummary(post, fieldName),
    content: parseContent(post.content, `${fieldName}.content`),
    author: parseUserSummary(post.author, `${fieldName}.author`),
    tags: parseNullableResponseArray(post.tags, `${fieldName}.tags`, parseTag),
    readTimeInMinutes: requireResponseInteger(post.readTimeInMinutes, `${fieldName}.readTimeInMinutes`),
    views: requireNullableResponseInteger(post.views, `${fieldName}.views`),
  };
}

function parsePostMutationResult(value: unknown, fieldName: string): Record<string, unknown> {
  const post = requireResponseObject(value, fieldName);
  return {
    id: requireResponseString(post.id, `${fieldName}.id`),
    title: requireResponseString(post.title, `${fieldName}.title`),
    slug: requireResponseString(post.slug, `${fieldName}.slug`),
    url: requireResponseString(post.url, `${fieldName}.url`),
    publishedAt: requireResponseString(post.publishedAt, `${fieldName}.publishedAt`),
    updatedAt: requireNullableResponseString(post.updatedAt, `${fieldName}.updatedAt`),
  };
}

function parseDraft(value: unknown, fieldName: string): Record<string, unknown> {
  const draft = requireResponseObject(value, fieldName);
  return {
    id: requireResponseString(draft.id, `${fieldName}.id`),
    title: requireNullableResponseString(draft.title, `${fieldName}.title`),
    subtitle: requireNullableResponseString(draft.subtitle, `${fieldName}.subtitle`),
    slug: requireNullableResponseString(draft.slug, `${fieldName}.slug`),
    content: parseNullableResponse(draft.content, `${fieldName}.content`, parseContent),
    author: parseUserSummary(draft.author, `${fieldName}.author`),
    publication: parseNullableResponse(draft.publication, `${fieldName}.publication`, parsePublicationSummary),
    tags: parseNullableResponseArray(draft.tags, `${fieldName}.tags`, parseTag),
    updatedAt: requireResponseString(draft.updatedAt, `${fieldName}.updatedAt`),
    scheduledDate: requireNullableResponseString(draft.scheduledDate, `${fieldName}.scheduledDate`),
    isSubmittedForReview: requireNullableResponseBoolean(
      draft.isSubmittedForReview,
      `${fieldName}.isSubmittedForReview`,
    ),
  };
}

function parseNullableResponse<T>(
  value: unknown,
  fieldName: string,
  parseValue: (value: unknown, fieldName: string) => T,
): T | null {
  if (value === null) {
    return null;
  }
  if (value === undefined) {
    throw responseError(`${fieldName} is missing`);
  }
  return parseValue(value, fieldName);
}

function parseNullableResponseArray(
  value: unknown,
  fieldName: string,
  parseItem: (value: unknown, fieldName: string) => Record<string, unknown>,
): Array<Record<string, unknown>> | null {
  return parseNullableResponse(value, fieldName, (items, arrayFieldName) =>
    requireResponseArray(items, arrayFieldName).map((item, index) => parseItem(item, `${arrayFieldName}[${index}]`)),
  );
}

function requireResponseObject(value: unknown, fieldName: string): Record<string, unknown> {
  return requiredRecord(value, fieldName, responseError);
}

function requireResponseArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw responseError(`${fieldName} must be an array`);
  }
  return value;
}

function requireResponseString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw responseError(`${fieldName} must be a string`);
  }
  return value;
}

function requireNullableResponseString(value: unknown, fieldName: string): string | null {
  return value === null ? null : requireResponseString(value, fieldName);
}

function requireResponseBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw responseError(`${fieldName} must be a boolean`);
  }
  return value;
}

function requireNullableResponseBoolean(value: unknown, fieldName: string): boolean | null {
  return value === null ? null : requireResponseBoolean(value, fieldName);
}

function requireResponseInteger(value: unknown, fieldName: string): number {
  if (!Number.isInteger(value)) {
    throw responseError(`${fieldName} must be an integer`);
  }
  return value as number;
}

function requireNullableResponseInteger(value: unknown, fieldName: string): number | null {
  return value === null ? null : requireResponseInteger(value, fieldName);
}

function responseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, `Hashnode returned an invalid response: ${message}`);
}

function readInteger(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) ? value : fallback;
}

function readOptionalNullableString(value: unknown) {
  return value === null ? null : optionalRawString(value);
}

function readOptionalTrimmedString(value: unknown, fieldName: string): string | undefined {
  return value === undefined ? undefined : requiredString(value, fieldName, providerInputError);
}

function readOptionalNullableTrimmedString(value: unknown, fieldName: string): string | null | undefined {
  return value === null ? null : readOptionalTrimmedString(value, fieldName);
}

function normalizeTags(value: unknown): unknown {
  if (value === undefined || value === null) {
    return value;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "tags must be an array");
  }
  return value.map((item, index) => {
    const tag = requiredRecord(item, `tags[${index}]`, providerInputError);
    return compactObject({
      slug: requiredString(tag.slug, `tags[${index}].slug`, providerInputError),
      name: readOptionalTrimmedString(tag.name, `tags[${index}].name`),
    });
  });
}

function readOptionalNullableBoolean(value: unknown) {
  return value === null ? null : typeof value === "boolean" ? value : undefined;
}
