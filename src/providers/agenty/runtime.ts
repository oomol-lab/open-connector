import type { CredentialValidationResult, TransitFileWriter } from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";
import type { AgentyActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString, requiredRecord } from "../../core/cast.ts";
import { providerFetch, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const agentyApiBaseUrl = "https://api.agenty.com/v2";
export const agentyBrowserBaseUrl = "https://browser.agenty.com/api";
const agentyValidationPath = "/agents";
const agentyTimeoutMs = 30_000;

export type AgentyRuntimeContext = {
  apiKey: string;
  fetcher: ProviderFetch;
  transitFiles?: TransitFileWriter;
  signal?: AbortSignal;
};

type AgentyActionHandler = (input: Record<string, unknown>, context: AgentyRuntimeContext) => Promise<unknown>;

export const agentyActionHandlers: Record<AgentyActionName, AgentyActionHandler> = {
  get_page_content(input, context) {
    return getPageContent(input, context);
  },
  extract_structured_data(input, context) {
    return extractStructuredData(input, context);
  },
  capture_screenshot(input, context) {
    return captureScreenshot(input, context);
  },
  convert_url_to_pdf(input, context) {
    return convertUrlToPdf(input, context);
  },
  get_redirects(input, context) {
    return getRedirects(input, context);
  },
  list_agents(input, context) {
    return listAgents(input, context);
  },
  get_agent(input, context) {
    return getAgent(input, context);
  },
  create_agent(input, context) {
    return createAgent(input, context);
  },
  update_agent(input, context) {
    return updateAgent(input, context);
  },
  copy_agent(input, context) {
    return copyAgent(input, context);
  },
  delete_agent(input, context) {
    return deleteAgent(input, context);
  },
  get_agent_templates(input, context) {
    return getAgentTemplates(input, context);
  },
  get_agent_inputs(input, context) {
    return getAgentInputs(input, context);
  },
  update_agent_inputs(input, context) {
    return updateAgentInputs(input, context);
  },
  create_list(input, context) {
    return createList(input, context);
  },
  get_list(input, context) {
    return getList(input, context);
  },
  add_list_rows(input, context) {
    return addListRows(input, context);
  },
  get_list_row(input, context) {
    return getListRow(input, context);
  },
  delete_list_row(input, context) {
    return deleteListRow(input, context);
  },
  delete_list_rows(input, context) {
    return deleteListRows(input, context);
  },
  clear_list_rows(input, context) {
    return clearListRows(input, context);
  },
  download_list_rows(input, context) {
    return downloadListRows(input, context);
  },
  start_job(input, context) {
    return startJob(input, context);
  },
  get_job(input, context) {
    return getJob(input, context);
  },
  list_jobs(input, context) {
    return listJobs(input, context);
  },
  stop_job(input, context) {
    return stopJob(input, context);
  },
  get_job_logs(input, context) {
    return getJobLogs(input, context);
  },
  get_job_result(input, context) {
    return getJobResult(input, context);
  },
  download_job_result(input, context) {
    return downloadJobResult(input, context);
  },
  list_job_files(input, context) {
    return listJobFiles(input, context);
  },
  download_job_file(input, context) {
    return downloadJobFile(input, context);
  },
};

export async function validateAgentyApiKey(
  apiKey: string,
  fetcher: ProviderFetch = providerFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const trimmedApiKey = apiKey.trim();
  if (!trimmedApiKey) {
    throw new ProviderRequestError(400, "agenty api_key is required");
  }

  const payload = await requestAgentyJson({
    baseUrl: agentyApiBaseUrl,
    path: agentyValidationPath,
    method: "GET",
    apiKey: trimmedApiKey,
    fetcher,
    signal,
    timeoutLabel: "agenty /agents request timed out after 30 seconds",
    errorMode: "validation",
  });

  const record = unwrapAgentyPayload(payload);
  return {
    profile: {
      accountId: "agenty",
      displayName: "Agenty API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: agentyApiBaseUrl,
      validationEndpoint: agentyValidationPath,
      totalAgents: asNumber(record.total),
      returnedAgents: asNumber(record.returned),
    }),
  };
}

