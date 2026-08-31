import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalRecord,
  optionalString,
  requiredString,
  stringArray,
} from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "slab";
const slabApiBaseUrl = "https://api.slab.com";
const slabGraphqlPath = "/graphql";
const slabGraphqlUrl = new URL(slabGraphqlPath, slabApiBaseUrl);

interface SlabGraphqlRequest {
  query: string;
  variables?: Record<string, unknown>;
  operationName?: string;
}

interface SlabGraphqlPayload {
  data?: unknown;
  errors?: unknown;
}

type SlabActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

const userFields = `
  id
  name
  title
  email
  description
  type
  deactivatedAt
  insertedAt
  updatedAt
  avatar { original thumb preset }
`;

const userSummaryFields = `
  id
  name
  email
`;

const topicSummaryFields = `
  id
  name
  privacy
`;

const topicFields = `
  id
  name
  description
  insertedAt
  updatedAt
  privacy
  memberEditable
  inheritParent
  hierarchy
  parent { ${topicSummaryFields} }
  ancestors { ${topicSummaryFields} }
  children { ${topicSummaryFields} }
  owners { ${userSummaryFields} }
  members { ${userSummaryFields} }
`;

const postFields = `
  id
  linkAccess
  archivedAt
  publishedAt
  title
  insertedAt
  content
  updatedAt
  version
  owner { ${userSummaryFields} }
  topics { ${topicSummaryFields} }
`;

