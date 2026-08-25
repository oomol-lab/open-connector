import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { Validator } from "@cfworker/json-schema";
import { Buffer } from "node:buffer";
import { objectArray, optionalRawString, optionalRecord, requiredRecord, requiredString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
} from "../provider-runtime.ts";

const service = "passslot";
const passslotApiBaseUrl = "https://api.passslot.com/v1";
const passslotUriValidator = new Validator({ type: "string", format: "uri" }, "2020-12");

type PassslotRequestPhase = "validate" | "execute";
type PassslotActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface PassslotRequestInput {
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  phase?: PassslotRequestPhase;
  allowEmpty?: boolean;
}

type PassslotRequestContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;

const emptyPassslotResponse = Symbol("empty PassSlot response");

export const passslotActionHandlers: ProviderActionHandlers<"passslot", PassslotActionHandler> = {
  async list_templates(_input, context) {
    return {
      templates: (await requestPassslotArray({ path: "/templates" }, context)).map(validatePassslotTemplate),
    };
  },
  async list_pass_types(_input, context) {
    return {
      passTypes: (await requestPassslotArray({ path: "/passtypes" }, context)).map(validatePassslotPassType),
    };
  },
  async list_passes(input, context) {
    const passTypeIdentifier = optionalRawString(input.passTypeIdentifier);
    return {
      passes: (
        await requestPassslotArray(
          { path: passTypeIdentifier ? `/passes/${encodeURIComponent(passTypeIdentifier)}` : "/passes" },
          context,
        )
      ).map(validatePassslotPassReference),
    };
  },
  async create_pass_from_template(input, context) {
    return {
      pass: validatePassslotCreatedPass(
        await requestPassslotObject(
          {
            path: `/templates/${input.templateId}/pass`,
            method: "POST",
            body: optionalRecord(input.values) ?? {},
          },
          context,
        ),
      ),
    };
  },
  async get_pass_url(input, context) {
    const response = await requestPassslotObject({ path: `${buildPassPath(input)}/url` }, context);
    return { url: validatePassslotUrl(response.url, "pass URL", response) };
  },
  async get_pass_values(input, context) {
    return {
      values: await requestPassslotObject({ path: `${buildPassPath(input)}/values` }, context),
    };
  },
  async update_pass_values(input, context) {
    return {
      values: await requestPassslotObject(
        {
          path: `${buildPassPath(input)}/values`,
          method: "PUT",
          body: optionalRecord(input.values),
        },
        context,
      ),
    };
  },
  async delete_pass(input, context) {
    const passTypeIdentifier = requirePassslotIdentifier(input.passTypeIdentifier);
    const serialNumber = requirePassslotIdentifier(input.serialNumber);
    await requestPassslotJson(
      {
        path: `/passes/${encodeURIComponent(passTypeIdentifier)}/${encodeURIComponent(serialNumber)}`,
        method: "DELETE",
        allowEmpty: true,
      },
      context,
    );
    return { deleted: true, passTypeIdentifier, serialNumber };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, passslotActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: passslotApiBaseUrl,
  auth: { type: "api_key_basic", suffix: ":" },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const templates = await requestPassslotArray(
      { path: "/templates", phase: "validate" },
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
    );

    return {
      profile: {
        displayName: "PassSlot App Key",
        grantedScopes: [],
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: passslotApiBaseUrl,
        validationEndpoint: "/templates",
        templateCount: templates.length,
      },
    };
  },
};

function buildPassPath(input: Record<string, unknown>): string {
  const passTypeIdentifier = requirePassslotIdentifier(input.passTypeIdentifier);
  const serialNumber = requirePassslotIdentifier(input.serialNumber);
  return `/passes/${encodeURIComponent(passTypeIdentifier)}/${encodeURIComponent(serialNumber)}`;
}

function requirePassslotIdentifier(value: unknown): string {
  const identifier = optionalRawString(value);
  if (!identifier) {
    throw new ProviderRequestError(400, "non-empty string input is required");
  }
  return identifier;
}

async function requestPassslotArray(
  input: PassslotRequestInput,
  context: PassslotRequestContext,
): Promise<Array<Record<string, unknown>>> {
  const payload = await requestPassslotJson(input, context);
  return objectArray(payload, "PassSlot response", providerResponseError);
}