async function getPageContent(input: Record<string, unknown>, context: AgentyRuntimeContext) {
  const response = await requestAgentyBrowser({
    path: "/content",
    input: input,
    context,
  });
  return {
    content: await response.text(),
  };
}

async function extractStructuredData(input: Record<string, unknown>, context: AgentyRuntimeContext) {
  const payload = await requestAgentyBrowserJson({
    path: "/extract",
    input: input,
    context,
  });
  const record = unwrapAgentyPayload(payload);
  return {
    rdfa: readStructuredDataValue(record.rdfa),
    jsonld: readStructuredDataValue(record.jsonld),
    metatags: readStructuredDataValue(record.metatags),
    microdata: readStructuredDataValue(record.microdata),
  };
}

async function captureScreenshot(input: Record<string, unknown>, context: AgentyRuntimeContext) {
  const response = await requestAgentyBrowser({
    path: "/screenshot",
    input: input,
    context,
  });
  return {
    screenshot: await uploadAgentyTransitFile(context, response, "agenty-screenshot.png"),
  };
}

async function convertUrlToPdf(input: Record<string, unknown>, context: AgentyRuntimeContext) {
  const response = await requestAgentyBrowser({
    path: "/pdf",
    input: input,
    context,
  });
  return {
    pdf: await uploadAgentyTransitFile(context, response, "agenty-document.pdf"),
  };
}

async function getRedirects(input: Record<string, unknown>, context: AgentyRuntimeContext) {
  const payload = await requestAgentyBrowserJson({
    path: "/redirects",
    input: input,
    context,
  });
  const record = unwrapAgentyPayload(payload);
  const redirects = Array.isArray(record.redirects) ? record.redirects : Array.isArray(payload) ? payload : [];

  return {
    redirects: redirects.map((item) => {
      const value = requiredRecord(item, "redirects[]", (message) => new ProviderRequestError(502, message));
      return {
        url: asRequiredString(value.url, "redirects[].url"),
        status: asRequiredInteger(value.status, "redirects[].status"),
      };
    }),
  };
}

async function listAgents(input: Record<string, unknown>, context: AgentyRuntimeContext) {
  const payload = await requestAgentyApiJson({
    path: "/agents",
    query: buildPaginationQuery(input),
    context,
  });
  return normalizePagedCollection(payload, "agents");
}

async function getAgent(input: Record<string, unknown>, context: AgentyRuntimeContext) {
  const agentId = asRequiredIdentifier(input.agent_id, "agent_id");
  const payload = await requestAgentyApiJson({
    path: `/agents/${agentId}`,
    context,
  });
  return {
    agent: unwrapAgentyPayload(payload),
  };
}

async function createAgent(input: Record<string, unknown>, context: AgentyRuntimeContext) {
  const payload = await requestAgentyApiJson({
    path: "/agents",
    method: "POST",
    body: input,
    context,
  });
  return {
    agent: unwrapAgentyPayload(payload),
  };
}

async function updateAgent(input: Record<string, unknown>, context: AgentyRuntimeContext) {
  const agentId = asRequiredIdentifier(input.agent_id, "agent_id");
  const payload = await requestAgentyApiJson({
    path: `/agents/${agentId}`,
    method: "PUT",
    body: omitKeys(input, ["agent_id"]),
    context,
  });
  return {
    agent: unwrapAgentyPayload(payload),
  };
}

async function copyAgent(input: Record<string, unknown>, context: AgentyRuntimeContext) {
  const agentId = asRequiredIdentifier(input.agent_id, "agent_id");
  const payload = await requestAgentyApiJson({
    path: `/agents/${agentId}/clone`,
    context,
  });
  return {
    agent: unwrapAgentyPayload(payload),
  };
}

