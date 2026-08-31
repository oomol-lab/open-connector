import { optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { jsonObject } from "../../core/request.ts";
import { createProviderTimeout, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const skyvernApiBaseUrl = "https://api.skyvern.com";
type SkyvernRequestPhase = "validate" | "execute";

export async function validateSkyvernCredential(apiKey: string, fetcher: typeof fetch): Promise<void> {
  await requestSkyvernJson({ apiKey, path: "/v1/runs?page=1&page_size=1", method: "GET", fetcher, phase: "validate" });
}

export async function executeSkyvernAction(
  actionName: string,
  input: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  if (actionName === "run_task") {
    const payload = await requestSkyvernJson({
      apiKey,
      path: "/v1/run/tasks",
      method: "POST",
      body: jsonObject({
        prompt: optionalString(input.prompt),
        url: optionalString(input.url),
        engine: optionalString(input.engine),
        title: optionalString(input.title),
        data_extraction_schema: input.dataExtractionSchema,
        max_steps: optionalInteger(input.maxSteps),
        webhook_url: optionalString(input.webhookUrl),
        browser_session_id: optionalString(input.browserSessionId),
        browser_profile_id: optionalString(input.browserProfileId),
        start_fresh_browser: optionalBoolean(input.startFreshBrowser),
      }),
      fetcher,
      phase: "execute",
    });
    return { run: normalizeSkyvernRun(payload) };
  }

  if (actionName === "get_run") {
    const runId = requireRunId(input);
    const payload = await requestSkyvernJson({
      apiKey,
      path: `/v1/runs/${encodeURIComponent(runId)}`,
      method: "GET",
      fetcher,
      phase: "execute",
    });
    return { run: normalizeSkyvernRun(payload) };
  }

  if (actionName === "cancel_run") {
    const runId = requireRunId(input);
    await requestSkyvernJson({
      apiKey,
      path: `/v1/runs/${encodeURIComponent(runId)}/cancel`,
      method: "POST",
      fetcher,
      phase: "execute",
    });
    return { runId, canceled: true };
  }

  const payload = await requestSkyvernJson({
    apiKey,
    path: buildListRunsPath(input),
    method: "GET",
    fetcher,
    phase: "execute",
  });
  const runs = Array.isArray(payload) ? payload : undefined;
  if (!runs) {
    throw new ProviderRequestError(502, "Skyvern returned an invalid run list");
  }
  return { runs: runs.map(normalizeSkyvernRunListItem) };
}

function buildListRunsPath(input: Record<string, unknown>) {
  const query = new URLSearchParams();
  const page = optionalInteger(input.page);
  const pageSize = optionalInteger(input.pageSize);
  const searchKey = optionalString(input.searchKey);
  if (page !== undefined) query.set("page", String(page));
  if (pageSize !== undefined) query.set("page_size", String(pageSize));
  if (searchKey) query.set("search_key", searchKey);
  appendStringValues(query, "status", input.statuses);
  appendStringValues(query, "run_type", input.runTypes);
  return `/v1/runs${query.size === 0 ? "" : `?${query}`}`;
}

function appendStringValues(query: URLSearchParams, name: string, value: unknown) {
  for (const item of Array.isArray(value) ? value : []) {
    const stringValue = optionalString(item);
    if (stringValue) query.append(name, stringValue);
  }
}

function normalizeSkyvernRun(payload: unknown) {
  const run = optionalRecord(payload);
  if (!run) {
    throw new ProviderRequestError(502, "Skyvern returned an invalid run response");
  }
  const runId = optionalString(run.run_id);
  const status = optionalString(run.status);
  const runType = optionalString(run.run_type);
  const createdAt = optionalString(run.created_at);
  if (!runId || !status || !runType || !createdAt) {
    throw new ProviderRequestError(
      502,
      "Skyvern run response did not include run_id, status, run_type, and created_at",
    );
  }
  return jsonObject({
    ...run,
    runId,
    status,
    runType,
    output: run.output ?? null,
    failureReason: optionalString(run.failure_reason) ?? null,
    createdAt,
    modifiedAt: optionalString(run.modified_at),
    startedAt: optionalString(run.started_at) ?? null,
    finishedAt: optionalString(run.finished_at) ?? null,
    recordingUrl: optionalString(run.recording_url) ?? null,
    screenshotUrls: Array.isArray(run.screenshot_urls) ? run.screenshot_urls : undefined,
    downloadedFiles: Array.isArray(run.downloaded_files) ? run.downloaded_files : undefined,
    appUrl: optionalString(run.app_url) ?? null,
    run_id: undefined,
    run_type: undefined,
    failure_reason: undefined,
    created_at: undefined,
    modified_at: undefined,
    started_at: undefined,
    finished_at: undefined,
    recording_url: undefined,
    screenshot_urls: undefined,
    downloaded_files: undefined,
    app_url: undefined,
  });
}

function normalizeSkyvernRunListItem(payload: unknown) {
  const run = optionalRecord(payload);
  if (!run) {
    throw new ProviderRequestError(502, "Skyvern returned an invalid run list item");
  }
  const runId = optionalString(run.run_id);
  const status = optionalString(run.status);
  const runType = optionalString(run.task_run_type);
  const createdAt = optionalString(run.created_at);
  if (!runId || !status || !runType || !createdAt) {
    throw new ProviderRequestError(
      502,
      "Skyvern run list item did not include run_id, status, task_run_type, and created_at",
    );
  }
  return jsonObject({
    ...run,
    runId,
    status,
    runType,
    createdAt,
    title: optionalString(run.title) ?? null,
    startedAt: optionalString(run.started_at) ?? null,
    finishedAt: optionalString(run.finished_at) ?? null,
    task_run_id: undefined,
    run_id: undefined,
    task_run_type: undefined,
    created_at: undefined,
    started_at: undefined,
    finished_at: undefined,
  });
}

function requireRunId(input: Record<string, unknown>) {
  const runId = optionalString(input.runId);
  if (!runId) throw new ProviderRequestError(400, "runId is required");
  return runId;
}

async function requestSkyvernJson(input: {
  apiKey: string;
  path: string;
  method: "GET" | "POST";
  body?: unknown;
  fetcher: typeof fetch;
  phase: SkyvernRequestPhase;
}) {
  const timeout = createProviderTimeout(undefined);
  try {
    const response = await input.fetcher(new URL(input.path, skyvernApiBaseUrl), {
      method: input.method,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-api-key": input.apiKey,
        "user-agent": providerUserAgent,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readSkyvernPayload(response);
    if (!response.ok) throw createSkyvernError(response, payload, input.phase);
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || (error instanceof Error && error.name === "AbortError")) {
      throw new ProviderRequestError(504, "Skyvern request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Skyvern request failed: ${error.message}` : "Skyvern request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readSkyvernPayload(response: Response) {
  const text = await response.text();
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createSkyvernError(response: Response, payload: unknown, phase: SkyvernRequestPhase) {
  const details = optionalRecord(payload);
  const message =
    optionalString(details?.detail) ??
    optionalString(details?.message) ??
    (typeof payload === "string" ? payload : undefined) ??
    `Skyvern request failed with status ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message);
  }
  if (response.status === 429) return new ProviderRequestError(429, message);
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(response.status, message);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message);
}