async function requestPassslotObject(
  input: PassslotRequestInput,
  context: PassslotRequestContext,
): Promise<Record<string, unknown>> {
  const payload = await requestPassslotJson(input, context);
  const object = optionalRecord(payload);
  if (!object) {
    throw new ProviderRequestError(502, "PassSlot returned a non-object response");
  }
  return object;
}

async function requestPassslotJson(input: PassslotRequestInput, context: PassslotRequestContext): Promise<unknown> {
  const response = await context.fetcher(`${passslotApiBaseUrl}${input.path}`, {
    method: input.method ?? "GET",
    headers: {
      accept: "application/json",
      authorization: `Basic ${Buffer.from(`${context.apiKey}:`).toString("base64")}`,
      "user-agent": providerUserAgent,
      ...(input.body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    signal: context.signal,
  });

  const payload = await readProviderJsonBody(response, {
    emptyBody: emptyPassslotResponse,
    invalidJsonMessage: "PassSlot returned invalid JSON",
    invalidJsonFallback: (text) => (response.ok ? undefined : text),
  });
  if (!response.ok) {
    throw mapPassslotError(response, payload, input.phase ?? "execute");
  }
  if (payload === emptyPassslotResponse) {
    if (input.allowEmpty) {
      return undefined;
    }
    throw new ProviderRequestError(502, "PassSlot returned an empty response");
  }
  return payload;
}

function mapPassslotError(response: Response, payload: unknown, phase: PassslotRequestPhase): ProviderRequestError {
  const message = extractPassslotErrorMessage(payload) || response.statusText || "PassSlot request failed";
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(401, message, payload);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(
    response.status >= 500 ? response.status : 502,
    message,
    response.status >= 500 ? payload : { providerStatus: response.status, payload },
  );
}

function extractPassslotErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return optionalRawString(payload);
  }
  const record = optionalRecord(payload);
  return optionalRawString(record?.message) ?? optionalRawString(record?.error);
}

function validatePassslotTemplate(template: Record<string, unknown>): Record<string, unknown> {
  if (typeof template.id !== "number" || !Number.isInteger(template.id) || template.id < 1) {
    throw new ProviderRequestError(502, "PassSlot template.id must be a positive integer", template);
  }
  requiredString(template.name, "PassSlot template.name", providerResponseError);
  if (
    typeof template.formatVersion !== "number" ||
    !Number.isInteger(template.formatVersion) ||
    template.formatVersion < 1
  ) {
    throw new ProviderRequestError(502, "PassSlot template.formatVersion must be a positive integer", template);
  }
  requiredString(template.passType, "PassSlot template.passType", providerResponseError);
  requiredRecord(template.description, "PassSlot template.description", providerResponseError);
  if (!Array.isArray(template.placeholder)) {
    throw providerResponseError("PassSlot template.placeholder must be an array");
  }
  for (const placeholder of template.placeholder) {
    requiredString(placeholder, "PassSlot template.placeholder item", providerResponseError);
  }
  return template;
}

function validatePassslotPassType(passType: Record<string, unknown>): Record<string, unknown> {
  requiredString(passType.id, "PassSlot pass type.id", providerResponseError);
  requiredString(passType.organizationName, "PassSlot pass type.organizationName", providerResponseError);
  requiredString(passType.teamIdentifier, "PassSlot pass type.teamIdentifier", providerResponseError);
  if (typeof passType.certificateExpirationDate !== "string") {
    throw new ProviderRequestError(502, "PassSlot pass type.certificateExpirationDate must be a string", passType);
  }
  return passType;
}

function validatePassslotPassReference(pass: Record<string, unknown>): Record<string, unknown> {
  requiredString(pass.serialNumber, "PassSlot pass.serialNumber", providerResponseError);
  requiredString(pass.passType, "PassSlot pass.passType", providerResponseError);
  return pass;
}

function validatePassslotCreatedPass(pass: Record<string, unknown>): Record<string, unknown> {
  requiredString(pass.serialNumber, "PassSlot created pass.serialNumber", providerResponseError);
  requiredString(pass.passTypeIdentifier, "PassSlot created pass.passTypeIdentifier", providerResponseError);
  validatePassslotUrl(pass.url, "created pass.url", pass);
  return pass;
}

function validatePassslotUrl(value: unknown, field: string, payload: unknown): string {
  if (typeof value !== "string" || !passslotUriValidator.validate(value).valid) {
    throw new ProviderRequestError(502, `PassSlot ${field} must be a valid URL`, payload);
  }
  return value;
}

function providerResponseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}