async function deleteAgent(input: Record<string, unknown>, context: AgentyRuntimeContext) {
  const agentId = asRequiredIdentifier(input.agent_id, "agent_id");
  const payload = await requestAgentyApiJson({
    path: `/agents/${agentId}`,
    method: "DELETE",
    context,
  });
  return normalizeMessagePayload(payload);
}

async function getAgentTemplates(input: Record<string, unknown>, context: AgentyRuntimeContext) {
  const payload = await requestAgentyApiJson({
    path: "/agents/templates",
    query: buildPaginationQuery(input),
    context,
  });
  return normalizePagedCollection(payload, "templates");
}

async function getAgentInputs(input: Record<string, unknown>, context: AgentyRuntimeContext) {
  const agentId = asRequiredIdentifier(input.agent_id, "agent_id");
  const payload = await requestAgentyApiJson({
    path: `/inputs/${agentId}`,
    context,
  });
  return {
    input: unwrapAgentyPayload(payload),
  };
}

async function updateAgentInputs(input: Record<string, unknown>, context: AgentyRuntimeContext) {
  const agentId = asRequiredIdentifier(input.agent_id, "agent_id");
  const payload = await requestAgentyApiJson({
    path: `/inputs/${agentId}`,
    method: "PUT",
    body: omitKeys(input, ["agent_id"]),
    context,
  });
  return normalizeMessagePayload(payload);
}

async function createList(input: Record<string, unknown>, context: AgentyRuntimeContext) {
  const payload = await requestAgentyApiJson({
    path: "/lists",
    method: "POST",
    body: input,
    context,
  });
  return {
    list: unwrapAgentyPayload(payload),
  };
}

async function getList(input: Record<string, unknown>, context: AgentyRuntimeContext) {
  const listId = asRequiredIdentifier(input.list_id, "list_id");
  const payload = await requestAgentyApiJson({
    path: `/lists/${listId}`,
    context,
  });
  const record = asRecord(payload);
  return {
    list: "list_id" in record ? record : unwrapAgentyPayload(payload),
  };
}

async function addListRows(input: Record<string, unknown>, context: AgentyRuntimeContext) {
  const listId = asRequiredIdentifier(input.list_id, "list_id");
  const payload = await requestAgentyApiJson({
    path: `/lists/${listId}/rows`,
    method: "POST",
    body: input.rows,
    context,
  });
  return normalizeMessagePayload(payload);
}

async function getListRow(input: Record<string, unknown>, context: AgentyRuntimeContext) {
  const listId = asRequiredIdentifier(input.list_id, "list_id");
  const rowId = asRequiredIdentifier(input.row_id, "row_id");
  const payload = await requestAgentyApiJson({
    path: `/lists/${listId}/rows/${rowId}`,
    context,
  });
  return {
    row: unwrapAgentyPayload(payload),
  };
}

async function deleteListRow(input: Record<string, unknown>, context: AgentyRuntimeContext) {
  const listId = asRequiredIdentifier(input.list_id, "list_id");
  const rowId = asRequiredIdentifier(input.row_id, "row_id");
  const payload = await requestAgentyApiJson({
    path: `/lists/${listId}/rows/${rowId}`,
    method: "DELETE",
    context,
  });
  return normalizeMessagePayload(payload);
}

async function deleteListRows(input: Record<string, unknown>, context: AgentyRuntimeContext) {
  const listId = asRequiredIdentifier(input.list_id, "list_id");
  const query = new URLSearchParams();
  for (const rowId of asRequiredStringArray(input.row_id, "row_id")) {
    query.append("id", rowId);
  }
  const payload = await requestAgentyApiJson({
    path: `/lists/${listId}/rows`,
    method: "DELETE",
    query,
    context,
  });
  return normalizeMessagePayload(payload);
}

async function clearListRows(input: Record<string, unknown>, context: AgentyRuntimeContext) {
  const listId = asRequiredIdentifier(input.list_id, "list_id");
  const payload = await requestAgentyApiJson({
    baseUrl: "https://api.agenty.com/v1",
    path: `/lists/${listId}/clear`,
    method: "DELETE",
    context,
  });
  return normalizeMessagePayload(payload);
}

