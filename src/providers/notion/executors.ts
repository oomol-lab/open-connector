import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { compactObject } from "../../core/cast.ts";
import {
  createProviderFetch,
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireBearerCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "notion";
const notionApiBaseUrl = "https://api.notion.com/v1";
const notionFetch = createProviderFetch({ skipDnsValidation: true });
const notionCoreVersion = "2026-03-11";

type NotionObject = Record<string, unknown>;

interface NotionRequestInput {
  method?: string;
  path: string;
  query?: Record<string, string | number | Array<string | number> | undefined>;
  body?: Record<string, unknown>;
}

interface NotionActionContext {
  accessToken: string;
  fetcher: typeof fetch;
}

type NotionActionHandler = (input: Record<string, unknown>, context: NotionActionContext) => Promise<unknown>;

export const notionActionHandlers: Record<string, NotionActionHandler> = {
  search(input, context): Promise<unknown> {
    return notionSearch(input, context.accessToken, context.fetcher);
  },
  get_page(input, context): Promise<unknown> {
    return notionGetPage(input, context.accessToken, context.fetcher);
  },
  create_page(input, context): Promise<unknown> {
    return notionCreatePage(input, context.accessToken, context.fetcher);
  },
  update_page(input, context): Promise<unknown> {
    return notionUpdatePage(input, context.accessToken, context.fetcher);
  },
  move_page(input, context): Promise<unknown> {
    return notionMovePage(input, context.accessToken, context.fetcher);
  },
  append_block(input, context): Promise<unknown> {
    return notionAppendBlock(input, context.accessToken, context.fetcher);
  },
  retrieve_page(input, context): Promise<unknown> {
    return notionRetrievePage(input, context.accessToken, context.fetcher);
  },
  retrieve_page_markdown(input, context): Promise<unknown> {
    return notionRetrievePageMarkdown(input, context.accessToken, context.fetcher);
  },
  update_page_markdown(input, context): Promise<unknown> {
    return notionUpdatePageMarkdown(input, context.accessToken, context.fetcher);
  },
  retrieve_page_property(input, context): Promise<unknown> {
    return notionRetrievePageProperty(input, context.accessToken, context.fetcher);
  },
  list_users(input, context): Promise<unknown> {
    return notionListUsers(input, context.accessToken, context.fetcher);
  },
  retrieve_user(input, context): Promise<unknown> {
    return notionRetrieveUser(input, context.accessToken, context.fetcher);
  },
  retrieve_block(input, context): Promise<unknown> {
    return notionRetrieveBlock(input, context.accessToken, context.fetcher);
  },
  list_block_children(input, context): Promise<unknown> {
    return notionListBlockChildren(input, context.accessToken, context.fetcher);
  },
  append_block_children(input, context): Promise<unknown> {
    return notionAppendBlockChildren(input, context.accessToken, context.fetcher);
  },
  update_block(input, context): Promise<unknown> {
    return notionUpdateBlock(input, context.accessToken, context.fetcher);
  },
  delete_block(input, context): Promise<unknown> {
    return notionDeleteBlock(input, context.accessToken, context.fetcher);
  },
  create_database(input, context): Promise<unknown> {
    return notionCreateDatabase(input, context.accessToken, context.fetcher);
  },
  retrieve_database(input, context): Promise<unknown> {
    return notionRetrieveDatabase(input, context.accessToken, context.fetcher);
  },
  update_database(input, context): Promise<unknown> {
    return notionUpdateDatabase(input, context.accessToken, context.fetcher);
  },
  create_data_source(input, context): Promise<unknown> {
    return notionCreateDataSource(input, context.accessToken, context.fetcher);
  },
  retrieve_data_source(input, context): Promise<unknown> {
    return notionRetrieveDataSource(input, context.accessToken, context.fetcher);
  },
  update_data_source(input, context): Promise<unknown> {
    return notionUpdateDataSource(input, context.accessToken, context.fetcher);
  },
  query_data_source(input, context): Promise<unknown> {
    return notionQueryDataSource(input, context.accessToken, context.fetcher);
  },
  list_data_source_templates(input, context): Promise<unknown> {
    return notionListDataSourceTemplates(input, context.accessToken, context.fetcher);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<NotionActionContext>({
  service,
  handlers: notionActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<NotionActionContext> {
    const credential = await requireBearerCredential(context, service);
    return { accessToken: credential.accessToken, fetcher };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireBearerCredential(context, service);
    const url = createProviderProxyUrl(notionApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("authorization", `${credential.tokenType} ${credential.accessToken}`);
    headers.set("notion-version", notionCoreVersion);
    headers.set("user-agent", providerUserAgent);

    const init: RequestInit = {
      method: input.method,
      headers,
      signal: context.signal,
    };
    if (input.body !== undefined) {
      init.body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
      if (!headers.has("content-type") && typeof input.body !== "string") {
        headers.set("content-type", "application/json");
      }
    }

    const response = await notionFetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `Notion request failed with HTTP ${response.status}`);
    }

    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "Notion request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    return validateNotionCredential(input.apiKey, fetcher);
  },
  async oauth2(input, { fetcher }) {
    return validateNotionCredential(input.accessToken, fetcher);
  },
};

async function validateNotionCredential(
  accessToken: string,
  fetcher: typeof fetch,
): Promise<{
  profile: { accountId: string; displayName: string };
  metadata: Record<string, unknown>;
}> {
  const profile = await fetchNotionCurrentAccount(accessToken, fetcher);
  return {
    profile: {
      accountId: profile.providerAccountId,
      displayName: profile.accountLabel,
    },
    metadata: profile.providerMetadata,
  };
}

async function fetchNotionCurrentAccount(accessToken: string, fetcher: typeof fetch) {
  const response = await fetcher("https://api.notion.com/v1/users/me", {
    headers: buildNotionHeaders(accessToken, "/users/me", false),
  });

  await assertNotionResponse(response);
  const payload = (await response.json()) as {
    id: string;
    name?: string;
    bot?: { workspace_name?: string };
    workspace_name?: string;
  };

  return {
    providerAccountId: payload.id,
    accountLabel: payload.bot?.workspace_name ?? payload.name ?? payload.workspace_name ?? payload.id,
    providerMetadata: payload as Record<string, unknown>,
  };
}

async function notionSearch(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await notionRequest<NotionObject>(
    accessToken,
    {
      method: "POST",
      path: "/search",
      body: compactObject({
        query: String(input.query),
        filter: asObject(input.filter),
        sort: asObject(input.sort),
        page_size: asNumber(input.pageSize),
        start_cursor: asNonEmptyString(input.startCursor),
      }),
    },
    fetcher,
  );

  return payload ?? {};
}

async function notionRetrievePage(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const pageId = String(input.pageId);
  const page = await notionRequest<NotionObject>(
    accessToken,
    {
      path: `/pages/${pageId}`,
    },
    fetcher,
  );

  return page ?? {};
}

async function notionRetrievePageMarkdown(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const pageId = String(input.pageId);
  const payload = await notionRequest<NotionObject>(
    accessToken,
    {
      path: `/pages/${pageId}/markdown`,
      query: compactQuery({
        include_transcript: typeof input.includeTranscript === "boolean" ? String(input.includeTranscript) : undefined,
      }),
    },
    fetcher,
  );

  return payload ?? {};
}

async function notionRetrievePageProperty(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await notionRequest<NotionObject>(
    accessToken,
    {
      path: `/pages/${String(input.pageId)}/properties/${String(input.propertyId)}`,
      query: compactQuery({
        page_size: asNumber(input.pageSize),
        start_cursor: asNonEmptyString(input.startCursor),
      }),
    },
    fetcher,
  );

  return payload ?? {};
}

async function notionUpdatePageMarkdown(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const pageId = String(input.pageId);
  const payload = await notionRequest<NotionObject>(
    accessToken,
    {
      method: "PATCH",
      path: `/pages/${pageId}/markdown`,
      body: buildUpdatePageMarkdownBody(input),
    },
    fetcher,
  );

  return payload ?? {};
}

async function notionCreatePage(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await notionRequest<NotionObject>(
    accessToken,
    {
      method: "POST",
      path: "/pages",
      body: buildCreatePageBody(input),
    },
    fetcher,
  );

  return payload ?? {};
}

async function notionMovePage(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await notionRequest<NotionObject>(
    accessToken,
    {
      method: "POST",
      path: `/pages/${String(input.pageId)}/move`,
      body: {
        parent: asObject(input.parent),
      },
    },
    fetcher,
  );

  return payload ?? {};
}

async function notionUpdatePage(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const pageId = String(input.pageId);
  const properties = asObject(input.properties);
  const nextProperties =
    typeof input.title === "string"
      ? {
          ...properties,
          title: buildTitleProperty(input.title),
        }
      : properties;
  const body = compactObject({
    properties: nextProperties,
    icon: asObject(input.icon),
    cover: asObject(input.cover),
    template: asObject(input.template),
    in_trash: typeof input.in_trash === "boolean" ? input.in_trash : undefined,
    is_locked: typeof input.is_locked === "boolean" ? input.is_locked : undefined,
    erase_content: typeof input.erase_content === "boolean" ? input.erase_content : undefined,
  });

  const payload = await notionRequest<NotionObject>(
    accessToken,
    {
      method: "PATCH",
      path: `/pages/${pageId}`,
      body,
    },
    fetcher,
  );

  return payload ?? {};
}

async function notionGetPage(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const pageId = String(input.pageId);
  const [page, blockChildren] = await Promise.all([
    notionRetrievePage({ pageId }, accessToken, fetcher),
    notionListBlockChildren({ blockId: pageId }, accessToken, fetcher),
  ]);

  return {
    page,
    block_children: blockChildren,
  };
}

async function notionRetrieveBlock(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await notionRequest<NotionObject>(
    accessToken,
    {
      path: `/blocks/${String(input.blockId)}`,
    },
    fetcher,
  );

  return payload ?? {};
}

async function notionListUsers(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await notionRequest<NotionObject>(
    accessToken,
    {
      path: "/users",
      query: compactQuery({
        page_size: asNumber(input.pageSize),
        start_cursor: asNonEmptyString(input.startCursor),
      }),
    },
    fetcher,
  );

  return payload ?? {};
}

async function notionRetrieveUser(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await notionRequest<NotionObject>(
    accessToken,
    {
      path: `/users/${String(input.userId)}`,
    },
    fetcher,
  );

  return payload ?? {};
}

async function notionListBlockChildren(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await notionRequest<NotionObject>(
    accessToken,
    {
      path: `/blocks/${String(input.blockId)}/children`,
      query: compactQuery({
        page_size: asNumber(input.pageSize),
        start_cursor: asNonEmptyString(input.startCursor),
      }),
    },
    fetcher,
  );

  return payload ?? {};
}

async function notionAppendBlockChildren(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await notionRequest<NotionObject>(
    accessToken,
    {
      method: "PATCH",
      path: `/blocks/${String(input.blockId)}/children`,
      body: compactObject({
        children: Array.isArray(input.children) ? input.children : [],
        position: asObject(input.position),
      }),
    },
    fetcher,
  );

  return payload ?? {};
}

async function notionUpdateBlock(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const { blockId, ...rest } = input;
  const payload = await notionRequest<NotionObject>(
    accessToken,
    {
      method: "PATCH",
      path: `/blocks/${String(blockId)}`,
      body: compactObject({
        ...rest,
        in_trash: typeof input.in_trash === "boolean" ? input.in_trash : undefined,
      }),
    },
    fetcher,
  );

  return payload ?? {};
}

async function notionDeleteBlock(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await notionRequest<NotionObject>(
    accessToken,
    {
      method: "DELETE",
      path: `/blocks/${String(input.blockId)}`,
    },
    fetcher,
  );

  return payload ?? {};
}

async function notionAppendBlock(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await notionAppendBlockChildren(
    {
      blockId: String(input.pageId),
      children: [
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                type: "text",
                text: { content: String(input.text) },
              },
            ],
          },
        },
      ],
    },
    accessToken,
    fetcher,
  );

  return payload;
}

