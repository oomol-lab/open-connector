import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-executors.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  runProviderRequest,
} from "../provider-runtime.ts";

export const exhibitdayApiBaseUrl = "https://api.exhibitday.com/v1";
type Handler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const handlers: ProviderActionHandlers<"exhibitday", Handler> = {
  list_events: (input, context) => call("/events/", "GET", eventFilters(input), context),
  get_event: (input, context) => call("/events/info", "GET", { id: input.eventId }, context),
  create_event: (input, context) => call("/events/", "POST", eventFields(input), context),
  update_event(input, context) {
    requireUpdate(input, "eventId", "update_event");
    return call(
      "/events/",
      "PATCH",
      { id: input.eventId, ...eventFields(input), ...extendedEventFields(input) },
      context,
    );
  },
  delete_event: (input, context) => call("/events/", "DELETE", { id: input.eventId }, context),
  list_tasks: (input, context) => call("/tasks/", "GET", taskFilters(input), context),
  get_task: (input, context) => call("/tasks/info", "GET", { id: input.taskId }, context),
  create_task: (input, context) => call("/tasks/", "POST", taskFields(input), context),
  update_task(input, context) {
    requireUpdate(input, "taskId", "update_task");
    return call("/tasks/", "PATCH", { id: input.taskId, ...taskUpdateFields(input) }, context);
  },
  delete_task: (input, context) => call("/tasks/", "DELETE", { id: input.taskId }, context),
};

export async function validateCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await requestJson("/references/event_participation_types", "GET", {}, { apiKey, fetcher, signal }, "validate");
  return {
    profile: { displayName: "ExhibitDay Workspace" },
    grantedScopes: [],
    metadata: { apiBaseUrl: exhibitdayApiBaseUrl },
  };
}

async function call(path: string, method: string, parameters: Record<string, unknown>, context: ApiKeyProviderContext) {
  return { data: await requestJson(path, method, parameters, context, "execute") };
}
function eventFilters(input: Record<string, unknown>) {
  return compactObject({
    filter_by_event_name_contains_text: input.nameContains,
    filter_by_start_date_greater_than_or_equal_to: input.startDateFrom,
    filter_by_start_date_smaller_than_or_equal_to: input.startDateTo,
    filter_by_end_date_greater_than_or_equal_to: input.endDateFrom,
    filter_by_end_date_smaller_than_or_equal_to: input.endDateTo,
    filter_by_event_participation_type_id: input.participationTypeId,
    filter_by_event_format_id: input.formatId,
    filter_by_event_star_rating: input.starRating,
    filter_by_event_tag: input.tag,
    filter_by_integration_metadata_field_1: input.integrationMetadata1,
    hydrate_tasks: input.includeTasks,
    hydrate_task_sections_list: input.includeTaskSections,
    hydrate_custom_fields: input.includeCustomFields,
  });
}
function eventFields(input: Record<string, unknown>) {
  return compactObject({
    name: input.name,
    start_date: input.startDate,
    end_date: input.endDate,
    format_id: input.formatId,
    participation_type_id: input.participationTypeId,
    integration_metadata_field_1: input.integrationMetadata1,
    integration_metadata_field_2: input.integrationMetadata2,
  });
}
function extendedEventFields(input: Record<string, unknown>) {
  return compactObject({
    star_rating: input.starRating,
    event_tags: Array.isArray(input.tags) ? input.tags.join(",") : undefined,
    website_url: input.websiteUrl,
    venue_name: input.venueName,
    venue_address: input.venueAddress,
    event_notes: input.eventNotes,
  });
}
function taskFilters(input: Record<string, unknown>) {
  return compactObject({
    filter_by_event_id: input.eventId,
    filter_by_general_tasks_only: input.generalOnly,
    filter_by_incomplete_only: input.incompleteOnly,
    filter_by_completed_only: input.completedOnly,
    filter_by_no_due_date: input.noDueDate,
    filter_by_due_date_greater_than_or_equal_to: input.dueDateFrom,
    filter_by_due_date_smaller_than_or_equal_to: input.dueDateTo,
    filter_by_has_assignee: input.hasAssignee,
    filter_by_assignee_user_id: input.assigneeUserId,
    filter_by_task_name_contains_text: input.nameContains,
    filter_by_integration_metadata_field_1: input.integrationMetadata1,
    hydrate_task_comments: input.includeComments,
  });
}
function taskFields(input: Record<string, unknown>) {
  return compactObject({
    name: input.name,
    event_id: input.eventId,
    task_section_id: input.taskSectionId,
    is_completed: input.completed,
    due_date: input.dueDate,
    assignee_user_id: input.assigneeUserId,
    details: input.details,
    integration_metadata_field_1: input.integrationMetadata1,
    integration_metadata_field_2: input.integrationMetadata2,
  });
}
function taskUpdateFields(input: Record<string, unknown>) {
  const fields = taskFields(input);
  delete fields.event_id;
  return fields;
}
function requireUpdate(input: Record<string, unknown>, idField: string, action: string): void {
  if (Object.entries(input).some(([key, value]) => key != idField && value !== undefined)) return;
  throw providerInputError(`ExhibitDay ${action} requires at least one field to update`);
}

async function requestJson(
  path: string,
  method: string,
  parameters: Record<string, unknown>,
  context: { apiKey: string; fetcher: typeof fetch; signal?: AbortSignal },
  phase: "validate" | "execute",
): Promise<unknown> {
  return runProviderRequest({ label: "ExhibitDay", signal: context.signal }, async (signal) => {
    const url = new URL(`${exhibitdayApiBaseUrl}${path}`);
    const headers = new Headers({
      accept: "application/json",
      api_key: context.apiKey,
      "user-agent": providerUserAgent,
    });
    let body: string | undefined;
    if (method == "GET" || method == "DELETE")
      for (const [key, value] of Object.entries(parameters)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    else {
      headers.set("content-type", "application/json");
      body = JSON.stringify(parameters);
    }
    const response = await context.fetcher(url, { method, headers, body, signal });
    const payload = await readPayload(response);
    if (!response.ok) throw createError(response.status, payload, phase);
    return payload;
  });
}
async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
function createError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message = errorMessage(payload) ?? `ExhibitDay request failed with status ${status}`;
  return phase == "validate" && 400 <= status && status < 500
    ? providerInputError(message)
    : new ProviderRequestError(status || 502, message);
}
function errorMessage(payload: unknown): string | undefined {
  if (typeof payload == "string") return payload.trim() || undefined;
  const value = optionalRecord(payload);
  return optionalString(value?.message) ?? optionalString(value?.error);
}