async function downloadListRows(input: Record<string, unknown>, context: AgentyRuntimeContext) {
  const listId = asRequiredIdentifier(input.list_id, "list_id");
  const response = await requestAgentyApiResponse({
    path: `/lists/${listId}/download`,
    context,
  });
  return {
    content: await response.text(),
  };
}

async function startJob(input: Record<string, unknown>, context: AgentyRuntimeContext) {
  const payload = await requestAgentyApiJson({
    path: "/jobs/start",
    method: "POST",
    body: {
      agent_id: asRequiredIdentifier(input.agent_id, "agent_id"),
    },
    context,
  });
  return {
    job: unwrapAgentyPayload(payload),
  };
}

async function getJob(input: Record<string, unknown>, context: AgentyRuntimeContext) {
  const jobId = asRequiredInteger(input.job_id, "job_id");
  const payload = await requestAgentyApiJson({
    path: `/jobs/${jobId}`,
    context,
  });
  return {
    job: unwrapAgentyPayload(payload),
  };
}

async function listJobs(input: Record<string, unknown>, context: AgentyRuntimeContext) {
  const query = buildPaginationQuery(input);
  const agentId = asOptionalIdentifier(input.agent_id);
  if (agentId) {
    query.set("agent_id", agentId);
  }
  const payload = await requestAgentyApiJson({
    path: "/jobs",
    query,
    context,
  });
  return normalizePagedCollection(payload, "jobs");
}

async function stopJob(input: Record<string, unknown>, context: AgentyRuntimeContext) {
  const jobId = asRequiredInteger(input.job_id, "job_id");
  const payload = await requestAgentyApiJson({
    path: `/jobs/${jobId}/stop`,
    context,
  });
  return {
    job: unwrapAgentyPayload(payload),
  };
}

async function getJobLogs(input: Record<string, unknown>, context: AgentyRuntimeContext) {
  const jobId = asRequiredInteger(input.job_id, "job_id");
  const response = await requestAgentyApiResponse({
    path: `/jobs/${jobId}/logs`,
    query: buildOffsetLimitQuery(input),
    context,
  });
  return {
    content: await response.text(),
  };
}

async function getJobResult(input: Record<string, unknown>, context: AgentyRuntimeContext) {
  const jobId = asRequiredInteger(input.job_id, "job_id");
  const query = buildOffsetLimitQuery(input);
  copyOptionalQueryParam(query, input, "sort");
  copyOptionalQueryParam(query, input, "order");
  copyOptionalQueryParam(query, input, "search");
  copyOptionalQueryParam(query, input, "format");
  copyOptionalQueryParam(query, input, "collection");
  const payload = await requestAgentyApiJson({
    path: `/jobs/${jobId}/result`,
    query,
    context,
  });
  return normalizeResultCollection(payload);
}

async function downloadJobResult(input: Record<string, unknown>, context: AgentyRuntimeContext) {
  const jobId = asRequiredInteger(input.job_id, "job_id");
  const query = new URLSearchParams();
  query.set("type", "result");
  copyOptionalQueryParam(query, input, "collection");
  query.set("filename", buildExportFileName(input));
  if (typeof input.modified === "boolean") {
    query.set("modified", input.modified ? "1" : "0");
  }
  const payload = await requestAgentyApiJson({
    path: `/jobs/${jobId}/export`,
    query,
    context,
  });
  const record = unwrapAgentyPayload(payload);
  const downloadUrl = asRequiredString(record.downloadlink ?? record.downloadLink, "downloadlink");
  const timeoutSignal = AbortSignal.timeout(agentyTimeoutMs);
  const signal = context.signal ? AbortSignal.any([context.signal, timeoutSignal]) : timeoutSignal;

  try {
    const response = await context.fetcher(downloadUrl, {
      headers: {
        "User-Agent": providerUserAgent,
      },
      signal,
    });
    if (!response.ok) {
      const payload = await readResponsePayload(response);
      throw createAgentyError({
        status: response.status,
        payload,
        mode: "execution",
      });
    }
    return {
      content: await response.text(),
    };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeoutSignal.aborted && !context.signal?.aborted) {
      throw new ProviderRequestError(504, `agenty ${downloadUrl} download timed out after 30 seconds`);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `agenty ${downloadUrl} download failed: ${error.message}` : "agenty download failed",
    );
  }
}