async function notionCreateDatabase(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await notionRequest<NotionObject>(
    accessToken,
    {
      method: "POST",
      path: "/databases",
      body: compactObject({
        parent: asObject(input.parent),
        title: Array.isArray(input.title) ? input.title : undefined,
        description: Array.isArray(input.description) ? input.description : undefined,
        is_inline: typeof input.is_inline === "boolean" ? input.is_inline : undefined,
        initial_data_source: asObject(input.initial_data_source),
        icon: asObject(input.icon),
        cover: asObject(input.cover),
      }),
    },
    fetcher,
  );

  return payload ?? {};
}

async function notionRetrieveDatabase(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await notionRequest<NotionObject>(
    accessToken,
    {
      path: `/databases/${String(input.databaseId)}`,
    },
    fetcher,
  );

  return payload ?? {};
}

async function notionUpdateDatabase(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await notionRequest<NotionObject>(
    accessToken,
    {
      method: "PATCH",
      path: `/databases/${String(input.databaseId)}`,
      body: compactObject({
        parent: asObject(input.parent),
        title: Array.isArray(input.title) ? input.title : undefined,
        description: Array.isArray(input.description) ? input.description : undefined,
        is_inline: typeof input.is_inline === "boolean" ? input.is_inline : undefined,
        icon: asObject(input.icon),
        cover: asObject(input.cover),
        in_trash: typeof input.in_trash === "boolean" ? input.in_trash : undefined,
        is_locked: typeof input.is_locked === "boolean" ? input.is_locked : undefined,
      }),
    },
    fetcher,
  );

  return payload ?? {};
}

