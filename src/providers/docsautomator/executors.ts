import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { DocsautomatorActionName } from "./actions.ts";

import { createHash } from "node:crypto";
import {
  compactObject,
  optionalIntegerOrNull,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  defineProviderExecutors,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
  requiredResponseRecord,
} from "../provider-runtime.ts";

const service = "docsautomator";
const apiBaseUrl = "https://api.docsautomator.co";

interface DocsautomatorContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type Phase = "validate" | "execute";
type Handler = (input: Record<string, unknown>, context: DocsautomatorContext) => Promise<unknown>;

const handlers: Record<DocsautomatorActionName, Handler> = {
  create_document(input, context) {
    return createDocument(input, context, false);
  },
  create_document_async(input, context) {
    return createDocument(input, context, true);
  },
  get_document_job(input, context) {
    return getDocumentJob(input, context);
  },
  get_queue_stats(_input, context) {
    return getQueueStats(context);
  },
  list_automations(_input, context) {
    return listAutomations(context);
  },
  get_automation(input, context) {
    return getAutomation(input, context);
  },
  list_template_placeholders(input, context) {
    return listTemplatePlaceholders(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<DocsautomatorContext>({
  service,
  handlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<DocsautomatorContext> {
    const credential = await requireApiKeyCredential(context, service);
    return { apiKey: credential.apiKey, fetcher, signal: context.signal };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await request({
      path: "/queue/stats",
      apiKey: input.apiKey,
      fetcher,
      signal,
      phase: "validate",
    });
    const queue = normalizeQueueStats(payload);
    return {
      profile: {
        accountId: `docsautomator:token:${createHash("sha256").update(input.apiKey).digest("hex").slice(0, 16)}`,
        displayName: "DocsAutomator API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl,
        validationEndpoint: "/queue/stats",
        waiting: queue.waiting,
        active: queue.active,
        completed: queue.completed,
        failed: queue.failed,
        delayed: queue.delayed,
      },
    };
  },
};

async function createDocument(
  input: Record<string, unknown>,
  context: DocsautomatorContext,
  asyncMode: boolean,
): Promise<unknown> {
  const payload = await request({
    method: "POST",
    path: "/createDocument",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    body: buildCreateDocumentBody(input, asyncMode),
    acceptedStatuses: asyncMode ? [202] : [200],
  });
  return asyncMode ? { job: normalizeAsyncJobHandle(payload) } : { document: normalizeDocument(payload) };
}

async function getDocumentJob(input: Record<string, unknown>, context: DocsautomatorContext): Promise<unknown> {
  const jobId = requiredString(input.jobId, "jobId", providerResponseError);
  const payload = await request({
    path: `/job/${encodeURIComponent(jobId)}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const raw = requiredResponseRecord(payload, "job");
  return {
    job: normalizeJob(raw),
    document: raw.result == null ? null : normalizeDocument(raw.result),
  };
}

async function getQueueStats(context: DocsautomatorContext): Promise<unknown> {
  return {
    queue: normalizeQueueStats(
      await request({
        path: "/queue/stats",
        apiKey: context.apiKey,
        fetcher: context.fetcher,
        signal: context.signal,
        phase: "execute",
      }),
    ),
  };
}

async function listAutomations(context: DocsautomatorContext): Promise<unknown> {
  const payload = await request({
    path: "/automations",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const record = requiredResponseRecord(payload, "automations response");
  const items = Array.isArray(record.automations) ? record.automations : [];
  return { automations: items.map((item, index) => normalizeAutomation(item, `automations[${index}]`)) };
}

async function getAutomation(input: Record<string, unknown>, context: DocsautomatorContext): Promise<unknown> {
  const payload = await request({
    path: "/automation",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    query: buildAutomationQuery(input),
  });
  return {
    automation: normalizeAutomation(requiredResponseRecord(payload, "automation response").automation, "automation"),
  };
}

async function listTemplatePlaceholders(
  input: Record<string, unknown>,
  context: DocsautomatorContext,
): Promise<unknown> {
  const payload = await request({
    path: "/listPlaceholdersV2",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    query: buildAutomationQuery(input),
  });
  const placeholders = requiredResponseRecord(
    requiredResponseRecord(payload, "placeholders response").placeholders,
    "placeholders",
  );
  return {
    placeholders: Object.fromEntries(
      Object.entries(placeholders).map(([key, value]) => [
        key,
        Array.isArray(value) ? value.map((item) => String(item)) : [],
      ]),
    ),
  };
}

async function request(input: {
  method?: "GET" | "POST";
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  phase: Phase;
  signal?: AbortSignal;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
  acceptedStatuses?: number[];
}): Promise<unknown> {
  const url = new URL(input.path, apiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: compactObject({
        accept: "application/json",
        authorization: `Bearer ${input.apiKey}`,
        "content-type": input.body === undefined ? undefined : "application/json",
        "user-agent": providerUserAgent,
      }) as Record<string, string>,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.signal,
    });
    payload = await readPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `docsautomator request failed: ${error.message}` : "docsautomator request failed",
    );
  }
  if (!(input.acceptedStatuses ?? [200]).includes(response.status)) {
    throw createError(response.status, extractErrorMessage(payload), input.phase, payload);
  }
  return payload;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createError(
  status: number,
  message: string | undefined,
  phase: Phase,
  details: unknown,
): ProviderRequestError {
  const normalized = message ?? `docsautomator request failed with status ${status}`;
  if (status === 429) return new ProviderRequestError(429, normalized, details);
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, normalized, details);
  }
  if (status === 400 || status === 404 || status === 422) return new ProviderRequestError(400, normalized, details);
  return new ProviderRequestError(status >= 500 ? 502 : status, normalized, details);
}

function extractErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) return payload;
  const record = optionalRecord(payload);
  return optionalString(record?.error) ?? optionalString(record?.message) ?? optionalString(record?.details);
}

function buildCreateDocumentBody(input: Record<string, unknown>, asyncMode: boolean): Record<string, unknown> {
  return compactObject({
    docId: pickAutomationId(input),
    data: optionalRecord(input.data),
    documentName: optionalString(input.documentName),
    async: asyncMode ? true : undefined,
    webhookParams: optionalRecord(input.webhookParams),
    existingPdfs: Array.isArray(input.existingPdfs) ? input.existingPdfs.map((item) => String(item)) : undefined,
    docTemplateLink: optionalString(input.docTemplateLink),
  });
}

function buildAutomationQuery(input: Record<string, unknown>): Record<string, unknown> {
  const automationId = optionalString(input.automationId);
  const docId = optionalString(input.docId);
  if (!automationId && !docId) throw new ProviderRequestError(400, "automationId or docId is required");
  return compactObject({ automationId, docId: automationId ? undefined : docId });
}

function pickAutomationId(input: Record<string, unknown>): string {
  return optionalString(input.automationId) ?? requiredString(input.docId, "docId", providerResponseError);
}

function normalizeAsyncJobHandle(payload: unknown): Record<string, unknown> {
  const record = requiredResponseRecord(payload, "job handle");
  return {
    message: nullableText(record.message),
    jobId: requiredString(record.jobId, "jobId", providerResponseError),
    logId: nullableText(record.logId),
    raw: record,
  };
}

function normalizeJob(payload: unknown): Record<string, unknown> {
  const record = requiredResponseRecord(payload, "job");
  return {
    jobId: requiredString(record.jobId, "jobId", providerResponseError),
    status: requiredString(record.status, "status", providerResponseError),
    progress: optionalIntegerOrNull(record.progress),
    createdAt: nullableText(record.createdAt),
    processedOn: nullableText(record.processedOn),
    finishedOn: nullableText(record.finishedOn),
    attempts: optionalIntegerOrNull(record.attempts),
    error: nullableText(record.error),
    raw: record,
  };
}

function normalizeDocument(payload: unknown): Record<string, unknown> {
  const record = requiredResponseRecord(payload, "document result");
  const rawSigningLinks = Array.isArray(record.signingLinks) ? record.signingLinks : [];
  return {
    message: nullableText(record.message),
    pdfUrl: nullableText(record.pdfUrl),
    documentName: nullableText(record.documentName),
    googleDocUrl: nullableText(record.googleDocUrl),
    googleDrivePdfUrl: nullableText(record.savePdfGoogleDriveUrl),
    googleDrivePdfFileId: nullableText(record.savePdfGoogleDriveFileId),
    signingSessionId: nullableText(record.signingSessionId),
    signingStatus: nullableText(record.signingStatus),
    signingLinks: rawSigningLinks.map((item) => normalizeSigningLink(item)),
    raw: record,
  };
}

function normalizeSigningLink(payload: unknown): Record<string, unknown> {
  const record = requiredResponseRecord(payload, "signing link");
  return {
    signerIndex: optionalIntegerOrNull(record.signerIndex),
    email: nullableText(record.email),
    name: nullableText(record.name),
    signingUrl: nullableText(record.signingUrl),
    status: nullableText(record.status),
  };
}

function normalizeQueueStats(payload: unknown): Record<string, unknown> {
  const record = requiredResponseRecord(payload, "queue stats");
  return {
    waiting: requiredInteger(record.waiting, "waiting"),
    active: requiredInteger(record.active, "active"),
    completed: requiredInteger(record.completed, "completed"),
    failed: requiredInteger(record.failed, "failed"),
    delayed: requiredInteger(record.delayed, "delayed"),
    raw: record,
  };
}

function normalizeAutomation(payload: unknown, fieldName: string): Record<string, unknown> {
  const record = requiredResponseRecord(payload, fieldName);
  return {
    id: requiredString(record._id, `${fieldName}._id`, providerResponseError),
    title: nullableText(record.title),
    dataSourceName: nullableText(record.dataSourceName),
    dataSource: optionalRecord(record.dataSource) ?? null,
    docTemplateLink: nullableText(record.docTemplateLink),
    newDocumentNameField: nullableText(record.newDocumentNameField),
    isActive: typeof record.isActive === "boolean" ? record.isActive : null,
    saveGoogleDoc: typeof record.saveGoogleDoc === "boolean" ? record.saveGoogleDoc : null,
    locale: nullableText(record.locale),
    formatNumbersWithLocale:
      typeof record.formatNumbersWithLocale === "boolean" ? record.formatNumbersWithLocale : null,
    pdfExpiration: nullableText(record.pdfExpiration),
    dateCreated: nullableText(record.dateCreated),
    lastPreviewPdf: nullableText(record.lastPreviewPdf),
    raw: record,
  };
}

function requiredInteger(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new ProviderRequestError(502, `${fieldName} must be an integer`);
  return parsed;
}

function nullableText(value: unknown): string | null {
  return value == null ? null : (optionalString(value) ?? null);
}
