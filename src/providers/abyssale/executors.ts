import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  recordOrEmpty,
  requiredString,
} from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
  requiredInputString,
} from "../provider-runtime.ts";

const service = "abyssale";
const abyssaleApiBaseUrl = "https://api.abyssale.com";

type AbyssaleRequestPhase = "validate" | "execute";

interface AbyssaleActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type AbyssaleActionHandler = (input: Record<string, unknown>, context: AbyssaleActionContext) => Promise<unknown>;

export const abyssaleActionHandlers: ProviderActionHandlers<"abyssale", AbyssaleActionHandler> = {
  list_designs(_input, context) {
    return listDesigns(context);
  },
  get_design(input, context) {
    return getDesign(input, context);
  },
  get_design_format(input, context) {
    return getDesignFormat(input, context);
  },
  list_fonts(_input, context) {
    return listFonts(context);
  },
  list_projects(_input, context) {
    return listProjects(context);
  },
  create_project(input, context) {
    return createProject(input, context);
  },
  generate_banner(input, context) {
    return generateBanner(input, context);
  },
  get_banner(input, context) {
    return getBanner(input, context);
  },
  create_dynamic_image_url(input, context) {
    return createDynamicImageUrl(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<AbyssaleActionContext>({
  service,
  handlers: abyssaleActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<AbyssaleActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context: AbyssaleActionContext = {
      apiKey: input.apiKey,
      fetcher,
      signal,
    };
    const payload = await requestAbyssaleJson(
      {
        method: "GET",
        path: "/projects",
        apiKey: input.apiKey,
      },
      context,
      "validate",
    );

    return {
      profile: {
        accountId: "api_key",
        displayName: "Abyssale API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: abyssaleApiBaseUrl,
        validationEndpoint: "/projects",
        projectCount: Array.isArray(payload) ? payload.length : undefined,
      }),
    };
  },
};

async function listDesigns(context: AbyssaleActionContext): Promise<unknown> {
  const payload = await requestAbyssaleJson(
    { method: "GET", path: "/designs", apiKey: context.apiKey },
    context,
    "execute",
  );
  const designs = readObjectArray(payload, "Abyssale returned invalid designs payload");
  return {
    designs: designs.map(normalizeDesign),
    raw: designs,
  };
}

async function getDesign(input: Record<string, unknown>, context: AbyssaleActionContext): Promise<unknown> {
  const payload = await requestAbyssaleJson(
    {
      method: "GET",
      path: `/designs/${encodeURIComponent(requiredInputString(input.designId, "designId"))}`,
      apiKey: context.apiKey,
    },
    context,
    "execute",
  );
  const object = readObject(payload, "Abyssale returned invalid design payload");
  return {
    design: normalizeDesign(object),
    formats: readOptionalObjectArray(object.formats),
    elements: readOptionalObjectArray(object.elements),
    variables: recordOrEmpty(object.variables),
    raw: object,
  };
}

async function getDesignFormat(input: Record<string, unknown>, context: AbyssaleActionContext): Promise<unknown> {
  const payload = await requestAbyssaleJson(
    {
      method: "GET",
      path: `/designs/${encodeURIComponent(requiredInputString(input.designId, "designId"))}/formats/${encodeURIComponent(
        requiredInputString(input.formatSpecifier, "formatSpecifier"),
      )}`,
      apiKey: context.apiKey,
    },
    context,
    "execute",
  );
  const object = readObject(payload, "Abyssale returned invalid design format payload");
  return {
    format: normalizeFormat(object),
    elements: readOptionalObjectArray(object.elements),
    variables: recordOrEmpty(object.variables),
    raw: object,
  };
}

async function listFonts(context: AbyssaleActionContext): Promise<unknown> {
  const payload = await requestAbyssaleJson(
    { method: "GET", path: "/fonts", apiKey: context.apiKey },
    context,
    "execute",
  );
  const fonts = readObjectArray(payload, "Abyssale returned invalid fonts payload");
  return {
    fonts: fonts.map(normalizeFont),
    raw: fonts,
  };
}

async function listProjects(context: AbyssaleActionContext): Promise<unknown> {
  const payload = await requestAbyssaleJson(
    { method: "GET", path: "/projects", apiKey: context.apiKey },
    context,
    "execute",
  );
  const projects = readObjectArray(payload, "Abyssale returned invalid projects payload");
  return {
    projects: projects.map(normalizeProject),
    raw: projects,
  };
}

async function createProject(input: Record<string, unknown>, context: AbyssaleActionContext): Promise<unknown> {
  const payload = await requestAbyssaleJson(
    {
      method: "POST",
      path: "/projects",
      apiKey: context.apiKey,
      body: {
        name: requiredInputString(input.name, "name"),
      },
    },
    context,
    "execute",
  );
  const object = readObject(payload, "Abyssale returned invalid project payload");
  return {
    project: normalizeProject(object),
    raw: object,
  };
}

async function generateBanner(input: Record<string, unknown>, context: AbyssaleActionContext): Promise<unknown> {
  const payload = await requestAbyssaleJson(
    {
      method: "POST",
      path: `/banner-builder/${encodeURIComponent(requiredInputString(input.designId, "designId"))}/generate`,
      apiKey: context.apiKey,
      body: compactObject({
        elements: optionalRecord(input.elements) ?? {},
        template_format_name: optionalString(input.templateFormatName),
        file_compression_level: optionalInteger(input.fileCompressionLevel),
      }),
    },
    context,
    "execute",
  );
  const object = readObject(payload, "Abyssale returned invalid banner payload");
  return {
    banner: normalizeBanner(object),
    raw: object,
  };
}

async function getBanner(input: Record<string, unknown>, context: AbyssaleActionContext): Promise<unknown> {
  const payload = await requestAbyssaleJson(
    {
      method: "GET",
      path: `/banners/${encodeURIComponent(requiredInputString(input.bannerId, "bannerId"))}`,
      apiKey: context.apiKey,
    },
    context,
    "execute",
  );
  const object = readObject(payload, "Abyssale returned invalid banner payload");
  return {
    banner: normalizeBanner(object),
    raw: object,
  };
}

async function createDynamicImageUrl(input: Record<string, unknown>, context: AbyssaleActionContext): Promise<unknown> {
  const payload = await requestAbyssaleJson(
    {
      method: "POST",
      path: `/designs/${encodeURIComponent(requiredInputString(input.designId, "designId"))}/dynamic-image-url`,
      apiKey: context.apiKey,
      body: compactObject({
        enable_rate_limit: optionalBoolean(input.enableRateLimit),
        enable_production_mode: optionalBoolean(input.enableProductionMode),
      }),
    },
    context,
    "execute",
  );
  const object = readObject(payload, "Abyssale returned invalid dynamic image payload");
  return {
    id: optionalString(object.id) ?? optionalString(object.uid) ?? null,
    url:
      optionalString(object.url) ??
      optionalString(object.dynamic_image_url) ??
      optionalString(object.dynamicImageUrl) ??
      null,
    raw: object,
  };
}

async function requestAbyssaleJson(
  input: {
    method: "GET" | "POST";
    path: string;
    apiKey: string;
    body?: Record<string, unknown>;
  },
  context: AbyssaleActionContext,
  phase: AbyssaleRequestPhase,
): Promise<unknown> {
  const url = new URL(input.path, abyssaleApiBaseUrl);
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: input.method,
      headers: abyssaleHeaders(input.apiKey, input.body ? "write" : "read"),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: context.signal,
    });
    payload = await readAbyssalePayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Abyssale request failed: ${error.message}` : "Abyssale request failed",
    );
  }

  if (!response.ok) {
    throw createAbyssaleError(response, payload, phase);
  }

  return payload;
}

function abyssaleHeaders(apiKey: string, mode: "read" | "write"): Record<string, string> {
  return {
    "x-api-key": apiKey,
    accept: "application/json",
    "user-agent": providerUserAgent,
    ...(mode === "write" ? { "content-type": "application/json" } : {}),
  };
}

async function readAbyssalePayload(response: Response): Promise<unknown> {
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

function createAbyssaleError(response: Response, payload: unknown, phase: AbyssaleRequestPhase): ProviderRequestError {
  const message = extractAbyssaleErrorMessage(payload) ?? response.statusText ?? "Abyssale request failed";
  const isAuthFailure = response.status === 401 || response.status === 403;
  const status = phase === "validate" && isAuthFailure ? 401 : response.status;
  return new ProviderRequestError(status, message, payload);
}

function extractAbyssaleErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.detail) ??
    optionalString(record.title)
  );
}

function normalizeDesign(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: optionalString(input.id) ?? null,
    name: optionalString(input.name) ?? null,
    type: readDesignType(input.type),
    previewUrl: optionalString(input.preview_url) ?? optionalString(input.previewUrl) ?? null,
    createdAt: optionalInteger(input.created_at_ts) ?? null,
    updatedAt: optionalInteger(input.updated_at_ts) ?? null,
    raw: input,
  };
}

function normalizeProject(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: optionalString(input.id) ?? null,
    name: optionalString(input.name) ?? null,
    createdAt: optionalInteger(input.created_at_ts) ?? null,
    raw: input,
  };
}

function normalizeFont(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: optionalString(input.id) ?? optionalString(input.uid) ?? null,
    name: optionalString(input.name) ?? null,
    family: optionalString(input.family) ?? optionalString(input.font_family) ?? null,
    raw: input,
  };
}

function normalizeFormat(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: optionalString(input.id) ?? null,
    uid: optionalString(input.uid) ?? null,
    width: optionalInteger(input.width) ?? null,
    height: optionalInteger(input.height) ?? null,
    unit: optionalString(input.unit) ?? null,
    previewUrl: optionalString(input.preview_url) ?? optionalString(input.previewUrl) ?? null,
    dynamicImageUrl: optionalString(input.dynamic_image_url) ?? optionalString(input.dynamicImageUrl) ?? null,
    raw: input,
  };
}

function normalizeBanner(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: optionalString(input.id) ?? optionalString(input.uid) ?? null,
    url: optionalString(input.url) ?? optionalString(input.file_url) ?? null,
    fileType: optionalString(input.file_type) ?? optionalString(input.mime_type) ?? null,
    createdAt: optionalInteger(input.created_at_ts) ?? null,
    raw: input,
  };
}

function readDesignType(value: unknown): string | null {
  const text = optionalString(value);
  if (text === "static" || text === "animated" || text === "printer" || text === "printer_multipage") {
    return text;
  }
  return null;
}

function readObject(value: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, message);
  }
  return record;
}

function readObjectArray(value: unknown, message: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, message);
  }
  return value.map((item) => readObject(item, message));
}

function readOptionalObjectArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item) => optionalRecord(item)) as Record<string, unknown>[];
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.abyssale.com",
  auth: { type: "api_key_header", name: "x-api-key" },
});