export const slabActionHandlers: ProviderActionHandlers<"slab", SlabActionHandler> = {
  async get_organization(_input, context) {
    const data = await requestSlabData(
      {
        operationName: "GetOrganization",
        query: `
          query GetOrganization {
            organization {
              id
              name
              host
              insertedAt
              updatedAt
            }
          }
        `,
      },
      context,
    );
    return { organization: readObjectField(data, "organization", "Slab organization") };
  },
  async list_users(input, context) {
    const data = await requestSlabData(
      {
        operationName: "ListUsers",
        query: `
          query ListUsers($includeDeactivated: Boolean) {
            organization {
              users(includeDeactivated: $includeDeactivated) {
                ${userFields}
              }
            }
          }
        `,
        variables: compactObject({
          includeDeactivated: optionalBoolean(input.includeDeactivated),
        }),
      },
      context,
    );
    const organization = readObjectField(data, "organization", "Slab organization");
    return {
      users: readArrayField(organization, "users", "Slab users"),
    };
  },
  async get_user(input, context) {
    const data = await requestSlabData(
      {
        operationName: "GetUser",
        query: `
          query GetUser($id: ID!) {
            user(id: $id) {
              ${userFields}
            }
          }
        `,
        variables: { id: requiredString(input.id, "id", providerInputError) },
      },
      context,
    );
    return { user: readObjectField(data, "user", "Slab user") };
  },
  async get_post(input, context) {
    const data = await requestSlabData(
      {
        operationName: "GetPost",
        query: `
          query GetPost($id: ID!) {
            post(id: $id) {
              ${postFields}
            }
          }
        `,
        variables: { id: requiredString(input.id, "id", providerInputError) },
      },
      context,
    );
    return { post: readObjectField(data, "post", "Slab post") };
  },
  async get_posts(input, context) {
    const data = await requestSlabData(
      {
        operationName: "GetPosts",
        query: `
          query GetPosts($ids: [ID!]!) {
            posts(ids: $ids) {
              ${postFields}
            }
          }
        `,
        variables: { ids: stringArray(input.ids, "ids", providerInputError) },
      },
      context,
    );
    return { posts: readArrayField(data, "posts", "Slab posts") };
  },
  async create_post(input, context) {
    const data = await requestSlabData(
      {
        operationName: "CreatePost",
        query: `
          mutation CreatePost($title: String, $topicId: ID, $templateId: ID) {
            createPost(title: $title, topicId: $topicId, templateId: $templateId) {
              ${postFields}
            }
          }
        `,
        variables: compactObject({
          title: optionalString(input.title),
          topicId: optionalString(input.topicId),
          templateId: optionalString(input.templateId),
        }),
      },
      context,
    );
    return { post: readObjectField(data, "createPost", "Slab post") };
  },
  async update_post(input, context) {
    const data = await requestSlabData(
      {
        operationName: "UpdatePost",
        query: `
          mutation UpdatePost(
            $id: ID!
            $ownerId: ID
            $archived: Boolean
            $published: Boolean
            $linkAccess: PostLinkAccess
            $bannerUrl: String
          ) {
            updatePost(
              id: $id
              ownerId: $ownerId
              archived: $archived
              published: $published
              linkAccess: $linkAccess
              bannerUrl: $bannerUrl
            ) {
              ${postFields}
            }
          }
        `,
        variables: compactObject({
          id: requiredString(input.id, "id", providerInputError),
          ownerId: optionalString(input.ownerId),
          archived: optionalBoolean(input.archived),
          published: optionalBoolean(input.published),
          linkAccess: optionalString(input.linkAccess),
          bannerUrl: optionalString(input.bannerUrl),
        }),
      },
      context,
    );
    return { post: readObjectField(data, "updatePost", "Slab post") };
  },
  async sync_post(input, context) {
    const data = await requestSlabData(
      {
        operationName: "SyncPost",
        query: `
          mutation SyncPost(
            $externalId: ID!
            $format: PostContentFormat!
            $content: String!
            $editUrl: String
            $readUrl: String
          ) {
            syncPost(
              externalId: $externalId
              format: $format
              content: $content
              editUrl: $editUrl
              readUrl: $readUrl
            ) {
              ${postFields}
            }
          }
        `,
        variables: compactObject({
          externalId: requiredString(input.externalId, "externalId", providerInputError),
          format: requiredString(input.format, "format", providerInputError),
          content: requiredString(input.content, "content", providerInputError),
          editUrl: optionalString(input.editUrl),
          readUrl: optionalString(input.readUrl),
        }),
      },
      context,
    );
    return { post: readObjectField(data, "syncPost", "Slab post") };
  },
  async delete_post(input, context) {
    const data = await requestSlabData(
      {
        operationName: "DeletePost",
        query: `
          mutation DeletePost($id: ID!) {
            deletePost(id: $id) {
              ${postFields}
            }
          }
        `,
        variables: { id: requiredString(input.id, "id", providerInputError) },
      },
      context,
    );
    return { post: readObjectField(data, "deletePost", "Slab post") };
  },
  async get_topic(input, context) {
    const data = await requestSlabData(
      {
        operationName: "GetTopic",
        query: `
          query GetTopic($id: ID!) {
            topic(id: $id) {
              ${topicFields}
            }
          }
        `,
        variables: { id: requiredString(input.id, "id", providerInputError) },
      },
      context,
    );
    return { topic: readObjectField(data, "topic", "Slab topic") };
  },
  async get_topics(input, context) {
    const data = await requestSlabData(
      {
        operationName: "GetTopics",
        query: `
          query GetTopics($ids: [ID!]!) {
            topics(ids: $ids) {
              ${topicFields}
            }
          }
        `,
        variables: { ids: stringArray(input.ids, "ids", providerInputError) },
      },
      context,
    );
    return { topics: readArrayField(data, "topics", "Slab topics") };
  },
  async create_topic(input, context) {
    const data = await requestSlabData(
      {
        operationName: "CreateTopic",
        query: `
          mutation CreateTopic(
            $name: String!
            $description: Json
            $parentId: ID
            $memberEditable: TopicMemberEditable
            $privacy: TopicPrivacy
            $inheritParent: Boolean
          ) {
            createTopic(
              name: $name
              description: $description
              parentId: $parentId
              memberEditable: $memberEditable
              privacy: $privacy
              inheritParent: $inheritParent
            ) {
              ${topicFields}
            }
          }
        `,
        variables: compactObject({
          name: requiredString(input.name, "name", providerInputError),
          description: input.description,
          parentId: optionalString(input.parentId),
          memberEditable: optionalString(input.memberEditable),
          privacy: optionalString(input.privacy),
          inheritParent: optionalBoolean(input.inheritParent),
        }),
      },
      context,
    );
    return { topic: readObjectField(data, "createTopic", "Slab topic") };
  },
  async update_topic(input, context) {
    const data = await requestSlabData(
      {
        operationName: "UpdateTopic",
        query: `
          mutation UpdateTopic(
            $id: ID!
            $name: String
            $description: Json
            $parentId: ID
            $memberEditable: TopicMemberEditable
            $privacy: TopicPrivacy
            $bannerUrl: String
            $inheritParent: Boolean
            $propagatePrivacy: Boolean
          ) {
            updateTopic(
              id: $id
              name: $name
              description: $description
              parentId: $parentId
              memberEditable: $memberEditable
              privacy: $privacy
              bannerUrl: $bannerUrl
              inheritParent: $inheritParent
              propagatePrivacy: $propagatePrivacy
            ) {
              ${topicFields}
            }
          }
        `,
        variables: compactObject({
          id: requiredString(input.id, "id", providerInputError),
          name: optionalString(input.name),
          description: input.description,
          parentId: optionalString(input.parentId),
          memberEditable: optionalString(input.memberEditable),
          privacy: optionalString(input.privacy),
          bannerUrl: optionalString(input.bannerUrl),
          inheritParent: optionalBoolean(input.inheritParent),
          propagatePrivacy: optionalBoolean(input.propagatePrivacy),
        }),
      },
      context,
    );
    return { topic: readObjectField(data, "updateTopic", "Slab topic") };
  },
  async delete_topic(input, context) {
    const data = await requestSlabData(
      {
        operationName: "DeleteTopic",
        query: `
          mutation DeleteTopic($id: ID!) {
            deleteTopic(id: $id) {
              ${topicFields}
            }
          }
        `,
        variables: { id: requiredString(input.id, "id", providerInputError) },
      },
      context,
    );
    return { topic: readObjectField(data, "deleteTopic", "Slab topic") };
  },
  async add_topic_to_post(input, context) {
    const data = await requestSlabData(
      {
        operationName: "AddTopicToPost",
        query: `
          mutation AddTopicToPost($postId: ID!, $topicId: ID!) {
            addTopicToPost(postId: $postId, topicId: $topicId) {
              ${topicFields}
            }
          }
        `,
        variables: {
          postId: requiredString(input.postId, "postId", providerInputError),
          topicId: requiredString(input.topicId, "topicId", providerInputError),
        },
      },
      context,
    );
    return { topic: readObjectField(data, "addTopicToPost", "Slab topic") };
  },
  async remove_topic_from_post(input, context) {
    const data = await requestSlabData(
      {
        operationName: "RemoveTopicFromPost",
        query: `
          mutation RemoveTopicFromPost($postId: ID!, $topicId: ID!) {
            removeTopicFromPost(postId: $postId, topicId: $topicId) {
              ${topicFields}
            }
          }
        `,
        variables: {
          postId: requiredString(input.postId, "postId", providerInputError),
          topicId: requiredString(input.topicId, "topicId", providerInputError),
        },
      },
      context,
    );
    return { topic: readObjectField(data, "removeTopicFromPost", "Slab topic") };
  },
  async search(input, context) {
    const data = await requestSlabData(
      {
        operationName: "Search",
        query: `
          query Search(
            $query: String!
            $types: [SearchType!]
            $first: Int
            $after: String
            $last: Int
            $before: String
          ) {
            search(
              query: $query
              types: $types
              first: $first
              after: $after
              last: $last
              before: $before
            ) {
              pageInfo {
                hasPreviousPage
                hasNextPage
                startCursor
                endCursor
              }
              edges {
                cursor
                node {
                  __typename
                  ... on PostSearchResult {
                    title
                    highlight
                    content
                    post { ${postFields} }
                  }
                  ... on TopicSearchResult {
                    name
                    description
                    topic { ${topicFields} }
                  }
                  ... on UserSearchResult {
                    name
                    title
                    description
                    user { ${userFields} }
                  }
                  ... on CommentSearchResult {
                    content
                    comment {
                      id
                      content
                      insertedAt
                      author { ${userSummaryFields} }
                    }
                  }
                }
              }
            }
          }
        `,
        variables: compactObject({
          query: requiredString(input.query, "query", providerInputError),
          types: Array.isArray(input.types) ? input.types : undefined,
          first: input.first,
          after: optionalString(input.after),
          last: input.last,
          before: optionalString(input.before),
        }),
      },
      context,
    );
    const search = readObjectField(data, "search", "Slab search result connection");
    return normalizeSearchOutput(search);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, slabActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const data = await requestSlabData(
      {
        operationName: "ValidateSlabCredential",
        query: `
          query ValidateSlabCredential {
            organization {
              id
              name
              host
            }
          }
        `,
      },
      { apiKey: input.apiKey, fetcher, signal },
      "validate",
    );
    const organization = readObjectField(data, "organization", "Slab organization");
    const organizationId = optionalString(organization.id);
    const organizationName = optionalString(organization.name);
    const organizationHost = optionalString(organization.host);

    return {
      profile: {
        accountId: organizationId ? `slab:${organizationId}` : "slab:api-key",
        displayName: organizationName ?? organizationHost ?? "Slab API Token",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: slabApiBaseUrl,
        graphqlEndpoint: slabGraphqlPath,
        organizationId,
        organizationHost,
      },
    };
  },
};

