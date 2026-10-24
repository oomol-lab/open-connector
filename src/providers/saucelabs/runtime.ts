import { Buffer } from "node:buffer";
import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  providerUserAgent,
  ProviderRequestError,
  providerInputError,
  providerResponseError,
} from "../provider-runtime.ts";

const saucelabsDataCenters = ["us-west-1", "us-east-4", "eu-central-1"] as const;
type SaucelabsDataCenter = (typeof saucelabsDataCenters)[number];

export type SaucelabsCredential = {
  apiKey: string;
  username: string;
  dataCenter: SaucelabsDataCenter;
  apiBaseUrl: string;
};

type RequestPhase = "validate" | "execute";

interface SaucelabsValidationResult {
  providerAccountId: string;
  accountLabel: string;
  providerScopes: string[];
  providerMetadata: Record<string, unknown>;
}

export function resolveSaucelabsCredential(input: Record<string, unknown>): SaucelabsCredential {
  const apiKey = requiredString(input.apiKey, "apiKey", providerInputError);
  const username = requireString(input.username, "username");
  const dataCenter = requireString(input.dataCenter, "dataCenter");
  if (!saucelabsDataCenters.includes(dataCenter as SaucelabsDataCenter)) {
    throw new ProviderRequestError(400, "dataCenter must be us-west-1, us-east-4, or eu-central-1");
  }
  return {
    apiKey,
    username,
    dataCenter: dataCenter as SaucelabsDataCenter,
    apiBaseUrl: `https://api.${dataCenter}.saucelabs.com`,
  };
}

export async function validateSaucelabsCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<SaucelabsValidationResult> {
  const credential = resolveSaucelabsCredential(input);
  await requestSaucelabs({
    credential,
    path: `/rest/v1/${encodeURIComponent(credential.username)}/jobs`,
    query: { limit: "1" },
    fetcher,
    phase: "validate",
  });
  return {
    providerAccountId: `saucelabs:${credential.dataCenter}:${credential.username}`,
    accountLabel: credential.username,
    providerScopes: [],
    providerMetadata: {
      username: credential.username,
      dataCenter: credential.dataCenter,
      apiBaseUrl: credential.apiBaseUrl,
      validationEndpoint: `/rest/v1/${credential.username}/jobs`,
    },
  };
}

export async function executeSaucelabsAction(input: {
  actionName: string;
  input: Record<string, unknown>;
  credential: SaucelabsCredential;
  fetcher: typeof fetch;
}): Promise<unknown> {
  const { actionName, credential, fetcher } = input;
  const usernamePath = `/rest/v1/${encodeURIComponent(credential.username)}/jobs`;
  switch (actionName) {
    case "list_jobs": {
      const payload = await requestSaucelabs({
        credential,
        path: usernamePath,
        query: compactObject({
          limit: stringifyInteger(input.input.limit),
          skip: stringifyInteger(input.input.skip),
          from: stringifyInteger(input.input.from),
          to: stringifyInteger(input.input.to),
        }),
        fetcher,
        phase: "execute",
      });
      return { jobs: requireArray(payload, "jobs") };
    }
    case "get_job": {
      const jobId = requireString(input.input.job_id, "job_id");
      return {
        job: requireObject(
          await requestSaucelabs({
            credential,
            path: `${usernamePath}/${encodeURIComponent(jobId)}`,
            fetcher,
            phase: "execute",
          }),
          "job",
        ),
      };
    }
    case "update_job": {
      const jobId = requireString(input.input.job_id, "job_id");
      const body = compactObject({
        name: optionalString(input.input.name),
        tags: Array.isArray(input.input.tags) ? input.input.tags : undefined,
        public: optionalString(input.input.public),
        passed: optionalBoolean(input.input.passed),
      });
      if (Object.keys(body).length === 0) {
        throw new ProviderRequestError(400, "update_job requires at least one field to update");
      }
      return {
        job: requireObject(
          await requestSaucelabs({
            credential,
            method: "PUT",
            path: `${usernamePath}/${encodeURIComponent(jobId)}`,
            body,
            fetcher,
            phase: "execute",
          }),
          "job",
        ),
      };
    }
    case "list_job_assets": {
      const jobId = requireString(input.input.job_id, "job_id");
      return {
        assets: requireObject(
          await requestSaucelabs({
            credential,
            path: `${usernamePath}/${encodeURIComponent(jobId)}/assets`,
            fetcher,
            phase: "execute",
          }),
          "assets",
        ),
      };
    }
    case "list_builds": {
      const source = requireString(input.input.build_source, "build_source");
      const payload = requireObject(
        await requestSaucelabs({
          credential,
          path: `/v2/builds/${encodeURIComponent(source)}/`,
          query: buildBuildQuery(input.input),
          fetcher,
          phase: "execute",
        }),
        "build list",
      );
      return {
        builds: requireArray(payload.builds, "builds"),
        ...(optionalRecord(payload.meta) ? { meta: optionalRecord(payload.meta) } : {}),
      };
    }
    case "get_build": {
      const source = requireString(input.input.build_source, "build_source");
      const buildId = requireString(input.input.build_id, "build_id");
      return {
        build: requireObject(
          await requestSaucelabs({
            credential,
            path: `/v2/builds/${encodeURIComponent(source)}/${encodeURIComponent(buildId)}/`,
            fetcher,
            phase: "execute",
          }),
          "build",
        ),
      };
    }
    case "list_build_jobs": {
      const source = requireString(input.input.build_source, "build_source");
      const buildId = requireString(input.input.build_id, "build_id");
      const payload = requireObject(
        await requestSaucelabs({
          credential,
          path: `/v2/builds/${encodeURIComponent(source)}/${encodeURIComponent(buildId)}/jobs/`,
          query: compactObject({
            modified_since: stringifyInteger(input.input.modified_since),
            completed: stringifyBoolean(input.input.completed),
            errored: stringifyBoolean(input.input.errored),
            failed: stringifyBoolean(input.input.failed),
            finished: stringifyBoolean(input.input.finished),
            new: stringifyBoolean(input.input.new),
            passed: stringifyBoolean(input.input.passed),
            public: stringifyBoolean(input.input.public),
            queued: stringifyBoolean(input.input.queued),
            running: stringifyBoolean(input.input.running),
            faulty: stringifyBoolean(input.input.faulty),
          }),
          fetcher,
          phase: "execute",
        }),
        "build jobs",
      );
      return { jobs: requireArray(payload.jobs, "jobs") };
    }
  }
}

