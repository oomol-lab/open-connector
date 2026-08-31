import type { FeishuJsonRequest } from "./client.ts";

import { optionalNumber } from "../../../core/cast.ts";
import { providerInputError } from "../../provider-runtime.ts";

interface OkrActionHandler {
  (input: Record<string, unknown>): Promise<unknown>;
}

export function createFeishuOkrActionHandlers(request: FeishuJsonRequest): Record<string, OkrActionHandler> {
  return {
    list_okr_cycles: (input) => listCycles(input, request),
    get_okr_cycle_detail: (input) => getCycleDetail(input, request),
    create_okr: (input) => createOkr(input, request),
    batch_create_okrs: (input) => batchCreateOkrs(input, request),
    patch_okr: (input) => patchOkr(input, request),
    list_okr_alignments: (input) => listAlignments(input, request),
    create_okr_alignment: (input) => createAlignment(input, request),
    delete_okr_alignment: (input) => deleteAlignment(input, request),
    list_okr_categories: (input) => listCategories(input, request),
    list_okr_progress: (input) => listProgress(input, request),
    get_okr_progress: (input) => getProgress(input, request),
    create_okr_progress: (input) => createProgress(input, request),
    update_okr_progress: (input) => updateProgress(input, request),
    delete_okr_progress: (input) => deleteProgress(input, request),
    reorder_okrs: (input) => reorderOkrs(input, request),
    update_okr_weights: (input) => updateWeights(input, request),
    update_okr_indicator: (input) => updateIndicator(input, request),
  };
}

async function listCycles(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const data = await request({
    path: "/okr/v2/cycles",
    query: {
      user_id: optionalString(input.userId),
      user_id_type: optionalString(input.userIdType) ?? "open_id",
      page_size: optionalNumber(input.pageSize) ?? 20,
      page_token: optionalString(input.pageToken),
    },
  });
  return normalizePage(data);
}

async function getCycleDetail(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const cycleId = requiredString(input.cycleId, "cycleId");
  const userIdType = optionalString(input.userIdType) ?? "open_id";
  const objectives = await fetchAllPages(request, `/okr/v2/cycles/${encode(cycleId)}/objectives`, {
    cycle_id: cycleId,
    user_id_type: userIdType,
  });
  const enriched = await Promise.all(
    objectives.map(async (objective) => {
      const objectiveId = requiredString(objective.objective_id ?? objective.id, "objective_id");
      const keyResults = await fetchAllPages(request, `/okr/v2/objectives/${encode(objectiveId)}/key_results`, {
        objective_id: objectiveId,
        user_id_type: userIdType,
      });
      return { ...objective, key_results: keyResults };
    }),
  );
  return { cycleId, objectives: enriched };
}

async function createOkr(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const targetType = requiredTargetType(input.targetType);
  const parentId = requiredString(input.parentId, "parentId");
  const body = compact({
    content: contentBlock(requiredString(input.text, "text"), optionalStringArray(input.mentions) ?? []),
    notes: optionalString(input.notes)
      ? contentBlock(requiredString(input.notes, "notes"), optionalStringArray(input.notesMentions) ?? [])
      : undefined,
    category_id: targetType === "objective" ? optionalString(input.categoryId) : undefined,
  });
  const path =
    targetType === "objective"
      ? `/okr/v2/cycles/${encode(parentId)}/objectives`
      : `/okr/v2/objectives/${encode(parentId)}/key_results`;
  const data = await request({
    method: "POST",
    path,
    query: {
      [targetType === "objective" ? "cycle_id" : "objective_id"]: parentId,
      user_id_type: optionalString(input.userIdType) ?? "open_id",
    },
    body,
  });
  return {
    targetType,
    targetId: extractTargetId(data, targetType),
    raw: data,
  };
}