async function listJobFiles(input: Record<string, unknown>, context: AgentyRuntimeContext) {
  const jobId = asRequiredInteger(input.job_id, "job_id");
  const payload = await requestAgentyApiJson({
    path: `/jobs/${jobId}/files`,
    context,
  });
  const record = unwrapAgentyPayload(payload);
  const files = Array.isArray(record.files) ? record.files : [];
  return {
    files: files.map((file) => {
      const value = requiredRecord(file, "files[]", (message) => new ProviderRequestError(502, message));
      return {
        name: asRequiredString(value.name, "files[].name"),
        size: asRequiredInteger(value.size, "files[].size"),
      };
    }),
  };
}

async function downloadJobFile(input: Record<string, unknown>, context: AgentyRuntimeContext) {
  const jobId = asRequiredInteger(input.job_id, "job_id");
  const name = asRequiredIdentifier(input.name, "name");
  const query = new URLSearchParams();
  query.set("name", name);
  const response = await requestAgentyApiResponse({
    path: `/jobs/${jobId}/files`,
    query,
    context,
  });
  return {
    file: await uploadAgentyTransitFile(context, response, name),
  };
}

async function uploadAgentyTransitFile(context: AgentyRuntimeContext, response: Response, name: string) {
  if (!context.transitFiles) {
    throw new ProviderRequestError(500, "agenty file output requires local transit files");
  }

  const mimeType = response.headers.get("content-type") ?? "application/octet-stream";
  const upload = await context.transitFiles.create(new File([await response.arrayBuffer()], name, { type: mimeType }));
  return {
    name,
    mimetype: mimeType,
    downloadUrl: upload.downloadUrl,
  };
}

async function requestAgentyBrowserJson(input: {
  path: string;
  input: Record<string, unknown>;
  context: AgentyRuntimeContext;
}) {
  const response = await requestAgentyBrowser(input);
  return readJsonPayload(response);
}

async function requestAgentyApiJson(input: {
  path: string;
  context: AgentyRuntimeContext;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: URLSearchParams;
  body?: unknown;
  baseUrl?: string;
}) {
  return requestAgentyJson({
    baseUrl: input.baseUrl ?? agentyApiBaseUrl,
    path: input.path,
    method: input.method ?? "GET",
    apiKey: input.context.apiKey,
    fetcher: input.context.fetcher,
    signal: input.context.signal,
    timeoutLabel: `agenty ${input.path} request timed out after 30 seconds`,
    errorMode: "execution",
    body: input.body,
    query: input.query,
  });
}

async function requestAgentyApiResponse(input: {
  path: string;
  context: AgentyRuntimeContext;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: URLSearchParams;
  body?: unknown;
  baseUrl?: string;
}) {
  const timeoutSignal = AbortSignal.timeout(agentyTimeoutMs);
  const signal = input.context.signal ? AbortSignal.any([input.context.signal, timeoutSignal]) : timeoutSignal;

  try {
    const response = await input.context.fetcher(
      buildAgentyUrl(input.baseUrl ?? agentyApiBaseUrl, input.path, input.query),
      {
        method: input.method ?? "GET",
        headers:
          input.body === undefined ? agentyHeaders(input.context.apiKey) : agentyJsonHeaders(input.context.apiKey),
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
        signal,
      },
    );
    if (!response.ok) {
      const payload = await readResponsePayload(response);
      throw createAgentyError({
        status: response.status,
        payload,
        mode: "execution",
      });
    }
    return response;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeoutSignal.aborted && !input.context.signal?.aborted) {
      throw new ProviderRequestError(504, `agenty ${input.path} request timed out after 30 seconds`);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `agenty ${input.path} request failed: ${error.message}` : "agenty request failed",
    );
  }
}

