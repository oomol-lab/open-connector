import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { ViggleActionName } from "./actions.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const viggleApiBaseUrl = "https://apis.viggle.ai";

type VigglePhase = "validate" | "execute";
type QueryValue = string | number | undefined;
type FormValue = string | number | boolean | undefined;
type ViggleActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface ViggleRequestInput {
  method: "GET" | "POST" | "DELETE";
  path: string;
  query?: Record<string, QueryValue>;
  json?: Record<string, unknown>;
  form?: Record<string, FormValue>;
  auth?: boolean;
}

export const viggleActionHandlers: Record<ViggleActionName, ViggleActionHandler> = {
  get_credit_balance(_input, context) {
    return getCreditBalance(context, "execute");
  },
  create_character(input, context) {
    return createCharacter(input, context);
  },
  list_characters(input, context) {
    return listCharacters(input, context);
  },
  get_character(input, context) {
    return getCharacter(input, context);
  },
  delete_character(input, context) {
    return deleteCharacter(input, context);
  },
  import_template(input, context) {
    return importTemplate(input, context);
  },
  list_scenes(input, context) {
    return listScenes(input, context);
  },
  get_scene(input, context) {
    return getScene(input, context);
  },
  delete_scene(input, context) {
    return deleteScene(input, context);
  },
  create_render_job(input, context) {
    return createRenderJob(input, context);
  },
  get_render_job_status(input, context) {
    return getRenderJobStatus(input, context);
  },
};

export async function validateViggleCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const balance = await getCreditBalance({ apiKey, fetcher, signal }, "validate");

  return {
    profile: {
      accountId: "viggle",
      displayName: `Viggle ${balance.credit_balance.balance} credits`,
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: viggleApiBaseUrl,
      authMethod: "bearer",
      validationEndpoint: "/api/credits",
      balance: balance.credit_balance.balance,
      updatedAt: balance.credit_balance.updated_at,
    }),
  };
}

async function getCreditBalance(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: VigglePhase,
): Promise<{ credit_balance: Record<string, unknown> }> {
  return {
    credit_balance: requireRecord(
      await requestViggleJson({ method: "GET", path: "/api/credits" }, context, phase),
      "Viggle credit balance",
    ),
  };
}

async function createCharacter(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  return {
    character: requireRecord(
      await requestViggleJson(
        {
          method: "POST",
          path: "/api/characters/preprocess",
          form: compactObject({
            name: requiredString(input.name, "name", badInput),
            image_url: requiredString(input.image_url, "image_url", badInput),
            model: optionalString(input.model),
          }),
        },
        context,
        "execute",
      ),
      "Viggle character",
    ),
  };
}

async function listCharacters(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = requireRecord(
    await requestViggleJson(
      { method: "GET", path: "/api/characters", query: buildPaginationQuery(input) },
      context,
      "execute",
    ),
    "Viggle characters",
  );
  const characters = readRecordArray(payload.characters, "characters");

  return {
    characters,
    total: optionalInteger(payload.total) ?? characters.length,
  };
}

async function getCharacter(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  return {
    character: requireRecord(
      await requestViggleJson(
        {
          method: "GET",
          path: `/api/characters/${encodeURIComponent(requiredString(input.character_id, "character_id", badInput))}`,
        },
        context,
        "execute",
      ),
      "Viggle character",
    ),
  };
}

async function deleteCharacter(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  return requireRecord(
    await requestViggleJson(
      {
        method: "DELETE",
        path: `/api/characters/${encodeURIComponent(requiredString(input.character_id, "character_id", badInput))}`,
      },
      context,
      "execute",
    ),
    "Viggle delete character response",
  );
}

async function importTemplate(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  return {
    scene: requireRecord(
      await requestViggleJson(
        {
          method: "POST",
          path: "/api/scenes/import",
          json: compactObject({
            template_uuid: requiredString(input.template_uuid, "template_uuid", badInput),
            name: optionalString(input.name),
          }),
        },
        context,
        "execute",
      ),
      "Viggle scene",
    ),
  };
}

async function listScenes(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = requireRecord(
    await requestViggleJson(
      { method: "GET", path: "/api/scenes", query: buildPaginationQuery(input) },
      context,
      "execute",
    ),
    "Viggle scenes",
  );
  const scenes = readRecordArray(payload.scenes, "scenes");

  return {
    scenes,
    total: optionalInteger(payload.total) ?? scenes.length,
  };
}

