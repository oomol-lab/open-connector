import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";
import type { ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { FigmaActionName } from "./actions.ts";

import {
  compactObject,
  objectArray,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderFetch,
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  toProviderProxyError,
} from "../provider-runtime.ts";
import { figmaProviderScopes } from "./scopes.ts";

const service = "figma";
const figmaApiBaseUrl = "https://api.figma.com";

const figmaFetch = createProviderFetch({ skipDnsValidation: true });

type FigmaRequestPhase = "validate" | "execute";

interface FigmaAuth {
  type: "api_key" | "oauth2";
  token: string;
}

interface FigmaActionContext {
  auth: FigmaAuth;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface FigmaRequestOptions {
  method: string;
  path: string;
  auth: FigmaAuth;
  fetcher: ProviderFetch;
  phase: FigmaRequestPhase;
  signal?: AbortSignal;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

interface FigmaResponse {
  payload: unknown;
}

type FigmaActionHandler = ProviderRuntimeHandler<FigmaActionContext>;

export const figmaActionHandlers: Record<FigmaActionName, FigmaActionHandler> = {
  get_current_user(_input, context) {
    return getCurrentUser(context);
  },
  get_file_metadata(input, context) {
    return getFileMetadata(input, context);
  },
  get_file(input, context) {
    return getFile(input, context);
  },
  get_file_nodes(input, context) {
    return getFileNodes(input, context);
  },
  render_images(input, context) {
    return renderImages(input, context);
  },
  get_image_fills(input, context) {
    return getImageFills(input, context);
  },
  list_file_versions(input, context) {
    return listFileVersions(input, context);
  },
  list_comments(input, context) {
    return listComments(input, context);
  },
  post_comment(input, context) {
    return postComment(input, context);
  },
  delete_comment(input, context) {
    return deleteComment(input, context);
  },
  list_comment_reactions(input, context) {
    return listCommentReactions(input, context);
  },
  post_comment_reaction(input, context) {
    return postCommentReaction(input, context);
  },
  delete_comment_reaction(input, context) {
    return deleteCommentReaction(input, context);
  },
  list_team_projects(input, context) {
    return listTeamProjects(input, context);
  },
  get_project_metadata(input, context) {
    return getProjectMetadata(input, context);
  },
  list_project_files(input, context) {
    return listProjectFiles(input, context);
  },
  list_file_components(input, context) {
    return listFileComponents(input, context);
  },
  list_file_component_sets(input, context) {
    return listFileComponentSets(input, context);
  },
  list_file_styles(input, context) {
    return listFileStyles(input, context);
  },
  get_component(input, context) {
    return getComponent(input, context);
  },
  get_component_set(input, context) {
    return getComponentSet(input, context);
  },
  get_style(input, context) {
    return getStyle(input, context);
  },
  get_dev_resources(input, context) {
    return getDevResources(input, context);
  },
  create_dev_resources(input, context) {
    return createDevResources(input, context);
  },
  update_dev_resources(input, context) {
    return updateDevResources(input, context);
  },
  delete_dev_resource(input, context) {
    return deleteDevResource(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<FigmaActionContext>({
  service,
  skipDnsValidation: true,
  handlers: figmaActionHandlers,
  async createContext(context: ExecutionContext, fetcher: ProviderFetch): Promise<FigmaActionContext> {
    const credential = await context.getCredential(service);
    if (credential?.authType === "api_key") {
      return {
        auth: {
          type: "api_key",
          token: credential.apiKey,
        },
        fetcher,
        signal: context.signal,
      };
    }
    if (credential?.authType === "oauth2") {
      return {
        auth: {
          type: "oauth2",
          token: credential.accessToken,
        },
        fetcher,
        signal: context.signal,
      };
    }

    throw new ProviderRequestError(401, "Configure figma API key or OAuth credentials first.");
  },
});

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const auth = await resolveFigmaAuth(context);
    const url = createProviderProxyUrl(figmaApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    applyFigmaProxyAuth(headers, auth);
    headers.set("user-agent", providerUserAgent);
    if (input.body !== undefined && !headers.has("content-type") && typeof input.body !== "string") {
      headers.set("content-type", "application/json");
    }

    const response = await figmaFetch(url, {
      method: input.method,
      headers,
      body:
        input.body === undefined ? undefined : typeof input.body === "string" ? input.body : JSON.stringify(input.body),
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
    const user = await figmaGetJson({
      path: "/v1/me",
      auth: { type: "api_key", token: input.apiKey },
      fetcher,
      signal,
      phase: "validate",
    });

    return {
      profile: normalizeFigmaCurrentAccount(user),
      grantedScopes: [...figmaProviderScopes],
      metadata: {
        apiBaseUrl: figmaApiBaseUrl,
        validationEndpoint: "/v1/me",
        currentUser: user,
      },
    };
  },
  async oauth2(input, { fetcher, signal }) {
    const user = await figmaGetJson({
      path: "/v1/me",
      auth: { type: "oauth2", token: input.accessToken },
      fetcher,
      signal,
      phase: "validate",
    });

    return {
      profile: normalizeFigmaCurrentAccount(user),
      metadata: {
        apiBaseUrl: figmaApiBaseUrl,
        validationEndpoint: "/v1/me",
        currentUser: user,
      },
    };
  },
};

async function resolveFigmaAuth(context: ExecutionContext): Promise<FigmaAuth> {
  const credential = await context.getCredential(service);
  if (credential?.authType === "api_key") {
    return {
      type: "api_key",
      token: credential.apiKey,
    };
  }
  if (credential?.authType === "oauth2") {
    return {
      type: "oauth2",
      token: credential.accessToken,
    };
  }
  throw new ProviderRequestError(401, "Configure figma API key or OAuth credentials first.");
}

function applyFigmaProxyAuth(headers: Headers, auth: FigmaAuth): void {
  if (auth.type === "api_key") {
    headers.set("x-figma-token", auth.token);
    return;
  }
  headers.set("authorization", `Bearer ${auth.token}`);
}

async function getCurrentUser(context: FigmaActionContext): Promise<unknown> {
  return {
    user: await figmaGetJson({
      path: "/v1/me",
      auth: context.auth,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    }),
  };
}

async function getFileMetadata(input: Record<string, unknown>, context: FigmaActionContext): Promise<unknown> {
  return {
    metadata: await figmaGetJson({
      path: `/v1/files/${encodeURIComponent(readInputString(input.fileKey, "fileKey"))}/meta`,
      auth: context.auth,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    }),
  };
}

async function getFile(input: Record<string, unknown>, context: FigmaActionContext): Promise<unknown> {
  return {
    file: await figmaGetJson({
      path: `/v1/files/${encodeURIComponent(readInputString(input.fileKey, "fileKey"))}`,
      auth: context.auth,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      query: buildFileQuery(input),
    }),
  };
}

async function getFileNodes(input: Record<string, unknown>, context: FigmaActionContext): Promise<unknown> {
  const raw = await figmaGetJson({
    path: `/v1/files/${encodeURIComponent(readInputString(input.fileKey, "fileKey"))}/nodes`,
    auth: context.auth,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    query: {
      ...buildFileQuery(input),
      ids: joinRequiredStringArray(input.nodeIds, "nodeIds"),
    },
  });
  const record = readProviderObject(raw, "malformed figma file nodes response");

  return {
    nodes: readProviderObject(record.nodes, "malformed figma nodes response"),
    raw: record,
  };
}

async function renderImages(input: Record<string, unknown>, context: FigmaActionContext): Promise<unknown> {
  const raw = await figmaGetJson({
    path: `/v1/images/${encodeURIComponent(readInputString(input.fileKey, "fileKey"))}`,
    auth: context.auth,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    query: compactObject({
      ids: joinRequiredStringArray(input.nodeIds, "nodeIds"),
      version: optionalString(input.version),
      scale: input.scale,
      format: optionalString(input.format),
      svg_include_id: input.svgIncludeId,
      svg_simplify_stroke: input.svgSimplifyStroke,
      use_absolute_bounds: input.useAbsoluteBounds,
    }),
  });
  const record = readProviderObject(raw, "malformed figma images response");

  return {
    images: readProviderObject(record.images, "malformed figma images map"),
    err: record.err === null ? null : (optionalString(record.err) ?? null),
    raw: record,
  };
}

async function getImageFills(input: Record<string, unknown>, context: FigmaActionContext): Promise<unknown> {
  const raw = await figmaGetJson({
    path: `/v1/files/${encodeURIComponent(readInputString(input.fileKey, "fileKey"))}/images`,
    auth: context.auth,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const record = readProviderObject(raw, "malformed figma image fills response");
  const meta = readProviderObject(record.meta, "malformed figma image fills meta response");

  return {
    images: readProviderObject(meta.images, "malformed figma image fills images response"),
    raw: record,
  };
}

async function listFileVersions(input: Record<string, unknown>, context: FigmaActionContext): Promise<unknown> {
  const raw = await figmaGetJson({
    path: `/v1/files/${encodeURIComponent(readInputString(input.fileKey, "fileKey"))}/versions`,
    auth: context.auth,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    query: compactObject({
      page_size: input.pageSize,
      before: optionalString(input.before),
      after: optionalString(input.after),
    }),
  });
  const record = readProviderObject(raw, "malformed figma file versions response");

  return {
    versions: readProviderArray(record.versions, "malformed figma versions response"),
    pagination: optionalRecord(record.pagination) ?? {},
    raw: record,
  };
}

async function listComments(input: Record<string, unknown>, context: FigmaActionContext): Promise<unknown> {
  const raw = await figmaGetJson({
    path: `/v1/files/${encodeURIComponent(readInputString(input.fileKey, "fileKey"))}/comments`,
    auth: context.auth,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const record = readProviderObject(raw, "malformed figma comments response");

  return {
    comments: readProviderArray(record.comments, "malformed figma comments response"),
    raw: record,
  };
}

async function postComment(input: Record<string, unknown>, context: FigmaActionContext): Promise<unknown> {
  const raw = await figmaPostJson(
    {
      path: `/v1/files/${encodeURIComponent(readInputString(input.fileKey, "fileKey"))}/comments`,
      auth: context.auth,
      fetcher: context.fetcher,
      signal: context.signal,
    },
    compactObject({
      message: readInputString(input.message, "message"),
      client_meta: optionalRecord(input.clientMeta),
      comment_id: optionalString(input.commentId),
    }),
  );

  return {
    comment: readProviderObject(raw, "malformed figma comment response"),
  };
}

async function deleteComment(input: Record<string, unknown>, context: FigmaActionContext): Promise<unknown> {
  await figmaDelete({
    path: `/v1/files/${encodeURIComponent(readInputString(input.fileKey, "fileKey"))}/comments/${encodeURIComponent(readInputString(input.commentId, "commentId"))}`,
    auth: context.auth,
    fetcher: context.fetcher,
    signal: context.signal,
  });

  return {
    deleted: true,
  };
}

async function listCommentReactions(input: Record<string, unknown>, context: FigmaActionContext): Promise<unknown> {
  const raw = await figmaGetJson({
    path: `/v1/files/${encodeURIComponent(readInputString(input.fileKey, "fileKey"))}/comments/${encodeURIComponent(readInputString(input.commentId, "commentId"))}/reactions`,
    auth: context.auth,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    query: compactObject({
      cursor: optionalString(input.cursor),
    }),
  });
  const record = readProviderObject(raw, "malformed figma comment reactions response");

  return {
    reactions: readProviderArray(record.reactions, "malformed figma comment reactions response"),
    pagination: optionalRecord(record.pagination) ?? {},
    raw: record,
  };
}

async function postCommentReaction(input: Record<string, unknown>, context: FigmaActionContext): Promise<unknown> {
  await figmaPostJson(
    {
      path: `/v1/files/${encodeURIComponent(readInputString(input.fileKey, "fileKey"))}/comments/${encodeURIComponent(readInputString(input.commentId, "commentId"))}/reactions`,
      auth: context.auth,
      fetcher: context.fetcher,
      signal: context.signal,
    },
    {
      emoji: readInputString(input.emoji, "emoji"),
    },
  );

  return {
    posted: true,
  };
}

async function deleteCommentReaction(input: Record<string, unknown>, context: FigmaActionContext): Promise<unknown> {
  await figmaDelete({
    path: `/v1/files/${encodeURIComponent(readInputString(input.fileKey, "fileKey"))}/comments/${encodeURIComponent(readInputString(input.commentId, "commentId"))}/reactions`,
    auth: context.auth,
    fetcher: context.fetcher,
    signal: context.signal,
    query: {
      emoji: readInputString(input.emoji, "emoji"),
    },
  });

  return {
    deleted: true,
  };
}

async function listTeamProjects(input: Record<string, unknown>, context: FigmaActionContext): Promise<unknown> {
  const raw = await figmaGetJson({
    path: `/v1/teams/${encodeURIComponent(readInputString(input.teamId, "teamId"))}/projects`,
    auth: context.auth,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const record = readProviderObject(raw, "malformed figma team projects response");

  return {
    projects: readProviderArray(record.projects, "malformed figma projects response"),
    raw: record,
  };
}

async function getProjectMetadata(input: Record<string, unknown>, context: FigmaActionContext): Promise<unknown> {
  return {
    metadata: await figmaGetJson({
      path: `/v1/projects/${encodeURIComponent(readInputString(input.projectId, "projectId"))}/meta`,
      auth: context.auth,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    }),
  };
}

async function listProjectFiles(input: Record<string, unknown>, context: FigmaActionContext): Promise<unknown> {
  const raw = await figmaGetJson({
    path: `/v1/projects/${encodeURIComponent(readInputString(input.projectId, "projectId"))}/files`,
    auth: context.auth,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    query: compactObject({
      branch_data: input.branchData,
    }),
  });
  const record = readProviderObject(raw, "malformed figma project files response");

  return {
    files: readProviderArray(record.files, "malformed figma project files response"),
    raw: record,
  };
}

async function listFileComponents(input: Record<string, unknown>, context: FigmaActionContext): Promise<unknown> {
  return listLibraryItems(
    `/v1/files/${encodeURIComponent(readInputString(input.fileKey, "fileKey"))}/components`,
    "components",
    context,
  );
}

async function listFileComponentSets(input: Record<string, unknown>, context: FigmaActionContext): Promise<unknown> {
  return listLibraryItems(
    `/v1/files/${encodeURIComponent(readInputString(input.fileKey, "fileKey"))}/component_sets`,
    "component_sets",
    context,
  );
}

async function listFileStyles(input: Record<string, unknown>, context: FigmaActionContext): Promise<unknown> {
  return listLibraryItems(
    `/v1/files/${encodeURIComponent(readInputString(input.fileKey, "fileKey"))}/styles`,
    "styles",
    context,
  );
}

async function getComponent(input: Record<string, unknown>, context: FigmaActionContext): Promise<unknown> {
  return getLibraryItem(`/v1/components/${encodeURIComponent(readInputString(input.key, "key"))}`, context);
}

async function getComponentSet(input: Record<string, unknown>, context: FigmaActionContext): Promise<unknown> {
  return getLibraryItem(`/v1/component_sets/${encodeURIComponent(readInputString(input.key, "key"))}`, context);
}

async function getStyle(input: Record<string, unknown>, context: FigmaActionContext): Promise<unknown> {
  return getLibraryItem(`/v1/styles/${encodeURIComponent(readInputString(input.key, "key"))}`, context);
}

async function getDevResources(input: Record<string, unknown>, context: FigmaActionContext): Promise<unknown> {
  const raw = await figmaGetJson({
    path: `/v1/files/${encodeURIComponent(readInputString(input.fileKey, "fileKey"))}/dev_resources`,
    auth: context.auth,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    query: compactObject({
      node_ids: joinOptionalStringArray(input.nodeIds),
    }),
  });
  const record = readProviderObject(raw, "malformed figma dev resources response");

  return {
    devResources: readProviderArray(record.dev_resources, "malformed figma dev resources response"),
    raw: record,
  };
}

async function createDevResources(input: Record<string, unknown>, context: FigmaActionContext): Promise<unknown> {
  const raw = await figmaPostJson(
    {
      path: "/v1/dev_resources",
      auth: context.auth,
      fetcher: context.fetcher,
      signal: context.signal,
    },
    {
      dev_resources: mapDevResourceCreates(input.devResources),
    },
  );
  return normalizeDevResourceMutation(raw, "links_created");
}

async function updateDevResources(input: Record<string, unknown>, context: FigmaActionContext): Promise<unknown> {
  const raw = await figmaPutJson(
    {
      path: "/v1/dev_resources",
      auth: context.auth,
      fetcher: context.fetcher,
      signal: context.signal,
    },
    {
      dev_resources: mapDevResourceUpdates(input.devResources),
    },
  );
  return normalizeDevResourceMutation(raw, "links_updated");
}

async function deleteDevResource(input: Record<string, unknown>, context: FigmaActionContext): Promise<unknown> {
  await figmaDelete({
    path: `/v1/files/${encodeURIComponent(readInputString(input.fileKey, "fileKey"))}/dev_resources/${encodeURIComponent(readInputString(input.devResourceId, "devResourceId"))}`,
    auth: context.auth,
    fetcher: context.fetcher,
    signal: context.signal,
  });

  return {
    deleted: true,
  };
}

async function listLibraryItems(path: string, itemField: string, context: FigmaActionContext): Promise<unknown> {
  const raw = await figmaGetJson({
    path,
    auth: context.auth,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const record = readProviderObject(raw, "malformed figma library items response");
  const meta = readProviderObject(record.meta, "malformed figma library metadata response");

  return {
    items: readProviderArray(meta[itemField], `malformed figma ${itemField} response`),
    pagination: optionalRecord(meta.cursor) ?? {},
    raw: record,
  };
}

async function getLibraryItem(path: string, context: FigmaActionContext): Promise<unknown> {
  const raw = await figmaGetJson({
    path,
    auth: context.auth,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const record = readProviderObject(raw, "malformed figma library item response");
  const item = readProviderObject(record.meta, "malformed figma library item metadata response");

  return {
    item,
    raw: record,
  };
}

async function figmaGetJson(input: Omit<FigmaRequestOptions, "method" | "body">): Promise<unknown> {
  return figmaRequestJson({ ...input, method: "GET" });
}

async function figmaPostJson(
  input: Omit<FigmaRequestOptions, "method" | "phase" | "body">,
  body: Record<string, unknown>,
): Promise<unknown> {
  return figmaRequestJson({
    ...input,
    method: "POST",
    body,
    phase: "execute",
  });
}

async function figmaPutJson(
  input: Omit<FigmaRequestOptions, "method" | "phase" | "body">,
  body: Record<string, unknown>,
): Promise<unknown> {
  return figmaRequestJson({
    ...input,
    method: "PUT",
    body,
    phase: "execute",
  });
}

async function figmaDelete(input: Omit<FigmaRequestOptions, "method" | "phase" | "body">): Promise<unknown> {
  const response = await figmaRequest({
    ...input,
    method: "DELETE",
    phase: "execute",
  });
  return response.payload;
}

async function figmaRequestJson(input: FigmaRequestOptions): Promise<unknown> {
  const response = await figmaRequest(input);
  return response.payload;
}

async function figmaRequest(input: FigmaRequestOptions): Promise<FigmaResponse> {
  const url = new URL(input.path, figmaApiBaseUrl);
  for (const [key, value] of Object.entries(compactObject(input.query ?? {}))) {
    url.searchParams.set(key, String(value));
  }

  try {
    const response = await input.fetcher(url, {
      method: input.method,
      headers: createFigmaHeaders(input.auth, input.body != null),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.signal,
    });
    const payload = await readFigmaPayload(response);
    if (!response.ok) {
      throw createFigmaError(response.status, response.statusText, payload, input.phase);
    }
    return { payload };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `figma request failed: ${error.message}` : "figma request failed",
    );
  }
}

function createFigmaHeaders(auth: FigmaAuth, hasJsonBody: boolean): Headers {
  const headers = new Headers({
    accept: "application/json",
    "user-agent": providerUserAgent,
  });
  if (auth.type === "api_key") {
    headers.set("X-Figma-Token", auth.token);
  } else {
    headers.set("authorization", `Bearer ${auth.token}`);
  }
  if (hasJsonBody) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

async function readFigmaPayload(response: Response): Promise<unknown> {
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

function createFigmaError(
  status: number,
  statusText: string,
  payload: unknown,
  phase: FigmaRequestPhase,
): ProviderRequestError {
  const message = extractFigmaErrorMessage(payload) ?? statusText ?? "figma request failed";
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }
  if ([400, 404, 422].includes(status)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}

function extractFigmaErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload.trim() || undefined;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const error = optionalRecord(record.error);
  return (
    optionalString(record.message) ??
    optionalString(record.err) ??
    optionalString(record.error) ??
    optionalString(record.status) ??
    optionalString(error?.message) ??
    optionalString(error?.detail)
  );
}

function normalizeFigmaCurrentAccount(raw: unknown): {
  accountId: string;
  displayName: string;
} {
  const user = readProviderObject(raw, "malformed figma current user response");
  const id = optionalString(user.id);
  if (!id) {
    throw new ProviderRequestError(502, "figma current user response is missing id", raw);
  }

  return {
    accountId: id,
    displayName: optionalString(user.handle) ?? optionalString(user.email) ?? id,
  };
}

function buildFileQuery(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    version: optionalString(input.version),
    ids: joinOptionalStringArray(input.nodeIds),
    depth: input.depth,
    geometry: optionalString(input.geometry),
    plugin_data: joinOptionalStringArray(input.pluginData),
    branch_data: input.branchData,
  });
}

function mapDevResourceCreates(value: unknown): Array<Record<string, string>> {
  return objectArray(value, "devResources", (message) => new ProviderRequestError(400, message)).map((resource) => {
    return {
      name: readInputString(resource.name, "name"),
      url: readInputString(resource.url, "url"),
      file_key: readInputString(resource.fileKey, "fileKey"),
      node_id: readInputString(resource.nodeId, "nodeId"),
    };
  });
}

function mapDevResourceUpdates(value: unknown): Array<Partial<Record<string, string>>> {
  return objectArray(value, "devResources", (message) => new ProviderRequestError(400, message)).map((resource) => {
    return compactObject({
      id: readInputString(resource.id, "id"),
      name: optionalString(resource.name),
      url: optionalString(resource.url),
    });
  });
}

function normalizeDevResourceMutation(raw: unknown, successField: "links_created" | "links_updated"): unknown {
  const record = readProviderObject(raw, "malformed figma dev resources mutation response");

  return {
    linksCreated:
      successField === "links_created"
        ? readProviderArray(record.links_created, "malformed figma created dev resources response")
        : [],
    linksUpdated:
      successField === "links_updated"
        ? readProviderArray(record.links_updated, "malformed figma updated dev resources response")
        : [],
    errors: Array.isArray(record.errors) ? record.errors : [],
    raw: record,
  };
}

function joinRequiredStringArray(value: unknown, fieldName: string): string {
  const joined = joinOptionalStringArray(value);
  if (!joined) {
    throw new ProviderRequestError(400, `${fieldName} must contain at least one item`);
  }
  return joined;
}

function joinOptionalStringArray(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const joined = value
    .map((item) => String(item).trim())
    .filter(Boolean)
    .join(",");
  return joined || undefined;
}

function readInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readProviderObject(value: unknown, message: string): Record<string, unknown> {
  return requiredRecord(value, "response", () => new ProviderRequestError(502, message, value));
}

function readProviderArray(value: unknown, message: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, message, value);
  }
  return value;
}
