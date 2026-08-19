import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const dynapicturesApiBaseUrl = "https://api.dynapictures.com";
const dynapicturesRequestTimeoutMs = 120_000;
const dynapicturesMaxResponseBytes = 10 * 1024 * 1024;

type DynapicturesRequestPhase = "validate" | "execute";
type DynapicturesActionContext = {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
};
type DynapicturesActionHandler = (
  input: Record<string, unknown>,
  context: DynapicturesActionContext,
) => Promise<unknown>;

export const dynapicturesActionHandlers: ProviderActionHandlers<"dynapictures", DynapicturesActionHandler> = {
  list_templates(_input, context) {
    return listTemplates(context);
  },
  get_template(input, context) {
    return getTemplate(input, context);
  },
  generate_images(input, context) {
    return generateImages(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<DynapicturesActionContext>({
  service: "dynapictures",
  handlers: dynapicturesActionHandlers,
  async createContext(context: ExecutionContext, fetcher): Promise<DynapicturesActionContext> {
    const credential = await requireApiKeyCredential(context, "dynapictures");
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "dynapictures",
  baseUrl: dynapicturesApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("user-agent", providerUserAgent);
  },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestDynapicturesJson(
      {
        apiKey: input.apiKey,
        method: "GET",
        path: "/templates",
        phase: "validate",
        signal,
      },
      fetcher,
    );
    const templates = readObjectArray(payload, "DynaPictures returned an invalid templates list");
    return {
      profile: {
        accountId: `dynapictures:${hashApiKey(input.apiKey)}`,
        displayName: "DynaPictures API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: dynapicturesApiBaseUrl,
        validationEndpoint: "/templates",
        templateCount: templates.length,
      },
    };
  },
};

async function listTemplates(context: DynapicturesActionContext) {
  const payload = await requestDynapicturesJson(
    {
      apiKey: context.apiKey,
      method: "GET",
      path: "/templates",
      phase: "execute",
      signal: context.signal,
    },
    context.fetcher,
  );
  return {
    templates: readObjectArray(payload, "DynaPictures returned an invalid templates list").map(normalizeTemplate),
  };
}

async function getTemplate(input: Record<string, unknown>, context: DynapicturesActionContext) {
  const templateId = readInputString(input.templateId, "templateId");
  const payload = await requestDynapicturesJson(
    {
      apiKey: context.apiKey,
      method: "GET",
      path: `/templates/${encodeURIComponent(templateId)}`,
      phase: "execute",
      signal: context.signal,
    },
    context.fetcher,
  );
  return {
    template: normalizeTemplate(readObject(payload, "DynaPictures returned an invalid template object")),
  };
}

async function generateImages(input: Record<string, unknown>, context: DynapicturesActionContext) {
  validateGenerateImagesInput(input);
  const templateId = readInputString(input.templateId, "templateId");
  const payload = await requestDynapicturesJson(
    {
      apiKey: context.apiKey,
      method: "POST",
      path: `/designs/${encodeURIComponent(templateId)}`,
      phase: "execute",
      body: compactObject({
        format: optionalString(input.format),
        metadata: optionalString(input.metadata),
        params: input.params,
        pages: input.pages,
      }),
      signal: context.signal,
    },
    context.fetcher,
  );

  return normalizeGenerationResult(payload, templateId);
}

async function requestDynapicturesJson(
  input: {
    apiKey: string;
    method: "GET" | "POST";
    path: string;
    phase: DynapicturesRequestPhase;
    body?: unknown;
    signal?: AbortSignal;
  },
  fetcher: typeof fetch,
) {
  const timeout = createProviderTimeout(input.signal, dynapicturesRequestTimeoutMs);
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${input.apiKey}`,
    "user-agent": providerUserAgent,
  });
  let body: string | undefined;
  if (input.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(input.body);
  }

  try {
    const response = await fetcher(new URL(input.path, dynapicturesApiBaseUrl), {
      method: input.method,
      headers,
      body,
      signal: timeout.signal,
    });
    const payload = await readDynapicturesPayload(response);
    if (!response.ok) {
      throw mapDynapicturesError(response, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "DynaPictures request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `DynaPictures request failed: ${error.message}` : "DynaPictures request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readDynapicturesPayload(response: Response) {
  const text = await readProviderTextBody(response, "DynaPictures response", dynapicturesMaxResponseBytes);
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) {
      return { message: text };
    }
    throw new ProviderRequestError(502, "DynaPictures returned invalid JSON");
  }
}

function mapDynapicturesError(response: Response, payload: unknown, phase: DynapicturesRequestPhase) {
  const message = readErrorMessage(payload) ?? `DynaPictures request failed with HTTP ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(response.status, message);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status || 502, message);
}

function normalizeTemplate(payload: Record<string, unknown>) {
  const layers = payload.layers;
  if (!Array.isArray(layers)) {
    throw new ProviderRequestError(502, "DynaPictures template response did not include layers");
  }
  return {
    id: readResponseString(payload.id, "template id"),
    name: readResponseString(payload.name, "template name"),
    thumbnail: readResponseString(payload.thumbnail, "template thumbnail"),
    dateCreated: readResponseString(payload.dateCreated, "template dateCreated"),
    dateUpdated: readResponseString(payload.dateUpdated, "template dateUpdated"),
    layers,
    raw: payload,
  };
}

function normalizeGenerationResult(payload: unknown, requestedTemplateId: string) {
  const record = readObject(payload, "DynaPictures returned an invalid generation result");
  if (Array.isArray(record.pages)) {
    return {
      templateId: optionalString(record.templateId) ?? requestedTemplateId,
      templateName: optionalString(record.templateName) ?? null,
      images: record.pages.map((page) =>
        normalizeGeneratedImage(readObject(page, "DynaPictures returned an invalid generated page")),
      ),
      raw: record,
    };
  }

  return {
    templateId: optionalString(record.templateId) ?? optionalString(record.templateUid) ?? requestedTemplateId,
    templateName: null,
    images: [normalizeGeneratedImage(record)],
    raw: record,
  };
}

function normalizeGeneratedImage(payload: Record<string, unknown>) {
  return {
    id: readResponseString(payload.id, "generated image id"),
    imageUrl: readResponseString(payload.imageUrl, "generated imageUrl"),
    thumbnailUrl: readResponseString(payload.thumbnailUrl, "generated thumbnailUrl"),
    retinaThumbnailUrl: optionalString(payload.retinaThumbnailUrl) ?? null,
    metadata: optionalString(payload.metadata) ?? null,
    width: readResponseInteger(payload.width, "generated image width"),
    height: readResponseInteger(payload.height, "generated image height"),
    pageIndex: readOptionalResponseInteger(payload.pageIndex, "generated pageIndex"),
    raw: payload,
  };
}

function validateGenerateImagesInput(input: Record<string, unknown>): void {
  if (input.params !== undefined && input.pages !== undefined) {
    throw new ProviderRequestError(400, "params and pages cannot be used together");
  }
  if (Array.isArray(input.params)) {
    input.params.forEach(validateLayerOverride);
  }
  if (Array.isArray(input.pages)) {
    for (const page of input.pages) {
      const record = optionalRecord(page);
      if (Array.isArray(record?.layers)) {
        record.layers.forEach(validateLayerOverride);
      }
    }
  }
}

function validateLayerOverride(value: unknown): void {
  const layer = optionalRecord(value);
  if (!layer) {
    return;
  }
  const referenceCount = Array.isArray(layer.referenceImages) ? layer.referenceImages.length : 0;
  const sourceCount = typeof layer.sourceImage === "string" ? 1 : 0;
  if (referenceCount + sourceCount > 6) {
    throw new ProviderRequestError(400, "sourceImage and referenceImages may contain at most 6 images in total");
  }
}

function readObject(value: unknown, message: string) {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, message);
  }
  return record;
}

function readObjectArray(value: unknown, message: string) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, message);
  }
  return value.map((item) => readObject(item, message));
}

function readInputString(value: unknown, fieldName: string) {
  const text = optionalString(value)?.trim();
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function readResponseString(value: unknown, fieldName: string) {
  const text = optionalString(value);
  if (text === undefined) {
    throw new ProviderRequestError(502, `DynaPictures response did not include ${fieldName}`);
  }
  return text;
}

function readResponseInteger(value: unknown, fieldName: string) {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isInteger(parsed)) {
    throw new ProviderRequestError(502, `DynaPictures response included an invalid ${fieldName}`);
  }
  return parsed;
}

function readOptionalResponseInteger(value: unknown, fieldName: string) {
  if (value === undefined || value === null) {
    return null;
  }
  return readResponseInteger(value, fieldName);
}

function readErrorMessage(payload: unknown) {
  if (typeof payload === "string") {
    return payload;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  const direct = optionalString(record.message) ?? optionalString(record.error);
  if (direct) {
    return direct;
  }
  if (Array.isArray(record.errors)) {
    return record.errors.map(String).join(", ");
  }
  return undefined;
}

function hashApiKey(apiKey: string) {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
}