async function requestAgentyBrowser(input: {
  path: string;
  input: Record<string, unknown>;
  context: AgentyRuntimeContext;
}) {
  const timeoutSignal = AbortSignal.timeout(agentyTimeoutMs);
  const signal = input.context.signal ? AbortSignal.any([input.context.signal, timeoutSignal]) : timeoutSignal;

  try {
    const response = await input.context.fetcher(buildAgentyUrl(agentyBrowserBaseUrl, input.path), {
      method: "POST",
      headers: agentyJsonHeaders(input.context.apiKey),
      body: JSON.stringify(input.input),
      signal,
    });

    if (!response.ok) {
      const payload = await readResponsePayload(response);
      throw createAgentyError({
        status: response.status,
        payload,
        mode: "execution",
      });
    }

    return response;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeoutSignal.aborted && !input.context.signal?.aborted) {
      throw new ProviderRequestError(504, `agenty ${input.path} request timed out after 30 seconds`);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `agenty ${input.path} request failed: ${error.message}` : "agenty request failed",
    );
  }
}

async function requestAgentyJson(input: {
  baseUrl: string;
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  apiKey: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
  timeoutLabel: string;
  errorMode: "validation" | "execution";
  body?: unknown;
  query?: URLSearchParams;
}) {
  const timeoutSignal = AbortSignal.timeout(agentyTimeoutMs);
  const signal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;

  try {
    const response = await input.fetcher(buildAgentyUrl(input.baseUrl, input.path, input.query), {
      method: input.method,
      headers: input.body === undefined ? agentyHeaders(input.apiKey) : agentyJsonHeaders(input.apiKey),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal,
    });
    if (!response.ok) {
      const payload = await readResponsePayload(response);
      throw createAgentyError({
        status: response.status,
        payload,
        mode: input.errorMode,
      });
    }
    return readJsonPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeoutSignal.aborted && !input.signal?.aborted) {
      throw new ProviderRequestError(504, input.timeoutLabel);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `agenty ${input.path} request failed: ${error.message}` : "agenty request failed",
    );
  }
}

function agentyHeaders(apiKey: string) {
  return {
    "X-Agenty-ApiKey": apiKey,
    Accept: "application/json",
    "User-Agent": providerUserAgent,
  };
}

function buildAgentyUrl(baseUrl: string, path: string, query?: URLSearchParams) {
  let normalizedPath = path;
  while (normalizedPath.startsWith("/")) {
    normalizedPath = normalizedPath.slice(1);
  }
  const url = new URL(`${baseUrl}/${normalizedPath}`);
  if (query) {
    url.search = query.toString();
  }
  return url;
}

function agentyJsonHeaders(apiKey: string) {
  return {
    ...agentyHeaders(apiKey),
    "Content-Type": "application/json",
  };
}

async function readJsonPayload(response: Response) {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderRequestError(502, `agenty returned invalid JSON with ${response.status}: ${text.slice(0, 200)}`);
  }
}

async function readResponsePayload(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function unwrapAgentyPayload(payload: unknown) {
  const record = optionalRecord(payload);
  if (!record) {
    return {};
  }

  const nestedData = optionalRecord(record.data);
  if (nestedData) {
    return nestedData;
  }

  return record;
}

function extractAgentyMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.error) ?? optionalString(record.message) ?? optionalString(record.error_message);
}