async function notionCreateDataSource(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await notionRequest<NotionObject>(
    accessToken,
    {
      method: "POST",
      path: "/data_sources",
      body: compactObject({
        parent: asObject(input.parent),
        properties: asObject(input.properties),
        title: Array.isArray(input.title) ? input.title : undefined,
        icon: asObject(input.icon),
      }),
    },
    fetcher,
  );

  return payload ?? {};
}

async function notionRetrieveDataSource(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await notionRequest<NotionObject>(
    accessToken,
    {
      path: `/data_sources/${String(input.dataSourceId)}`,
    },
    fetcher,
  );

  return payload ?? {};
}

async function notionUpdateDataSource(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await notionRequest<NotionObject>(
    accessToken,
    {
      method: "PATCH",
      path: `/data_sources/${String(input.dataSourceId)}`,
      body: compactObject({
        title: Array.isArray(input.title) ? input.title : undefined,
        description: Array.isArray(input.description) ? input.description : undefined,
        icon: asObject(input.icon),
        properties: asObject(input.properties),
        in_trash: typeof input.in_trash === "boolean" ? input.in_trash : undefined,
        parent: asObject(input.parent),
      }),
    },
    fetcher,
  );

  return payload ?? {};
}

async function notionQueryDataSource(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const filterProperties = Array.isArray(input.filterProperties)
    ? input.filterProperties.map((item) => (typeof item === "string" ? item : "")).filter((item) => item.length > 0)
    : undefined;

  const payload = await notionRequest<NotionObject>(
    accessToken,
    {
      method: "POST",
      path: `/data_sources/${String(input.dataSourceId)}/query`,
      query: compactQuery({
        "filter_properties[]": filterProperties,
      }),
      body: compactObject({
        filter: asObject(input.filter),
        sorts: Array.isArray(input.sorts) ? input.sorts : undefined,
        page_size: asNumber(input.pageSize),
        start_cursor: asNonEmptyString(input.startCursor),
        in_trash: typeof input.in_trash === "boolean" ? input.in_trash : undefined,
        result_type: asNonEmptyString(input.result_type),
      }),
    },
    fetcher,
  );

  return payload ?? {};
}

