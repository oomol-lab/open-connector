import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const textitApiBaseUrl = "https://textit.com/api/v2";

type TextitResource = "broadcasts" | "contacts" | "groups" | "messages";
type TextitActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const textitActionHandlers: ProviderActionHandlers<"textit", TextitActionHandler> = {
  async get_workspace(_input, context) {
    const workspace = await requestTextitJson({
      path: "/workspace.json",
      method: "GET",
      context,
    });

    return {
      workspace,
      raw: workspace,
    };
  },
  async list_contacts(input, context) {
    const payload = await requestTextitJson({
      path: "/contacts.json",
      method: "GET",
      context,
      query: compactObject({
        uuid: input.uuid,
        urn: input.urn,
        group: input.group,
        before: input.before,
        after: input.after,
        cursor: input.cursor,
      }),
    });

    return normalizeTextitPage(payload, "contacts");
  },
  async create_contact(input, context) {
    const contact = await requestTextitJson({
      path: "/contacts.json",
      method: "POST",
      context,
      body: compactObject({
        name: input.name,
        language: input.language,
        urns: input.urns,
        groups: input.groups,
        fields: input.fields,
      }),
    });

    return {
      contact,
      raw: contact,
    };
  },
  async update_contact(input, context) {
    validateContactMutation(input);
    const contact = await requestTextitJson({
      path: "/contacts.json",
      method: "POST",
      context,
      query: readTargetQuery(input),
      body: compactObject({
        name: input.name,
        language: input.language,
        urns: input.urns,
        groups: input.groups,
        fields: input.fields,
      }),
    });

    return {
      contact,
      raw: contact,
    };
  },
  async delete_contact(input, context) {
    validateContactTarget(input);
    await requestTextitJson({
      path: "/contacts.json",
      method: "DELETE",
      context,
      query: readTargetQuery(input),
    });

    return { deleted: true };
  },
  async list_groups(input, context) {
    const payload = await requestTextitJson({
      path: "/groups.json",
      method: "GET",
      context,
      query: compactObject({
        uuid: input.uuid,
        name: input.name,
        manual_only: input.manualOnly === true ? "1" : undefined,
        cursor: input.cursor,
      }),
    });

    return normalizeTextitPage(payload, "groups");
  },
  async create_group(input, context) {
    const group = await requestTextitJson({
      path: "/groups.json",
      method: "POST",
      context,
      body: { name: input.name },
    });

    return {
      group,
      raw: group,
    };
  },
  async update_group(input, context) {
    const group = await requestTextitJson({
      path: "/groups.json",
      method: "POST",
      context,
      query: { uuid: input.uuid },
      body: { name: input.name },
    });

    return {
      group,
      raw: group,
    };
  },
  async delete_group(input, context) {
    await requestTextitJson({
      path: "/groups.json",
      method: "DELETE",
      context,
      query: { uuid: input.uuid },
    });

    return { deleted: true };
  },
  async list_messages(input, context) {
    const payload = await requestTextitJson({
      path: "/messages.json",
      method: "GET",
      context,
      query: compactObject({
        uuid: input.uuid,
        folder: input.folder,
        before: input.before,
        after: input.after,
        cursor: input.cursor,
      }),
    });

    return normalizeTextitPage(payload, "messages");
  },
  async send_message(input, context) {
    const message = await requestTextitJson({
      path: "/messages.json",
      method: "POST",
      context,
      body: compactObject({
        contact: input.contact,
        text: input.text,
        attachments: input.attachments,
        quick_replies: input.quick_replies,
      }),
    });

    return {
      message,
      raw: message,
    };
  },
  async list_broadcasts(input, context) {
    const payload = await requestTextitJson({
      path: "/broadcasts.json",
      method: "GET",
      context,
      query: compactObject({
        uuid: input.uuid,
        before: input.before,
        after: input.after,
        cursor: input.cursor,
      }),
    });

    return normalizeTextitPage(payload, "broadcasts");
  },
  async send_broadcast(input, context) {
    validateBroadcastTarget(input);
    const broadcast = await requestTextitJson({
      path: "/broadcasts.json",
      method: "POST",
      context,
      body: compactObject({
        urns: input.urns,
        contacts: input.contacts,
        groups: input.groups,
        text: input.text,
        attachments: input.attachments,
        quick_replies: input.quick_replies,
        base_language: input.base_language,
      }),
    });

    return {
      broadcast,
      raw: broadcast,
    };
  },
};