async function requestSlabData(
  request: SlabGraphqlRequest,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: "execute" | "validate" = "execute",
): Promise<Record<string, unknown>> {
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(slabGraphqlUrl, {
      method: "POST",
      headers: slabHeaders(context.apiKey),
      body: JSON.stringify(request),
      signal: context.signal,
    });
    payload = await readSlabPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `slab request failed: ${error.message}` : "slab request failed",
    );
  }

  if (!response.ok) {
    throw createSlabHttpError(response, payload, phase);
  }

  const graphqlPayload = asGraphqlPayload(payload);
  if (graphqlPayload.errors !== undefined) {
    throw createSlabGraphqlError(graphqlPayload.errors, phase);
  }
  if (graphqlPayload.data === undefined) {
    throw new ProviderRequestError(502, "slab response did not include data");
  }

  return readObject(graphqlPayload.data, "Slab data");
}

function slabHeaders(apiKey: string): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey}`,
    accept: "application/json",
    "content-type": "application/json",
    "user-agent": providerUserAgent,
  };
}

async function readSlabPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createSlabHttpError(
  response: Response,
  payload: unknown,
  phase: "execute" | "validate",
): ProviderRequestError {
  const message = extractSlabErrorMessage(payload) ?? `slab request failed with ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : 400, message, payload);
}

