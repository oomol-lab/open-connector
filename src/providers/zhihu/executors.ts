import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { createWriteStream, openAsBlob } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { compactObject, optionalRecord } from "../../core/cast.ts";
import {
  createProviderFetch,
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

type ZhihuActionHandler = (
  input: Record<string, unknown>,
  context: {
    apiKey: string;
    fetcher: typeof fetch;
  },
) => Promise<unknown>;

interface ZhihuRequestInput {
  method?: "GET" | "POST";
  path: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  rawBody?: BodyInit;
  headers?: Record<string, string | undefined>;
  mode?: "validate" | "execute";
}

const zhihuApiBaseUrl = "https://developer.zhihu.com";
const zhihuUserAgent = providerUserAgent;
const maximumZhihuUploadBytes = 100 * 1024 * 1024;
const zhihuUploadDownloadTimeoutMs = 5 * 60 * 1000;
const supportedKnowledgeFileExtensions = new Set([
  ".pdf",
  ".md",
  ".txt",
  ".ppt",
  ".pptx",
  ".xlsx",
  ".xls",
  ".docx",
  ".doc",
  ".webp",
  ".png",
  ".jpg",
  ".mobi",
  ".epub",
  ".csv",
  ".azw3",
]);

const zhihuActionHandlers: Record<string, ZhihuActionHandler> = {
  zhihu_search(input, context) {
    return zhihuRequest(
      context.apiKey,
      {
        method: "GET",
        path: "/api/v1/content/zhihu_search",
        query: {
          Query: input.query,
          Count: input.count,
        },
      },
      context.fetcher,
    );
  },
  global_search(input, context) {
    return zhihuRequest(
      context.apiKey,
      {
        method: "GET",
        path: "/api/v1/content/global_search",
        query: {
          Query: input.query,
          Count: input.count,
          Filter: input.filter,
          SearchDB: input.searchDB,
        },
      },
      context.fetcher,
    );
  },
  hot_list(input, context) {
    return zhihuRequest(
      context.apiKey,
      {
        method: "GET",
        path: "/api/v1/content/hot_list",
        query: {
          Limit: input.limit,
        },
      },
      context.fetcher,
    );
  },
  zhida(input, context) {
    return zhihuRequest(
      context.apiKey,
      {
        method: "POST",
        path: "/v1/chat/completions",
        body: {
          ...input,
          stream: false,
        },
      },
      context.fetcher,
    );
  },
  user_contents(input, context) {
    return zhihuRequest(
      context.apiKey,
      {
        path: "/api/v1/user/contents",
        query: {
          ContentType: input.contentType,
          Offset: input.offset,
          Limit: input.limit,
          SortField: input.sortField,
          SortOrder: input.sortOrder,
        },
      },
      context.fetcher,
    );
  },
  user_followees(input, context) {
    return zhihuRequest(
      context.apiKey,
      { path: "/api/v1/user/followees", query: { Offset: input.offset, Limit: input.limit } },
      context.fetcher,
    );
  },
  user_collections(input, context) {
    return zhihuRequest(
      context.apiKey,
      { path: "/api/v1/user/collections", query: { Limit: input.limit } },
      context.fetcher,
    );
  },
  user_favlists(input, context) {
    return zhihuRequest(
      context.apiKey,
      { path: "/api/v1/user/favlists", query: { Limit: input.limit } },
      context.fetcher,
    );
  },
  favlist_contents(input, context) {
    return zhihuRequest(
      context.apiKey,
      {
        path: "/api/v1/user/favlist_contents",
        query: { FavlistUrlToken: input.favlistUrlToken, Offset: input.offset, Limit: input.limit },
      },
      context.fetcher,
    );
  },
  knowledge_bases(input, context) {
    return zhihuRequest(
      context.apiKey,
      { path: "/api/v1/knowledge/bases", query: { Scope: input.scope } },
      context.fetcher,
    );
  },
  knowledge_base_items(input, context) {
    return zhihuRequest(
      context.apiKey,
      {
        path: `/api/v1/knowledge/bases/${encodeURIComponent(String(input.knowledgeBaseId))}/items`,
        query: { Cursor: input.cursor, Limit: input.limit },
      },
      context.fetcher,
    );
  },
  knowledge_search(input, context) {
    const knowledgeBaseIds = Array.isArray(input.knowledgeBaseIds) ? input.knowledgeBaseIds : [];
    const recallScopes = Array.isArray(input.recallScopes) ? input.recallScopes : [];
    if (knowledgeBaseIds.length === 0 && recallScopes.length === 0) {
      throw new ProviderRequestError(400, "knowledgeBaseIds or recallScopes must contain at least one value");
    }
    return zhihuRequest(
      context.apiKey,
      {
        method: "POST",
        path: "/api/v1/knowledge/search",
        body: {
          Query: input.query,
          KnowledgeBaseIDs: knowledgeBaseIds,
          RecallScopes: recallScopes,
          Limit: input.limit,
        },
      },
      context.fetcher,
    );
  },
  knowledge_file_upload(input, context) {
    const fileName = requireUploadFileName(input.fileName, supportedKnowledgeFileExtensions);
    return withDownloadedZhihuFile(input.fileUrl, fileName, context.fetcher, async (filePath) => {
      const form = new FormData();
      form.set("File", await openAsBlob(filePath), fileName);
      if (typeof input.knowledgeBaseId === "string") form.set("KnowledgeBaseID", input.knowledgeBaseId);
      return zhihuRequest(
        context.apiKey,
        { method: "POST", path: "/api/v1/knowledge/files", rawBody: form },
        context.fetcher,
      );
    });
  },
  submit_pdf_parse(input, context) {
    const fileName = requireUploadFileName(input.fileName, new Set([".pdf"]));
    return withDownloadedZhihuFile(input.fileUrl, fileName, context.fetcher, async (filePath) => {
      const form = new FormData();
      form.set("file", await openAsBlob(filePath), fileName);
      const upload = await zhihuRequest(
        context.apiKey,
        { method: "POST", path: "/resources/v1/files", rawBody: form },
        context.fetcher,
      );
      const fileId = readRequiredNestedString(upload, ["Data", "file_id"]);
      return zhihuRequest(
        context.apiKey,
        {
          method: "POST",
          path: "/api/v1/pdf-parse/tasks",
          headers: {
            "idempotency-key": typeof input.idempotencyKey === "string" ? input.idempotencyKey : undefined,
          },
          body: { file_id: fileId },
        },
        context.fetcher,
      );
    });
  },
  get_pdf_parse(input, context) {
    return zhihuRequest(
      context.apiKey,
      { path: `/api/v1/pdf-parse/tasks/${encodeURIComponent(String(input.taskId))}` },
      context.fetcher,
    );
  },
  submit_ppt_generation(input, context) {
    return zhihuRequest(
      context.apiKey,
      {
        method: "POST",
        path: "/api/v1/ppt-generation/tasks",
        headers: {
          "idempotency-key": typeof input.idempotencyKey === "string" ? input.idempotencyKey : undefined,
        },
        body: { resource_url: input.resourceUrl, num_pages: input.numPages },
      },
      context.fetcher,
    );
  },
  get_ppt_generation(input, context) {
    return zhihuRequest(
      context.apiKey,
      { path: `/api/v1/ppt-generation/tasks/${encodeURIComponent(String(input.taskId))}` },
      context.fetcher,
    );
  },
};

async function validateZhihuCredential(
  apiKey: string,
  fetcher: typeof fetch,
): Promise<{ accountLabel: string; providerMetadata: Record<string, unknown> }> {
  await zhihuRequest(
    apiKey,
    {
      method: "GET",
      path: "/api/v1/content/hot_list",
      query: {
        Limit: 1,
      },
      mode: "validate",
    },
    fetcher,
  );

  return {
    accountLabel: "Zhihu Access Secret",
    providerMetadata: compactObject({
      apiBaseUrl: zhihuApiBaseUrl,
      validationEndpoint: "/api/v1/content/hot_list",
    }),
  };
}

async function zhihuRequest(apiKey: string, input: ZhihuRequestInput, fetcher: typeof fetch) {
  const response = await zhihuRawRequest(apiKey, input, fetcher);

  if (!response.ok) {
    throw await buildZhihuError(response, input.mode ?? "execute");
  }

  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    const payload = JSON.parse(text) as unknown;
    const payloadObject = optionalRecord(payload);
    const code = readOptionalNumber(payloadObject?.Code);
    if (code !== undefined && code !== 0) {
      throw buildZhihuPayloadError(payload, input.mode ?? "execute");
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(502, "Zhihu 返回了无法解析的 JSON 响应");
  }
}

async function zhihuRawRequest(apiKey: string, input: ZhihuRequestInput, fetcher: typeof fetch) {
  const url = new URL(input.path, zhihuApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  try {
    const headers = new Headers({
      authorization: `Bearer ${apiKey}`,
      "user-agent": zhihuUserAgent,
      "x-request-timestamp": String(Math.floor(Date.now() / 1000)),
    });
    if (!input.rawBody) headers.set("content-type", "application/json");
    for (const [name, value] of Object.entries(input.headers ?? {})) {
      if (value !== undefined) headers.set(name, value);
    }
    return await fetcher(url, {
      method: input.method ?? "GET",
      headers,
      body: input.rawBody ?? (input.body ? JSON.stringify(input.body) : undefined),
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Zhihu request failed: ${error.message}` : "Zhihu request failed",
    );
  }
}

async function buildZhihuError(response: Response, mode: "validate" | "execute") {
  const payload = await readZhihuPayload(response);
  const message = extractZhihuErrorMessage(payload) ?? `Zhihu request failed with ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (mode === "validate" && (response.status === 400 || response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message);
  }

  if (mode === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message);
  }

  if (mode === "execute" && (response.status === 400 || response.status === 404)) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(response.status || 500, message);
}

function buildZhihuPayloadError(payload: unknown, mode: "validate" | "execute") {
  const record = optionalRecord(payload);
  const code = readOptionalNumber(record?.Code);
  const message = extractZhihuErrorMessage(payload) ?? "Zhihu request failed";

  if (code === 30001) {
    return new ProviderRequestError(429, message);
  }

  if (mode === "validate" && (code === 10001 || code === 20001)) {
    return new ProviderRequestError(400, message);
  }

  if (mode === "execute" && code === 20001) {
    return new ProviderRequestError(401, message);
  }

  if (mode === "execute" && code === 10001) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(502, message);
}

async function readZhihuPayload(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function extractZhihuErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const error = optionalRecord(record.error);
  return (
    readOptionalString(record.Message) ??
    readOptionalString(record.msg) ??
    readOptionalString(record.message) ??
    readOptionalString(error?.message)
  );
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function readOptionalNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

async function withDownloadedZhihuFile<T>(
  fileUrl: unknown,
  fileName: string,
  fetcher: typeof fetch,
  consume: (filePath: string) => Promise<T>,
) {
  if (typeof fileUrl !== "string") throw new ProviderRequestError(400, "fileUrl is required");
  const directory = await mkdtemp(join(tmpdir(), "oomol-zhihu-upload-"));
  const filePath = join(directory, fileName);
  const timeout = createProviderTimeout(undefined, zhihuUploadDownloadTimeoutMs);
  try {
    const guardedFetch = createProviderFetch({ fetch: fetcher });
    const response = await guardedFetch(fileUrl, { signal: timeout.signal });
    if (!response.ok)
      throw new ProviderRequestError(502, `Zhihu upload source download failed with status ${response.status}`);
    if (!response.body) throw new ProviderRequestError(502, "Zhihu upload source response body is missing");
    const declaredBytes = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredBytes) && declaredBytes > maximumZhihuUploadBytes) {
      await response.body.cancel().catch(() => undefined);
      throw zhihuUploadTooLargeError();
    }
    await pipeline(Readable.from(limitZhihuUploadBody(response.body)), createWriteStream(filePath));
    if ((await stat(filePath)).size === 0) throw new ProviderRequestError(400, "fileUrl returned an empty file");
    return await consume(filePath);
  } finally {
    timeout.cleanup();
    await rm(directory, { recursive: true, force: true });
  }
}

async function* limitZhihuUploadBody(body: ReadableStream<Uint8Array>) {
  let sizeBytes = 0;
  for await (const chunk of body) {
    sizeBytes += chunk.byteLength;
    if (sizeBytes > maximumZhihuUploadBytes) throw zhihuUploadTooLargeError();
    yield chunk;
  }
}

function requireUploadFileName(value: unknown, extensions: ReadonlySet<string>) {
  if (typeof value !== "string" || !value.trim()) throw new ProviderRequestError(400, "fileName is required");
  const fileName = value.trim();
  if (basename(fileName) !== fileName || [...fileName].some((character) => character.charCodeAt(0) < 32)) {
    throw new ProviderRequestError(400, "fileName is invalid");
  }
  if (!extensions.has(extname(fileName).toLowerCase()))
    throw new ProviderRequestError(400, "fileName has an unsupported extension");
  return fileName;
}

function readRequiredNestedString(value: unknown, path: string[]) {
  let current = value;
  for (const field of path) current = optionalRecord(current)?.[field];
  if (typeof current !== "string" || !current)
    throw new ProviderRequestError(502, `Zhihu response is missing ${path.join(".")}`);
  return current;
}

function zhihuUploadTooLargeError() {
  return new ProviderRequestError(413, "fileUrl exceeds the 100 MB Zhihu upload limit");
}

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("zhihu", zhihuActionHandlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const result = await validateZhihuCredential(input.apiKey, fetcher);
    return {
      profile: { accountId: "zhihu", displayName: result.accountLabel },
      grantedScopes: [],
      metadata: result.providerMetadata,
    };
  },
};
