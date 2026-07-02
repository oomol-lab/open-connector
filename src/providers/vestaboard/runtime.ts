import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { VestaboardActionName } from "./actions.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { jsonObject } from "../../core/request.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const vestaboardCloudApiBaseUrl = "https://cloud.vestaboard.com";
const vestaboardTransitionPath = "/transition";

type VestaboardRequestPhase = "validate" | "execute";
type VestaboardTransition = "classic" | "wave" | "drift" | "curtain";
type VestaboardTransitionSpeed = "gentle" | "fast";
type VestaboardActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface VestaboardRequestInput {
  path: string;
  method: "GET" | "POST" | "PUT";
  apiKey: string;
  fetcher: ProviderFetch;
  phase: VestaboardRequestPhase;
  body?: unknown;
  signal?: AbortSignal;
}

export const vestaboardActionHandlers: Record<VestaboardActionName, VestaboardActionHandler> = {
  async get_current_message(_input, context) {
    const payload = await requestVestaboardJson({
      path: "/",
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
    });

    return {
      currentMessage: normalizeCurrentMessagePayload(optionalRecord(payload)?.currentMessage),
    };
  },
  async send_message(input, context) {
    const body = "text" in input ? buildTextMessageBody(input) : buildCharacterMessageBody(input);
    const payload = await requestVestaboardJson({
      path: "/",
      method: "POST",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      body,
      signal: context.signal,
    });

    return normalizeMessageWritePayload(payload);
  },
  async get_transition(_input, context) {
    const payload = await requestVestaboardJson({
      path: vestaboardTransitionPath,
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
    });

    return normalizeTransitionPayload(payload);
  },
  async set_transition(input, context) {
    const payload = await requestVestaboardJson({
      path: vestaboardTransitionPath,
      method: "PUT",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      body: {
        transition: input.transition,
        transitionSpeed: input.transitionSpeed,
      },
      signal: context.signal,
    });

    return normalizeTransitionPayload(payload);
  },
};

export async function validateVestaboardCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestVestaboardJson({
    path: "/",
    method: "GET",
    apiKey,
    fetcher,
    phase: "validate",
    signal,
  });
  const currentMessage = normalizeCurrentMessagePayload(optionalRecord(payload)?.currentMessage);

  return {
    profile: {
      accountId: currentMessage.id,
      displayName: "Vestaboard API Token",
    },
    grantedScopes: [],
    metadata: {
      validationEndpoint: "/",
      apiBaseUrl: vestaboardCloudApiBaseUrl,
      rows: currentMessage.rows,
      columns: currentMessage.columns,
      currentMessageId: currentMessage.id,
    },
  };
}

async function requestVestaboardJson(input: VestaboardRequestInput): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await vestaboardFetch(input);
    payload = await readVestaboardPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Vestaboard request failed: ${error.message}` : "Vestaboard request failed",
    );
  }

  if (!response.ok) {
    throw createVestaboardError(response.status, payload, input.phase);
  }
  return payload;
}

async function vestaboardFetch(input: VestaboardRequestInput): Promise<Response> {
  const url = new URL(input.path, vestaboardCloudApiBaseUrl);
  return input.fetcher(url.toString(), {
    method: input.method,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": providerUserAgent,
      "x-vestaboard-token": input.apiKey,
    },
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    signal: input.signal,
  });
}

async function readVestaboardPayload(response: Response): Promise<unknown> {
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

function createVestaboardError(status: number, payload: unknown, phase: VestaboardRequestPhase): ProviderRequestError {
  const message = extractVestaboardErrorMessage(payload, status);
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message, payload);
  }

  return new ProviderRequestError(
    status >= 400 && status < 600 ? status : 502,
    phase === "validate" ? `Vestaboard validation failed: ${message}` : message,
    payload,
  );
}

function extractVestaboardErrorMessage(payload: unknown, status: number): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  return (
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    optionalString(record?.status) ??
    `Vestaboard request failed with ${status}`
  );
}

function buildTextMessageBody(input: Record<string, unknown>): Record<string, unknown> {
  return jsonObject({
    text: input.text,
    forced: input.forced,
  });
}

function buildCharacterMessageBody(input: Record<string, unknown>): Record<string, unknown> {
  return jsonObject({
    characters: input.characters,
    forced: input.forced,
  });
}

function normalizeCurrentMessagePayload(value: unknown): {
  id: string;
  layout: string;
  characters: number[][];
  rows: number;
  columns: number;
} {
  const record = requireRecord(value, "Vestaboard current message");
  const layout = optionalString(record.layout);
  const id = optionalString(record.id);
  if (!layout || !id) {
    throw new ProviderRequestError(502, "Vestaboard current message response did not include id and layout");
  }

  const characters = parseVestaboardLayout(layout);
  return {
    id,
    layout,
    characters,
    rows: characters.length,
    columns: characters[0]?.length ?? 0,
  };
}

function normalizeMessageWritePayload(value: unknown): Record<string, unknown> {
  const record = requireRecord(value, "Vestaboard message response");
  const status = optionalString(record.status);
  const id = optionalString(record.id);
  const created = typeof record.created === "number" ? record.created : undefined;
  if (!status || !id || created === undefined) {
    throw new ProviderRequestError(502, "Vestaboard message response did not include status, id, and created");
  }

  return { status, id, created };
}

function normalizeTransitionPayload(value: unknown): Record<string, unknown> {
  const record = requireRecord(value, "Vestaboard transition response");
  const transition = optionalString(record.transition);
  const transitionSpeed = optionalString(record.transitionSpeed);
  if (!isVestaboardTransition(transition) || !isVestaboardTransitionSpeed(transitionSpeed)) {
    throw new ProviderRequestError(502, "Vestaboard transition response did not include valid transition settings");
  }

  return { transition, transitionSpeed };
}

function parseVestaboardLayout(layout: string): number[][] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(layout) as unknown;
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `Vestaboard layout was not valid JSON: ${error.message}`
        : "Vestaboard layout was not valid JSON",
    );
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new ProviderRequestError(502, "Vestaboard layout was not a non-empty grid");
  }

  const rows = parsed.map((row, rowIndex) => {
    if (!Array.isArray(row) || row.length === 0) {
      throw new ProviderRequestError(502, `Vestaboard layout row ${rowIndex} was not a non-empty array`);
    }

    return row.map((cell, columnIndex) => {
      if (!Number.isInteger(cell) || Number(cell) < 0) {
        throw new ProviderRequestError(
          502,
          `Vestaboard layout cell ${rowIndex}:${columnIndex} was not a valid character code`,
        );
      }
      return Number(cell);
    });
  });

  const columnCount = rows[0]?.length ?? 0;
  if (!rows.every((row) => row.length === columnCount)) {
    throw new ProviderRequestError(502, "Vestaboard layout rows had mixed widths");
  }

  return rows;
}

function isVestaboardTransition(value: string | undefined): value is VestaboardTransition {
  return value === "classic" || value === "wave" || value === "drift" || value === "curtain";
}

function isVestaboardTransitionSpeed(value: string | undefined): value is VestaboardTransitionSpeed {
  return value === "gentle" || value === "fast";
}

function requireRecord(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${fieldName} must be a JSON object`);
  }
  return record;
}