function buildBuildQuery(input: Record<string, unknown>) {
  const query: Record<string, string | undefined> = compactObject({
    start: stringifyInteger(input.start),
    end: stringifyInteger(input.end),
    limit: stringifyInteger(input.limit),
    offset: stringifyInteger(input.offset),
    name: optionalString(input.name),
    sort: optionalString(input.sort),
  });
  if (Array.isArray(input.status)) {
    query.status = input.status.join(",");
  }
  return query;
}

async function requestSaucelabs(input: {
  credential: SaucelabsCredential;
  method?: string;
  path: string;
  query?: Record<string, string | undefined>;
  body?: unknown;
  fetcher: typeof fetch;
  phase: RequestPhase;
}) {
  const url = new URL(input.path, input.credential.apiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  const timeout = createProviderTimeout(undefined, 31_000);
  try {
    const response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: `Basic ${Buffer.from(`${input.credential.username}:${input.credential.apiKey}`).toString("base64")}`,
        ...(input.body === undefined ? {} : { "content-type": "application/json" }),
        "user-agent": providerUserAgent,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) throw createSaucelabsError(response, payload, input.phase);
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || (error instanceof DOMException && error.name === "AbortError")) {
      throw new ProviderRequestError(504, "Sauce Labs request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Sauce Labs request failed: ${error.message}` : "Sauce Labs request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function createSaucelabsError(response: Response, payload: unknown, phase: RequestPhase) {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.detail) ??
    optionalString(record?.message) ??
    `Sauce Labs request failed with status ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }
  if (response.status === 429) return new ProviderRequestError(429, message);
  if (response.status >= 400 && response.status < 500) return providerInputError(message);
  return providerResponseError(message);
}

function stringifyInteger(value: unknown) {
  const integer = optionalInteger(value);
  return integer === undefined ? undefined : String(integer);
}

function stringifyBoolean(value: unknown) {
  const boolean = optionalBoolean(value);
  return boolean === undefined ? undefined : String(boolean);
}

function requireString(value: unknown, field: string) {
  const result = optionalString(value);
  if (!result) throw new ProviderRequestError(400, `${field} is required`);
  return result;
}

function requireObject(value: unknown, field: string) {
  const result = optionalRecord(value);
  if (!result) throw new ProviderRequestError(502, `Sauce Labs returned an invalid ${field} response`);
  return result;
}

function requireArray(value: unknown, field: string) {
  if (!Array.isArray(value)) throw new ProviderRequestError(502, `Sauce Labs returned an invalid ${field} response`);
  return value;
}