async function getScene(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  return {
    scene: requireRecord(
      await requestViggleJson(
        {
          method: "GET",
          path: `/api/scenes/${encodeURIComponent(requiredString(input.scene_id, "scene_id", badInput))}`,
        },
        context,
        "execute",
      ),
      "Viggle scene",
    ),
  };
}

async function deleteScene(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  return requireRecord(
    await requestViggleJson(
      {
        method: "DELETE",
        path: `/api/scenes/${encodeURIComponent(requiredString(input.scene_id, "scene_id", badInput))}`,
      },
      context,
      "execute",
    ),
    "Viggle delete scene response",
  );
}

async function createRenderJob(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const form = compactObject({
    ref_image_url: optionalString(input.ref_image_url),
    driving_video_url: optionalString(input.driving_video_url),
    character_id: optionalString(input.character_id),
    scene_id: optionalString(input.scene_id),
    model: optionalString(input.model),
    background_mode: optionalString(input.background_mode),
    bg_color: optionalString(input.bg_color),
  });

  validateRenderInput(form);

  return {
    render: requireRecord(
      await requestViggleJson({ method: "POST", path: "/api/render", form }, context, "execute"),
      "Viggle render",
    ),
  };
}

async function getRenderJobStatus(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  return {
    render: requireRecord(
      await requestViggleJson(
        {
          method: "GET",
          path: `/api/render/${encodeURIComponent(requiredString(input.job_id, "job_id", badInput))}`,
          auth: false,
        },
        context,
        "execute",
      ),
      "Viggle render",
    ),
  };
}

async function requestViggleJson(
  request: ViggleRequestInput,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: VigglePhase,
): Promise<unknown> {
  const url = new URL(request.path, viggleApiBaseUrl);
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const headers = new Headers({
    accept: "application/json",
    "user-agent": providerUserAgent,
  });
  if (request.auth !== false) {
    headers.set("authorization", `Bearer ${context.apiKey}`);
  }

  let body: BodyInit | undefined;
  if (request.json) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(request.json);
  } else if (request.form) {
    const formData = new FormData();
    for (const [key, value] of Object.entries(request.form)) {
      if (value !== undefined) {
        formData.set(key, String(value));
      }
    }
    body = formData;
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: request.method,
      headers,
      body,
      signal: context.signal,
    });
    payload = await readJsonPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Viggle request failed: ${error.message}` : "Viggle request failed",
    );
  }

  if (!response.ok) {
    throw buildViggleError(response.status, payload, phase);
  }

  return payload;
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Viggle returned invalid JSON");
  }
}

function buildViggleError(status: number, payload: unknown, phase: VigglePhase): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `Viggle request failed with status ${status || 500}`;
  if (status === 401) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status === 402) {
    return new ProviderRequestError(402, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}

function readErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  const detail = record?.detail;
  if (typeof detail === "string") {
    return detail;
  }
  const detailRecord = optionalRecord(detail);
  return (
    optionalString(detailRecord?.message) ??
    optionalString(detailRecord?.error_code) ??
    optionalString(record?.message) ??
    optionalString(record?.error)
  );
}

function buildPaginationQuery(input: Record<string, unknown>): Record<string, number | undefined> {
  return compactObject({
    limit: optionalInteger(input.limit),
    offset: optionalInteger(input.offset),
  });
}

function validateRenderInput(input: Record<string, FormValue>): void {
  const hasOnDemandInput = Boolean(input.ref_image_url || input.driving_video_url);
  const hasPreprocessedInput = Boolean(input.character_id || input.scene_id);

  if (hasOnDemandInput) {
    requiredString(input.ref_image_url, "ref_image_url", badInput);
    requiredString(input.driving_video_url, "driving_video_url", badInput);
  }
  if (hasPreprocessedInput) {
    requiredString(input.character_id, "character_id", badInput);
    requiredString(input.scene_id, "scene_id", badInput);
  }
  if (!hasOnDemandInput && !hasPreprocessedInput) {
    throw new ProviderRequestError(
      400,
      "create_render_job requires either ref_image_url and driving_video_url, or character_id and scene_id",
    );
  }
  if (input.bg_color && input.background_mode !== "solid") {
    throw new ProviderRequestError(400, "bg_color can only be used when background_mode is solid");
  }
}

function readRecordArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Viggle response missing ${fieldName}`);
  }
  return value.map((item) => requireRecord(item, fieldName));
}

function requireRecord(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${fieldName} must be a JSON object`);
  }
  return record;
}

function badInput(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