function createAgentyError(input: { status: number; payload: unknown; mode: "validation" | "execution" }) {
  const message = extractAgentyMessage(input.payload) ?? `agenty request failed with status ${input.status}`;

  if (input.mode === "validation") {
    if (input.status === 401 || input.status === 403) {
      return new ProviderRequestError(400, message, input.payload);
    }
    if (input.status === 429) {
      return new ProviderRequestError(429, message, input.payload);
    }
    return new ProviderRequestError(input.status >= 500 ? 502 : input.status, message, input.payload);
  }

  if (input.status === 401 || input.status === 403) {
    return new ProviderRequestError(input.status, message, input.payload);
  }
  if (input.status === 400) {
    return new ProviderRequestError(400, message, input.payload);
  }
  if (input.status === 429) {
    return new ProviderRequestError(429, message, input.payload);
  }
  return new ProviderRequestError(input.status >= 500 ? 502 : input.status, message, input.payload);
}

function asRecord(value: unknown) {
  return optionalRecord(value) ?? {};
}

function readStructuredDataValue(value: unknown) {
  if (value !== undefined) {
    return value;
  }
  return {};
}

function asNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function asOptionalInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function asRequiredString(value: unknown, fieldName: string) {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(502, `${fieldName} is missing`);
  }
  return parsed;
}

function asRequiredInteger(value: unknown, fieldName: string) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(502, `${fieldName} is missing`);
  }
  return value;
}

function asRequiredIdentifier(value: unknown, fieldName: string) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  throw new ProviderRequestError(400, `${fieldName} is required`);
}

function asOptionalIdentifier(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function asRequiredStringArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value.map((item) => asRequiredIdentifier(item, `${fieldName}[]`));
}

function buildPaginationQuery(input: Record<string, unknown>) {
  const query = new URLSearchParams();
  copyOptionalQueryParam(query, input, "limit");
  copyOptionalQueryParam(query, input, "offset");
  copyOptionalQueryParam(query, input, "sort");
  copyOptionalQueryParam(query, input, "order");
  return query;
}

function buildOffsetLimitQuery(input: Record<string, unknown>) {
  const query = new URLSearchParams();
  copyOptionalQueryParam(query, input, "limit");
  copyOptionalQueryParam(query, input, "offset");
  return query;
}

function copyOptionalQueryParam(query: URLSearchParams, input: Record<string, unknown>, key: string) {
  const value = input[key];
  if (typeof value === "string" && value.trim()) {
    query.set(key, value.trim());
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    query.set(key, String(value));
  }
}

function normalizePagedCollection(payload: unknown, collectionKey: "agents" | "templates" | "jobs") {
  const record = unwrapAgentyPayload(payload);
  const items = Array.isArray(record.result)
    ? record.result.map((item) => requiredRecord(item, "result[]", (message) => new ProviderRequestError(502, message)))
    : [];
  return {
    total: asRequiredInteger(record.total, "total"),
    limit: asRequiredInteger(record.limit, "limit"),
    offset: asRequiredInteger(record.offset, "offset"),
    returned: asRequiredInteger(record.returned, "returned"),
    [collectionKey]: items,
  };
}

function normalizeResultCollection(payload: unknown) {
  const record = unwrapAgentyPayload(payload);
  const items = Array.isArray(record.result)
    ? record.result.map((item) => requiredRecord(item, "result[]", (message) => new ProviderRequestError(502, message)))
    : [];
  return {
    total: asRequiredInteger(record.total, "total"),
    limit: asRequiredInteger(record.limit, "limit"),
    offset: asRequiredInteger(record.offset, "offset"),
    returned: asRequiredInteger(record.returned, "returned"),
    result: items,
  };
}

function normalizeMessagePayload(payload: unknown) {
  const record = unwrapAgentyPayload(payload);
  const statusCode = asOptionalInteger(record.status_code) ?? asOptionalInteger(record.statusCode);
  return compactObject({
    statusCode,
    message: asRequiredString(record.message ?? record.status_message ?? record.statusMessage, "message"),
  });
}

function omitKeys(value: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
}

function buildExportFileName(input: Record<string, unknown>) {
  const explicit = optionalString(input.filename);
  if (explicit) {
    return explicit;
  }

  const format = optionalString(input.format)?.toLowerCase();
  if (format === "json") {
    return "output.json";
  }
  if (format === "tsv") {
    return "output.tsv";
  }
  return "output.csv";
}