async function notionListDataSourceTemplates(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const payload = await notionRequest<NotionObject>(
    accessToken,
    {
      path: `/data_sources/${String(input.dataSourceId)}/templates`,
      query: compactQuery({
        page_size: asNumber(input.pageSize),
        start_cursor: asNonEmptyString(input.startCursor),
      }),
    },
    fetcher,
  );

  return payload ?? {};
}

async function notionRequest<T>(accessToken: string, input: NotionRequestInput, fetcher: typeof fetch) {
  const url = new URL(`https://api.notion.com/v1${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value == null) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  const init: RequestInit = {
    method: input.method ?? "GET",
    headers: buildNotionHeaders(accessToken, input.path, input.body != null),
  };
  if (input.body) {
    init.body = JSON.stringify(input.body);
  }

  const response = await fetcher(url.toString(), init);

  await assertNotionResponse(response);
  return parseJsonBody<T>(response);
}

function buildNotionHeaders(accessToken: string, path: string, hasBody: boolean) {
  const headers: Record<string, string> = {
    authorization: `Bearer ${accessToken}`,
    "notion-version": notionCoreVersion,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }

  return headers;
}

async function parseJsonBody<T>(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) {
    return null as T;
  }

  return JSON.parse(text) as T;
}

async function assertNotionResponse(response: Response) {
  if (response.ok) {
    return;
  }

  const errorBody = await parseNotionErrorBody(response);
  const message = errorBody.message || `notion request failed with ${response.status}`;
  if (response.status === 400 && errorBody.code === "validation_error") {
    throw new ProviderRequestError(400, message);
  }
  if (response.status === 401) {
    throw new ProviderRequestError(401, message);
  }
  if (response.status === 403) {
    throw new ProviderRequestError(403, message);
  }
  if (response.status === 429) {
    throw new ProviderRequestError(429, message);
  }

  throw new ProviderRequestError(response.status, message);
}

async function parseNotionErrorBody(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) {
    return { code: "", message: "" };
  }

  try {
    const parsed = JSON.parse(text) as {
      code?: string;
      message?: string;
      error?: string;
    };
    return {
      code: parsed.code ?? "",
      message: parsed.message ?? parsed.error ?? text,
    };
  } catch {
    return {
      code: "",
      message: text,
    };
  }
}

function buildCreatePageBody(input: Record<string, unknown>) {
  const parent = asObject(input.parent);
  const parentId = asNonEmptyString(input.parentId);
  const children = Array.isArray(input.children) && input.children.length > 0 ? input.children : undefined;
  const markdown = typeof input.markdown === "string" ? input.markdown : undefined;
  const icon = asObject(input.icon);
  const cover = asObject(input.cover);
  const template = asObject(input.template);
  const properties = asObject(input.properties);

  if (markdown && children) {
    throw new ProviderRequestError(400, "markdown cannot be used with children");
  }

  if (parent) {
    if (typeof input.title === "string") {
      throw new ProviderRequestError(400, "title cannot be used with parent; use properties instead");
    }
    if (parentId && !isSamePageParent(parent, parentId)) {
      throw new ProviderRequestError(400, "parent and parentId must describe the same page parent");
    }

    return compactObject({
      parent,
      properties,
      children,
      markdown,
      template,
      icon,
      cover,
    });
  }

  const title = asNonEmptyString(input.title);
  if (!parentId && !markdown) {
    throw new ProviderRequestError(400, "parent, parentId + title, or markdown is required");
  }
  if (parentId && !title) {
    throw new ProviderRequestError(400, "title is required with parentId");
  }

  return compactObject({
    parent: parentId ? { page_id: parentId } : undefined,
    properties: title
      ? {
          ...properties,
          title: buildTitleProperty(title),
        }
      : properties,
    children,
    markdown,
    template,
    icon,
    cover,
  });
}

function buildUpdatePageMarkdownBody(input: Record<string, unknown>) {
  return compactObject({
    type: asNonEmptyString(input.type),
    insert_content: asObject(input.insert_content),
    replace_content_range: asObject(input.replace_content_range),
    update_content: asObject(input.update_content),
    replace_content: asObject(input.replace_content),
  });
}

function isSamePageParent(parent: NotionObject, parentId: string) {
  return typeof parent.page_id === "string" && parent.page_id === parentId;
}

function buildTitleProperty(title: string) {
  return {
    title: [
      {
        type: "text",
        text: { content: title },
      },
    ],
  };
}

function compactQuery<T extends Record<string, string | number | Array<string | number> | undefined>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => {
      if (item === undefined) {
        return false;
      }
      if (Array.isArray(item)) {
        return item.length > 0;
      }
      return true;
    }),
  ) as Record<string, string | number | Array<string | number>>;
}

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function asNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function asNonEmptyString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