async function batchCreateOkrs(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const cycleId = requiredString(input.cycleId, "cycleId");
  const userIdType = optionalString(input.userIdType) ?? "open_id";
  const definitions = recordArray(input.objectives);
  const created: Array<{ objectiveId: string; keyResultIds: string[] }> = [];
  try {
    for (const definition of definitions) {
      const objectiveData = await request({
        method: "POST",
        path: `/okr/v2/cycles/${encode(cycleId)}/objectives`,
        query: { cycle_id: cycleId, user_id_type: userIdType },
        body: compact({
          content: contentBlock(
            requiredString(definition.text, "objective.text"),
            optionalStringArray(definition.mentions) ?? [],
          ),
          notes: optionalString(definition.notes)
            ? contentBlock(requiredString(definition.notes, "objective.notes"), [])
            : undefined,
          category_id: optionalString(definition.categoryId),
        }),
      });
      const objectiveId = extractTargetId(objectiveData, "objective");
      const result = { objectiveId, keyResultIds: [] as string[] };
      created.push(result);
      for (const keyResult of recordArray(definition.keyResults)) {
        const keyResultData = await request({
          method: "POST",
          path: `/okr/v2/objectives/${encode(objectiveId)}/key_results`,
          query: { objective_id: objectiveId, user_id_type: userIdType },
          body: {
            content: contentBlock(
              requiredString(keyResult.text, "keyResult.text"),
              optionalStringArray(keyResult.mentions) ?? [],
            ),
          },
        });
        result.keyResultIds.push(extractTargetId(keyResultData, "key_result"));
      }
    }
  } catch (error) {
    if (input.rollbackOnFailure !== false) {
      for (const result of created.toReversed()) {
        try {
          await request({
            method: "DELETE",
            path: `/okr/v2/objectives/${encode(result.objectiveId)}`,
            query: { objective_id: result.objectiveId },
          });
        } catch {
          // Preserve the original create error; callers can inspect created IDs if rollback also fails.
        }
      }
    }
    throw error;
  }
  return { objectives: created };
}

async function patchOkr(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const targetType = requiredTargetType(input.targetType);
  const targetId = requiredString(input.targetId, "targetId");
  const body = compact({
    content: optionalString(input.text)
      ? contentBlock(requiredString(input.text, "text"), optionalStringArray(input.mentions) ?? [])
      : undefined,
    notes: optionalString(input.notes) ? contentBlock(requiredString(input.notes, "notes"), []) : undefined,
    score: optionalNumber(input.score),
    deadline: optionalString(input.deadline),
  });
  const patchedFields = Object.keys(body);
  if (patchedFields.length === 0) {
    throw providerInputError("at least one OKR field must be patched");
  }
  await request({
    method: "PATCH",
    path: `/okr/v2/${targetType === "objective" ? "objectives" : "key_results"}/${encode(targetId)}`,
    query: { user_id_type: optionalString(input.userIdType) ?? "open_id" },
    body,
  });
  return { targetType, targetId, patchedFields };
}

async function listAlignments(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const objectiveId = requiredString(input.objectiveId, "objectiveId");
  const data = await request({
    path: `/okr/v2/objectives/${encode(objectiveId)}/alignments`,
    query: {
      align_type: optionalString(input.alignType),
      user_id_type: optionalString(input.userIdType) ?? "open_id",
      department_id_type: optionalString(input.departmentIdType) ?? "open_department_id",
      page_size: optionalNumber(input.pageSize) ?? 20,
      page_token: optionalString(input.pageToken),
    },
  });
  return normalizePage(data);
}

async function createAlignment(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const objectiveId = requiredString(input.objectiveId, "objectiveId");
  const toObjectiveId = requiredString(input.toObjectiveId, "toObjectiveId");
  if (objectiveId === toObjectiveId) {
    throw providerInputError("an objective cannot align to itself");
  }
  const data = await request({
    method: "POST",
    path: `/okr/v2/objectives/${encode(objectiveId)}/alignments`,
    body: {
      to_entity_id: toObjectiveId,
      to_entity_type: 2,
    },
  });
  return {
    alignmentId: requiredString(data.alignment_id, "alignment_id"),
    raw: data,
  };
}

async function deleteAlignment(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const alignmentId = requiredString(input.alignmentId, "alignmentId");
  await request({
    method: "DELETE",
    path: `/okr/v2/alignments/${encode(alignmentId)}`,
  });
  return { deleted: true, alignmentId };
}

