import type { CredentialValidationResult } from "../../core/types.ts";

import {
  compactObject,
  looseArray,
  optionalRecord,
  optionalString,
  rawStringOrNull,
  requiredString,
} from "../../core/cast.ts";
import { createAppStoreConnectAuthorization } from "../app_store_connect/jwt.ts";
import {
  ProviderRequestError,
  requiredInputString,
  requiredResponseRecord,
  providerResponseError,
  runProviderRequest,
} from "../provider-runtime.ts";

export const appleNotaryApiOrigin = "https://appstoreconnect.apple.com";
const submissionsPath = "/notary/v2/submissions";

interface Context {
  authorization: () => Promise<string>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

async function request(
  context: Context,
  path: string,
  options: { method?: string; body?: unknown; validate?: boolean } = {},
): Promise<unknown> {
  return runProviderRequest({ signal: context.signal, label: "Apple notary service" }, async (signal) => {
    const headers = new Headers({ accept: "application/json", authorization: await context.authorization() });
    if (options.body !== undefined) headers.set("content-type", "application/json");
    const response = await context.fetcher(`${appleNotaryApiOrigin}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal,
    });
    const text = await response.text();
    let payload: unknown = null;
    if (text.trim()) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }
    if (!response.ok) {
      const error = optionalRecord(payload);
      const summary = [optionalString(error?.name), optionalString(error?.description)].filter(Boolean).join(": ");
      const message = summary || `Apple notary service request failed with HTTP ${response.status}`;
      if (options.validate && (response.status === 401 || response.status === 403))
        throw new ProviderRequestError(400, "The notary service rejected the key.", payload);
      throw new ProviderRequestError(response.status, message, payload);
    }
    return payload;
  });
}

function normalize(resource: Record<string, unknown>): Record<string, unknown> {
  const attributes = optionalRecord(resource.attributes) ?? {};
  return {
    id: requiredString(resource.id, "submission id", providerResponseError),
    name: rawStringOrNull(attributes.name),
    status: rawStringOrNull(attributes.status),
    createdDate: rawStringOrNull(attributes.createdDate),
  };
}
function path(id: string, suffix = ""): string {
  return `${submissionsPath}/${encodeURIComponent(id)}${suffix}`;
}

export const appleNotaryHandlers: Record<
  string,
  (input: Record<string, unknown>, context: Context) => Promise<unknown>
> = {
  async submit_software(input, context) {
    const urls = looseArray(input.notificationWebhookUrls).map((value) =>
      requiredInputString(value, "notificationWebhookUrls item"),
    );
    const payload = await request(context, submissionsPath, {
      method: "POST",
      body: compactObject({
        submissionName: requiredInputString(input.submissionName, "submissionName"),
        sha256: requiredInputString(input.sha256, "sha256"),
        notifications: urls.length ? urls.map((target) => ({ channel: "webhook", target })) : undefined,
      }),
    });
    const resource = requiredResponseRecord(
      requiredResponseRecord(payload, "Apple notary submission").data,
      "Apple notary submission data",
    );
    const attributes = requiredResponseRecord(resource.attributes, "Apple notary upload credentials");
    return {
      submissionId: requiredString(resource.id, "submission id", providerResponseError),
      upload: {
        bucket: requiredString(attributes.bucket, "bucket", providerResponseError),
        object: requiredString(attributes.object, "object", providerResponseError),
        awsAccessKeyId: requiredString(attributes.awsAccessKeyId, "awsAccessKeyId", providerResponseError),
        awsSecretAccessKey: requiredString(attributes.awsSecretAccessKey, "awsSecretAccessKey", providerResponseError),
        awsSessionToken: requiredString(attributes.awsSessionToken, "awsSessionToken", providerResponseError),
      },
    };
  },
  async get_submission_status(input, context) {
    const id = requiredInputString(input.submissionId, "submissionId");
    return {
      submissionId: id,
      submission: normalize(
        requiredResponseRecord(
          requiredResponseRecord(await request(context, path(id)), "Apple notary submission").data,
          "Apple notary submission data",
        ),
      ),
    };
  },
  async list_submissions(_input, context) {
    let payload: unknown;
    try {
      payload = await request(context, submissionsPath);
    } catch (error) {
      if (isEmptyTeamNotFound(error)) return { submissions: [] };
      throw error;
    }
    const envelope = requiredResponseRecord(payload, "Apple notary submissions");
    return {
      submissions: looseArray(envelope.data).map((value) =>
        normalize(requiredResponseRecord(value, "Apple notary submission")),
      ),
    };
  },
  async get_submission_log(input, context) {
    const id = requiredInputString(input.submissionId, "submissionId");
    const log = requiredResponseRecord(
      requiredResponseRecord(await request(context, path(id, "/logs")), "Apple notary log").data,
      "Apple notary log data",
    );
    const attributes = requiredResponseRecord(log.attributes, "Apple notary log attributes");
    return {
      submissionId: id,
      developerLogUrl: requiredString(attributes.developerLogUrl, "developerLogUrl", providerResponseError),
    };
  },
};

export async function validateAppleNotaryCredential(
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const keyId = requiredInputString(values.keyId, "keyId");
  const issuerId = optionalString(values.issuerId);
  try {
    await request({ authorization: createAppStoreConnectAuthorization(values), fetcher, signal }, submissionsPath, {
      validate: true,
    });
  } catch (error) {
    if (!isEmptyTeamNotFound(error)) throw error;
  }
  return {
    profile: { accountId: issuerId ?? keyId, displayName: `Apple notary key ${keyId}` },
    metadata: {
      apiBaseUrl: appleNotaryApiOrigin,
      validationEndpoint: submissionsPath,
      keyId,
      issuerId: issuerId ?? null,
    },
  };
}

function isEmptyTeamNotFound(error: unknown): boolean {
  if (!(error instanceof ProviderRequestError) || error.status !== 404) return false;
  const payload = optionalRecord(error.details);
  return optionalString(payload?.name) !== undefined || optionalString(payload?.description) !== undefined;
}