export async function validateTextitApiKey(input: {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const workspace = await requestTextitJson({
    path: "/workspace.json",
    method: "GET",
    context: input,
  });
  const workspaceRecord = requireRecord(workspace, "TextIt returned an invalid workspace response");
  const workspaceName =
    typeof workspaceRecord.name === "string" && workspaceRecord.name.trim() ? workspaceRecord.name : "TextIt API Token";

  return {
    profile: {
      accountId: typeof workspaceRecord.uuid === "string" && workspaceRecord.uuid ? workspaceRecord.uuid : "textit",
      displayName: workspaceName,
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: textitApiBaseUrl,
      validationEndpoint: "/workspace.json",
      workspaceUuid: typeof workspaceRecord.uuid === "string" ? workspaceRecord.uuid : undefined,
      country: typeof workspaceRecord.country === "string" ? workspaceRecord.country : undefined,
      timezone: typeof workspaceRecord.timezone === "string" ? workspaceRecord.timezone : undefined,
    },
  };
}

async function requestTextitJson(input: {
  path: string;
  method: "DELETE" | "GET" | "POST";
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  query?: Record<string, unknown>;
  body?: unknown;
}): Promise<unknown> {
  const url = new URL(`${textitApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    appendQueryValue(url, key, value);
  }

  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Token ${input.context.apiKey}`,
    "user-agent": providerUserAgent,
  };
  const body = input.body === undefined ? undefined : JSON.stringify(input.body);
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }

  let response: Response;
  try {
    response = await input.context.fetcher(url.toString(), {
      method: input.method,
      headers,
      body,
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `TextIt request failed: ${error.message}` : "TextIt request failed",
    );
  }

  const rawBody = await response.text();
  const payload = parseTextitJsonBody(rawBody, response.status);

  if (!response.ok) {
    throw mapTextitHttpError(response.status, payload, rawBody);
  }

  return payload ?? {};
}

function appendQueryValue(url: URL, key: string, value: unknown): void {
  if (value === undefined || value === null || value === "") {
    return;
  }
  url.searchParams.set(key, String(value));
}

function parseTextitJsonBody(rawBody: string, status: number): unknown {
  if (!rawBody) {
    return null;
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch (error) {
    throw new ProviderRequestError(
      status === 429 ? 429 : 502,
      buildTextitHttpErrorMessage(status, rawBody, error instanceof Error ? error.message : undefined),
    );
  }
}

function mapTextitHttpError(status: number, payload: unknown, rawBody: string): ProviderRequestError {
  const message = readTextitErrorMessage(payload) ?? buildTextitHttpErrorMessage(status, rawBody);
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 400 || status === 401 || status === 403 || status === 404) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(502, message, payload);
}

function readTextitErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  for (const key of ["detail", "error", "message"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return JSON.stringify(record).slice(0, 200);
}

function buildTextitHttpErrorMessage(status: number, rawBody: string, parseError?: string): string {
  const parts = [`TextIt request failed with ${status}`];
  if (parseError) {
    parts.push(`invalid JSON response: ${parseError}`);
  }
  const bodySnippet = rawBody.trim().slice(0, 200);
  if (bodySnippet) {
    parts.push(`body: ${bodySnippet}`);
  }
  return parts.join("; ");
}

function normalizeTextitPage(payload: unknown, resource: TextitResource): Record<string, unknown> {
  const page = requireRecord(payload, `TextIt returned an invalid ${resource} page`);
  const results = Array.isArray(page.results) ? page.results : [];

  return {
    nextCursor: extractCursor(page.next),
    previousCursor: extractCursor(page.previous),
    [resource]: results,
    raw: page,
  };
}

function extractCursor(value: unknown): string | null {
  if (typeof value !== "string" || !value) {
    return null;
  }

  try {
    return new URL(value).searchParams.get("cursor");
  } catch {
    return null;
  }
}

function readTargetQuery(input: Record<string, unknown>): Record<string, unknown> {
  if (input.uuid) {
    return { uuid: input.uuid };
  }
  return { urn: input.urn };
}

function validateContactTarget(input: Record<string, unknown>): void {
  if (!input.uuid && !input.urn) {
    throw new ProviderRequestError(400, "uuid or urn is required");
  }
  if (input.uuid && input.urn) {
    throw new ProviderRequestError(400, "only one of uuid or urn is allowed");
  }
}

function validateContactMutation(input: Record<string, unknown>): void {
  validateContactTarget(input);
  if (input.urn && Array.isArray(input.urns) && input.urns.length > 0) {
    throw new ProviderRequestError(400, "urns must not be sent when updating by urn");
  }
  if (!input.name && !input.language && !input.urns && !input.groups && input.fields === undefined) {
    throw new ProviderRequestError(400, "at least one contact field is required");
  }
}

function validateBroadcastTarget(input: Record<string, unknown>): void {
  const hasRecipients =
    (Array.isArray(input.urns) && input.urns.length > 0) ||
    (Array.isArray(input.contacts) && input.contacts.length > 0) ||
    (Array.isArray(input.groups) && input.groups.length > 0);
  if (!hasRecipients) {
    throw new ProviderRequestError(400, "at least one of urns, contacts, or groups is required");
  }
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRequestError(502, message);
  }
  return value as Record<string, unknown>;
}