function createSlabGraphqlError(errors: unknown, phase: "execute" | "validate"): ProviderRequestError {
  const message = extractSlabErrorMessage(errors) ?? "slab GraphQL request failed";
  const code = readFirstGraphqlErrorCode(errors);
  if (code === "UNAUTHENTICATED" || code === "FORBIDDEN") {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, errors);
  }
  return new ProviderRequestError(502, message, errors);
}

function extractSlabErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload;
  }
  if (Array.isArray(payload)) {
    const messages = payload
      .map((item) => optionalRecord(item)?.message)
      .filter((item): item is string => typeof item === "string" && item.length > 0);
    return messages.length > 0 ? messages.join("; ") : undefined;
  }
  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }
  if (typeof object.message === "string") {
    return object.message;
  }
  if (typeof object.error === "string") {
    return object.error;
  }
  return extractSlabErrorMessage(object.errors);
}

function readFirstGraphqlErrorCode(errors: unknown): string | undefined {
  if (!Array.isArray(errors)) {
    return undefined;
  }
  const first = optionalRecord(errors[0]);
  const extensions = optionalRecord(first?.extensions);
  return typeof extensions?.code === "string" ? extensions.code : undefined;
}

function asGraphqlPayload(payload: unknown): SlabGraphqlPayload {
  const object = optionalRecord(payload);
  if (!object) {
    throw new ProviderRequestError(502, "slab response was not a JSON object");
  }
  return object as SlabGraphqlPayload;
}

function normalizeSearchOutput(search: Record<string, unknown>): Record<string, unknown> {
  const edges = readArrayField(search, "edges", "Slab search edges");
  return {
    pageInfo: readObjectField(search, "pageInfo", "Slab pageInfo"),
    results: edges.map((edge) => normalizeSearchEdge(readObject(edge, "Slab search edge"))),
  };
}

function normalizeSearchEdge(edge: Record<string, unknown>): Record<string, unknown> {
  const node = readObjectField(edge, "node", "Slab search result node");
  const typeName = optionalString(node.__typename);
  const base = compactObject({
    cursor: optionalString(edge.cursor),
    highlight: node.highlight,
  });

  switch (typeName) {
    case "PostSearchResult":
      return compactObject({
        ...base,
        type: "POST",
        title: optionalString(node.title),
        content: node.content,
        post: readObjectField(node, "post", "Slab post search result"),
      });
    case "TopicSearchResult":
      return compactObject({
        ...base,
        type: "TOPIC",
        title: optionalString(node.name),
        content: node.description,
        topic: readObjectField(node, "topic", "Slab topic search result"),
      });
    case "UserSearchResult":
      return compactObject({
        ...base,
        type: "USER",
        title: optionalString(node.name),
        content: node.description,
        user: readObjectField(node, "user", "Slab user search result"),
      });
    case "CommentSearchResult":
      return compactObject({
        ...base,
        type: "COMMENT",
        content: node.content,
        comment: readObjectField(node, "comment", "Slab comment search result"),
      });
    default:
      throw new ProviderRequestError(502, "slab search returned an unknown result type");
  }
}

function readObject(value: unknown, label: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `${label} was not an object`);
  }
  return object;
}

function readObjectField(source: Record<string, unknown>, key: string, label: string): Record<string, unknown> {
  return readObject(source[key], label);
}

function readArrayField(source: Record<string, unknown>, key: string, label: string): unknown[] {
  const value = source[key];
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} was not an array`);
  }
  return value;
}