async function listCategories(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const data = await request({
    path: "/okr/v2/categories",
    query: {
      owner_type: optionalString(input.ownerType) ?? "user",
      page_size: optionalNumber(input.pageSize) ?? 20,
      page_token: optionalString(input.pageToken),
    },
  });
  return normalizePage(data);
}

async function listProgress(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const targetType = requiredTargetType(input.targetType);
  const targetId = requiredString(input.targetId, "targetId");
  const data = await request({
    path: `/okr/v2/${targetType === "objective" ? "objectives" : "key_results"}/${encode(targetId)}/progresses`,
    query: {
      user_id_type: optionalString(input.userIdType) ?? "open_id",
      department_id_type: optionalString(input.departmentIdType) ?? "open_department_id",
      page_size: optionalNumber(input.pageSize) ?? 20,
      page_token: optionalString(input.pageToken),
    },
  });
  return normalizePage(data);
}

async function getProgress(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const progressId = requiredString(input.progressId, "progressId");
  const data = await request({
    path: `/okr/v1/progress_records/${encode(progressId)}`,
    query: { user_id_type: optionalString(input.userIdType) ?? "open_id" },
  });
  return { progress: recordValue(data.progress ?? data.progress_record ?? data) };
}

async function createProgress(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const targetType = requiredTargetType(input.targetType);
  const data = await request({
    method: "POST",
    path: "/okr/v1/progress_records/",
    query: { user_id_type: optionalString(input.userIdType) ?? "open_id" },
    body: compact({
      content: contentBlockV1(requiredString(input.content, "content"), []),
      target_id: requiredString(input.targetId, "targetId"),
      target_type: targetType === "objective" ? 2 : 3,
      source_title: optionalString(input.sourceTitle) ?? "Oomol Connector",
      source_url: optionalString(input.sourceUrl) ?? "https://oomol.com",
      progress_rate: progressRate(input.percent, input.status),
    }),
  });
  return { progress: recordValue(data.progress ?? data.progress_record ?? data) };
}

async function updateProgress(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const progressId = requiredString(input.progressId, "progressId");
  const body = compact({
    content: optionalString(input.content) ? contentBlockV1(requiredString(input.content, "content"), []) : undefined,
    progress_rate: progressRate(input.percent, input.status),
  });
  if (Object.keys(body).length === 0) {
    throw providerInputError("content or progress rate is required");
  }
  const data = await request({
    method: "PUT",
    path: `/okr/v1/progress_records/${encode(progressId)}`,
    query: { user_id_type: optionalString(input.userIdType) ?? "open_id" },
    body,
  });
  return { progress: recordValue(data.progress ?? data.progress_record ?? data) };
}

async function deleteProgress(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const progressId = requiredString(input.progressId, "progressId");
  await request({
    method: "DELETE",
    path: `/okr/v1/progress_records/${encode(progressId)}`,
  });
  return { deleted: true, progressId };
}

async function reorderOkrs(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const targetType = requiredTargetType(input.targetType);
  const parentId = requiredString(input.parentId, "parentId");
  const orderedIds = requiredStringArray(input.orderedIds, "orderedIds");
  await request({
    method: "PUT",
    path:
      targetType === "objective"
        ? `/okr/v2/cycles/${encode(parentId)}/objectives_position`
        : `/okr/v2/objectives/${encode(parentId)}/key_results_position`,
    query: {
      [targetType === "objective" ? "cycle_id" : "objective_id"]: parentId,
    },
    body: {
      [targetType === "objective" ? "objective_ids" : "key_result_ids"]: orderedIds,
    },
  });
  return { targetType, orderedIds };
}

async function updateWeights(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const targetType = requiredTargetType(input.targetType);
  const parentId = requiredString(input.parentId, "parentId");
  const weights = recordArray(input.weights).map((weight) => ({
    [targetType === "objective" ? "objective_id" : "key_result_id"]: requiredString(weight.id, "weight.id"),
    weight: requiredNumber(weight.weight, "weight.weight"),
  }));
  await request({
    method: "PUT",
    path:
      targetType === "objective"
        ? `/okr/v2/cycles/${encode(parentId)}/objectives_weight`
        : `/okr/v2/objectives/${encode(parentId)}/key_results_weight`,
    query: {
      [targetType === "objective" ? "cycle_id" : "objective_id"]: parentId,
    },
    body: {
      [targetType === "objective" ? "objective_weights" : "key_result_weights"]: weights,
    },
  });
  return { targetType, weights };
}

