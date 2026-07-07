import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  readTransitFileInput,
} from "../provider-runtime.ts";

const service = "pandadoc";
export const pandadocApiBaseUrl = "https://api.pandadoc.com";
const validationPath = "/public/v1/templates";

type PandadocPhase = "validate" | "execute";
type PandadocQueryValue = boolean | number | string | string[] | null | undefined;
type PandadocActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const pandadocActionHandlers: Record<string, PandadocActionHandler> = {
  async list_contacts(input, context) {
    const payload = await requestPandadocJson(context, {
      path: "/public/v1/contacts",
      query: { email: optionalString(input.email) },
    });
    return { results: listResults(payload) };
  },
  async create_or_update_contact(input, context) {
    const email = optionalString(input.email);
    const existing = email
      ? (await listContacts({ email }, context)).find(
          (item) => optionalString(item.email)?.toLowerCase() === email.toLowerCase(),
        )
      : undefined;
    const payload = await requestPandadocJson(context, {
      path: existing
        ? `/public/v1/contacts/${encodeURIComponent(requiredString(existing.id, "contact.id", providerResponseError))}`
        : "/public/v1/contacts",
      method: existing ? "PATCH" : "POST",
      body: compactObject({
        email: optionalString(input.email),
        first_name: optionalString(input.first_name),
        last_name: optionalString(input.last_name),
        company: optionalString(input.company),
        phone: optionalString(input.phone),
        job_title: optionalString(input.job_title),
        state: optionalString(input.state),
        city: optionalString(input.city),
        country: optionalString(input.country),
        postal_code: optionalString(input.postal_code),
        street_address: optionalString(input.street_address),
      }),
      notFoundAsInvalidInput: Boolean(existing),
    });
    return requiredRecord(payload, "PandaDoc contact response", providerResponseError);
  },
  async delete_contact(input, context) {
    await requestPandadocJson(context, {
      path: `/public/v1/contacts/${encodeURIComponent(requiredString(input.contact_id, "contact_id", invalidInputError))}`,
      method: "DELETE",
      notFoundAsInvalidInput: true,
    });
    return { success: true };
  },
  async list_templates(input, context) {
    const payload = requiredRecord(
      await requestPandadocJson(context, {
        path: "/public/v1/templates",
        query: {
          q: optionalString(input.q),
          page: optionalInteger(input.page),
          count: optionalInteger(input.count),
          shared: optionalBoolean(input.shared),
          deleted: optionalBoolean(input.deleted),
          folder_uuid: optionalString(input.folder_uuid),
          fields: stringArray(input.fields),
          tag: stringArray(input.tag),
        },
      }),
      "PandaDoc template list response",
      providerResponseError,
    );
    const id = optionalString(input.id);
    const results = listResults(payload).filter((item) => !id || optionalString(item.id) === id);
    return compactObject({
      results,
      count: optionalInteger(payload.count),
      next: optionalString(payload.next) ?? null,
      previous: optionalString(payload.previous) ?? null,
    });
  },
  async get_template_details(input, context) {
    return requiredRecord(
      await requestPandadocJson(context, {
        path: `/public/v1/templates/${encodeURIComponent(requiredString(input.template_id, "template_id", invalidInputError))}/details`,
        notFoundAsInvalidInput: true,
      }),
      "PandaDoc template details response",
      providerResponseError,
    );
  },
  async create_template(input, context) {
    const content = optionalRecord(input.content);
    const fileReference = optionalRecord(input.file);
    if (Number(content !== undefined) + Number(fileReference !== undefined) !== 1) {
      throw new ProviderRequestError(400, "Exactly one of content or file is required.");
    }
    if (fileReference) {
      const transitFile = await readTransitFileInput(fileReference, context);
      const formData = new FormData();
      formData.set("file", transitFile.file);
      formData.set(
        "data",
        JSON.stringify(
          compactObject({
            name: optionalString(input.name),
            description: optionalString(input.description),
            tags: stringArray(input.tags),
          }),
        ),
      );
      return requiredRecord(
        await requestPandadocJson(context, {
          path: "/public/v1/templates",
          rawQuery: "upload",
          method: "POST",
          body: formData,
        }),
        "PandaDoc create template response",
        providerResponseError,
      );
    }
    return requiredRecord(
      await requestPandadocJson(context, {
        path: "/public/v1/templates",
        method: "POST",
        body: compactObject({
          name: optionalString(input.name),
          description: optionalString(input.description),
          tags: stringArray(input.tags),
          content,
        }),
      }),
      "PandaDoc create template response",
      providerResponseError,
    );
  },
  async delete_template(input, context) {
    const payload = await requestPandadocJson(context, {
      path: `/public/v1/templates/${encodeURIComponent(requiredString(input.template_id, "template_id", invalidInputError))}`,
      method: "DELETE",
      notFoundAsInvalidInput: true,
    });
    const record = optionalRecord(payload);
    return {
      status: optionalString(record?.status) ?? "deleted",
      message: optionalString(record?.message) ?? "Template deleted successfully.",
    };
  },
  async list_document_folders(input, context) {
    const payload = requiredRecord(
      await requestPandadocJson(context, {
        path: "/public/v1/documents/folders",
        query: {
          page: optionalInteger(input.page),
          count: optionalInteger(input.count),
          parent_uuid: optionalString(input.parent_uuid),
        },
      }),
      "PandaDoc folder list response",
      providerResponseError,
    );
    return compactObject({
      results: listResults(payload),
      count: optionalInteger(payload.count),
      next: optionalString(payload.next) ?? null,
      previous: optionalString(payload.previous) ?? null,
    });
  },
  async create_folder(input, context) {
    return requiredRecord(
      await requestPandadocJson(context, {
        path: "/public/v1/documents/folders",
        method: "POST",
        body: compactObject({
          name: optionalString(input.name),
          parent_uuid: optionalString(input.parent_uuid),
        }),
      }),
      "PandaDoc folder response",
      providerResponseError,
    );
  },
  async create_document_from_file(input, context) {
    const transitFile = await readTransitFileInput(input.file, context);
    const formData = new FormData();
    formData.set("file", transitFile.file);
    formData.set(
      "data",
      JSON.stringify(
        compactObject({
          name: optionalString(input.name),
          recipients: arrayValue(input.recipients),
          tokens: arrayValue(input.tokens),
          fields: optionalRecord(input.fields),
          metadata: optionalRecord(input.metadata),
          tags: stringArray(input.tags),
          folder_uuid: optionalString(input.folder_uuid),
        }),
      ),
    );
    return requiredRecord(
      await requestPandadocJson(context, {
        path: "/public/v1/documents",
        rawQuery: "upload",
        method: "POST",
        body: formData,
      }),
      "PandaDoc document creation response",
      providerResponseError,
    );
  },
  async get_document_details(input, context) {
    return requiredRecord(
      await requestPandadocJson(context, {
        path: `/public/v1/documents/${encodeURIComponent(requiredString(input.document_id, "document_id", invalidInputError))}/details`,
        notFoundAsInvalidInput: true,
      }),
      "PandaDoc document details response",
      providerResponseError,
    );
  },
  async create_webhook(input, context) {
    return requiredRecord(
      await requestPandadocJson(context, {
        path: "/public/v1/webhook-subscriptions",
        method: "POST",
        body: compactObject({
          name: optionalString(input.name),
          url: optionalString(input.url),
          triggers: stringArray(input.triggers),
        }),
      }),
      "PandaDoc webhook response",
      providerResponseError,
    );
  },
  async create_document_attachment(input, context) {
    const transitFile = await readTransitFileInput(input.file, context);
    const formData = new FormData();
    formData.set("file", transitFile.file);
    return requiredRecord(
      await requestPandadocJson(context, {
        path: `/public/v1/documents/${encodeURIComponent(requiredString(input.document_id, "document_id", invalidInputError))}/attachments`,
        method: "POST",
        body: formData,
        notFoundAsInvalidInput: true,
      }),
      "PandaDoc attachment response",
      providerResponseError,
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, pandadocActionHandlers);

async function listContacts(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Array<Record<string, unknown>>> {
  const payload = await requestPandadocJson(context, {
    path: "/public/v1/contacts",
    query: { email: optionalString(input.email) },
  });
  return listResults(payload);
}

export async function validatePandadocCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  const payload = optionalRecord(
    await requestPandadocJson(
      { apiKey, fetcher },
      {
        path: validationPath,
        query: { page: 1, count: 1 },
        phase: "validate",
      },
    ),
  );
  return {
    profile: { accountId: "pandadoc-api-key", displayName: "PandaDoc API Key", grantedScopes: [] },
    metadata: compactObject({
      apiBaseUrl: pandadocApiBaseUrl,
      validationEndpoint: validationPath,
      templateCount: optionalInteger(payload?.count),
    }),
  };
}

async function requestPandadocJson(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  options: {
    path: string;
    method?: string;
    query?: Record<string, PandadocQueryValue>;
    rawQuery?: string;
    body?: FormData | Record<string, unknown>;
    phase?: PandadocPhase;
    notFoundAsInvalidInput?: boolean;
  },
): Promise<unknown> {
  let response: Response;
  try {
    response = await context.fetcher(buildUrl(options.path, options.query, options.rawQuery), {
      method: options.method ?? "GET",
      headers: buildHeaders(context.apiKey, options.body),
      body:
        options.body instanceof FormData
          ? options.body
          : options.body === undefined
            ? undefined
            : JSON.stringify(options.body),
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `PandaDoc request failed: ${error.message}` : "PandaDoc request failed",
    );
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    throw createPandadocError(response.status, payload, options.phase ?? "execute", options.notFoundAsInvalidInput);
  }
  return payload;
}

function buildUrl(path: string, query: Record<string, PandadocQueryValue> = {}, rawQuery?: string): URL {
  const url = new URL(path, pandadocApiBaseUrl);
  if (rawQuery) {
    url.search = rawQuery;
  }
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url;
}

function buildHeaders(apiKey: string, body: FormData | Record<string, unknown> | undefined): Record<string, string> {
  return compactObject({
    accept: "application/json",
    authorization: `API-Key ${apiKey}`,
    "content-type": body && !(body instanceof FormData) ? "application/json" : undefined,
    "user-agent": providerUserAgent,
  }) as Record<string, string>;
}

async function readPayload(response: Response): Promise<unknown> {
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

function createPandadocError(
  status: number,
  payload: unknown,
  phase: PandadocPhase,
  notFoundAsInvalidInput?: boolean,
): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `PandaDoc request failed with HTTP ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if ((status === 401 || status === 403) && phase === "validate") {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(status, message, payload);
  }
  if ((status === 404 && notFoundAsInvalidInput) || status === 400) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function readErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  return record
    ? (optionalString(record.detail) ?? optionalString(record.message) ?? optionalString(record.error))
    : undefined;
}

function listResults(payload: unknown): Array<Record<string, unknown>> {
  const record = requiredRecord(payload, "PandaDoc list response", providerResponseError);
  if (!Array.isArray(record.results)) {
    throw new ProviderRequestError(502, "PandaDoc list response missing results", payload);
  }
  return record.results.map((item) => requiredRecord(item, "PandaDoc list item", providerResponseError));
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "")
    : undefined;
}

function arrayValue(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function invalidInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function providerResponseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}