async function updateIndicator(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const targetType = requiredTargetType(input.targetType);
  const targetId = requiredString(input.targetId, "targetId");
  const indicators = await request({
    path: `/okr/v2/${targetType === "objective" ? "objectives" : "key_results"}/${encode(targetId)}/indicators`,
    query: { page_size: 1 },
  });
  const indicator = recordArray(indicators.items ?? indicators.indicators)[0];
  const indicatorId = requiredString(indicator?.indicator_id ?? indicator?.id, "indicator_id");
  const currentValue = requiredNumber(input.currentValue, "currentValue");
  await request({
    method: "PATCH",
    path: `/okr/v2/indicators/${encode(indicatorId)}`,
    body: { current_value: currentValue },
  });
  return { indicatorId, currentValue };
}

async function fetchAllPages(request: FeishuJsonRequest, path: string, baseQuery: Record<string, string>) {
  const items: Record<string, unknown>[] = [];
  let pageToken: string | undefined;
  do {
    const data = await request({
      path,
      query: { ...baseQuery, page_size: 50, page_token: pageToken },
    });
    items.push(...recordArray(data.items));
    pageToken = data.has_more === true ? optionalString(data.page_token) : undefined;
  } while (pageToken);
  return items;
}

function contentBlock(text: string, mentions: string[]) {
  const elements: Record<string, unknown>[] = [
    {
      paragraph_element_type: "textRun",
      text_run: { text },
    },
  ];
  elements.push(
    ...mentions.map((userId) => ({
      paragraph_element_type: "mention",
      mention: { user_id: userId },
    })),
  );
  return {
    blocks: [
      {
        block_element_type: "paragraph",
        paragraph: { elements },
      },
    ],
  };
}

function contentBlockV1(text: string, mentions: string[]) {
  const elements: Record<string, unknown>[] = [{ type: "textRun", textRun: { text } }];
  elements.push(...mentions.map((openId) => ({ type: "person", person: { openId } })));
  return {
    blocks: [
      {
        type: "paragraph",
        paragraph: { elements },
      },
    ],
  };
}

function progressRate(percent: unknown, status: unknown) {
  const numericPercent = optionalNumber(percent);
  const stringStatus = optionalString(status);
  if (numericPercent == null && !stringStatus) {
    return undefined;
  }
  if (stringStatus && numericPercent == null) {
    throw providerInputError("percent is required when status is provided");
  }
  const statuses: Record<string, number> = { normal: 0, overdue: 1, done: 2 };
  return compact({
    percent: numericPercent,
    status: stringStatus ? statuses[stringStatus] : undefined,
  });
}

function extractTargetId(data: Record<string, unknown>, type: "objective" | "key_result") {
  return requiredString(data[type === "objective" ? "objective_id" : "key_result_id"], `${type}_id`);
}

function requiredTargetType(value: unknown): "objective" | "key_result" {
  if (value === "objective" || value === "key_result") {
    return value;
  }
  throw providerInputError("targetType must be objective or key_result");
}

function normalizePage(data: Record<string, unknown>) {
  return {
    items: recordArray(data.items),
    hasMore: data.has_more === true,
    pageToken: optionalString(data.page_token) ?? null,
  };
}

function compact(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item),
      )
    : [];
}

function requiredString(value: unknown, field: string) {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  throw providerInputError(`${field} must be a non-empty string`);
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function requiredStringArray(value: unknown, field: string) {
  const values = optionalStringArray(value);
  if (!values) {
    throw providerInputError(`${field} must contain at least one string`);
  }
  return values;
}

function optionalStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const values = value.filter((item): item is string => typeof item === "string" && item.length > 0);
  return values.length > 0 ? values : undefined;
}

function requiredNumber(value: unknown, field: string) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  throw providerInputError(`${field} must be a number`);
}

function encode(value: string) {
  return encodeURIComponent(value);
}
