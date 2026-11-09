import type { ProviderRuntimeHandler } from "../provider-executors.ts";
import type { MetaContext } from "./request.ts";

import { compactObject, objectArray, optionalInteger, rawStringOrNull, requiredString } from "../../core/cast.ts";
import { providerInputError, providerResponseError, requiredInputString } from "../provider-runtime.ts";
import { metaAdAccountId, metaFields, metaId, metaRequest, normalizePaging } from "./request.ts";

const metaMeFields = "id,name";
const defaultAdAccountFields = "id,account_id,name,currency,timezone_name,account_status,business_name";
const defaultCampaignFields = "id,name,status,effective_status,objective,buying_type,created_time,updated_time";
const defaultInsightFields = "impressions,clicks,spend,date_start,date_stop";

const adSetFields =
  "id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,billing_event,optimization_goal,targeting,start_time,end_time";

const adFields = "id,name,adset_id,campaign_id,status,effective_status,creative";
const creativeFields = "id,name,status,object_story_id,effective_object_story_id,object_story_spec,asset_feed_spec";

export const metaAdsHandlers: Record<string, ProviderRuntimeHandler<MetaContext>> = {
  get_current_user: getCurrentUser,
  list_ad_accounts: listAdAccounts,
  list_campaigns: listCampaigns,
  get_insights: getInsights,
  get_ad_account: (input, context) =>
    readEntity(input, context, "adAccountId", "adAccount", defaultAdAccountFields, normalizeAdAccount),
  get_campaign: (input, context) =>
    readEntity(input, context, "campaignId", "campaign", defaultCampaignFields, normalizeCampaign),
  get_ad_set: (input, context) => readEntity(input, context, "adSetId", "adSet", adSetFields),
  get_ad: (input, context) => readEntity(input, context, "adId", "ad", adFields),
  get_ad_creative: (input, context) => readEntity(input, context, "creativeId", "creative", creativeFields),
  list_ad_sets: (input, context) => listEntities(input, context, "adsets", "adSets", adSetFields),
  list_ads: (input, context) => listEntities(input, context, "ads", "ads", adFields),
  list_ad_creatives: (input, context) => listEntities(input, context, "adcreatives", "creatives", creativeFields),
  async create_insights_report(input: Record<string, unknown>, context: MetaContext) {
    const objectId = requiredInputString(input.objectId, "objectId");
    const result = await metaRequest(`${metaId(objectId)}/insights`, context, {
      method: "POST",
      body: insightsQuery(input),
    });

    const id = result.report_run_id;
    return {
      reportRunId:
        typeof id === "number" ? String(id) : requiredString(id, "Meta report run ID", providerResponseError),
    };
  },
  async get_insights_report(input: Record<string, unknown>, context: MetaContext) {
    const reportRunId = requiredInputString(input.reportRunId, "reportRunId");
    const raw = await metaRequest(metaId(reportRunId), context);
    const upstreamStatus = requiredString(raw.async_status, "Meta report status", providerResponseError);
    const progress = optionalInteger(raw.async_percent_completion) ?? null;
    const status = reportStatus(upstreamStatus, progress);
    let results: Record<string, unknown> = { data: [] };
    if (status === "succeeded") {
      results = await metaRequest(`${metaId(reportRunId)}/insights`, context, {
        query: { limit: input.limit, after: input.after },
      });
    }

    return {
      reportRunId,
      status,
      progress,
      insights: objectArray(results.data, "Meta report rows", providerResponseError).map(normalizeInsight),
      paging: normalizePaging(results.paging),
      raw,
    };
  },
};

async function getCurrentUser(_input: Record<string, unknown>, context: MetaContext) {
  const payload = await metaRequest("me", context, {
    query: {
      fields: metaMeFields,
    },
  });

  return {
    user: normalizeMetaUser(payload),
  };
}

async function listAdAccounts(input: Record<string, unknown>, context: MetaContext) {
  const payload = await metaRequest("me/adaccounts", context, {
    query: compactObject({
      fields: metaFields(input.fields, defaultAdAccountFields),
      limit: input.limit,
      after: input.after,
      before: input.before,
    }),
  });

  return {
    adAccounts: objectArray(payload.data, "Meta list data", providerResponseError).map(normalizeAdAccount),
    paging: normalizePaging(payload.paging),
  };
}

async function listCampaigns(input: Record<string, unknown>, context: MetaContext) {
  const adAccountId = metaAdAccountId(requiredInputString(input.adAccountId, "adAccountId"));
  const payload = await metaRequest(`${adAccountId}/campaigns`, context, {
    query: compactObject({
      fields: metaFields(input.fields, defaultCampaignFields),
      limit: input.limit,
      after: input.after,
      before: input.before,
      effective_status: input.effectiveStatus,
      is_completed: input.isCompleted,
      date_preset: input.datePreset,
      time_range: input.timeRange,
    }),
  });

  return {
    campaigns: objectArray(payload.data, "Meta list data", providerResponseError).map(normalizeCampaign),
    paging: normalizePaging(payload.paging),
  };
}

async function getInsights(input: Record<string, unknown>, context: MetaContext) {
  const objectId = requiredInputString(input.objectId, "objectId");
  const payload = await metaRequest(`${metaId(objectId)}/insights`, context, {
    query: insightsQuery(input),
  });

  return {
    insights: objectArray(payload.data, "Meta list data", providerResponseError).map(normalizeInsight),
    paging: normalizePaging(payload.paging),
  };
}

function insightFields(level: unknown) {
  const fields = ["account_id", "account_name", defaultInsightFields];
  if (["campaign", "adset", "ad"].includes(String(level))) {
    fields.push("campaign_id", "campaign_name");
  }

  if (["adset", "ad"].includes(String(level))) fields.push("adset_id", "adset_name");
  if (level === "ad") fields.push("ad_id", "ad_name");
  return fields.join(",");
}

function insightsQuery(input: Record<string, unknown>) {
  const hasConflictingDates = input.datePreset !== undefined && input.timeRange !== undefined;
  if (input.timeRanges === undefined && hasConflictingDates) {
    throw providerInputError("datePreset and timeRange cannot be used together");
  }

  return compactObject({
    level: input.level,
    fields: metaFields(input.fields, insightFields(input.level)),
    date_preset: input.datePreset,
    time_range: input.timeRange,
    time_ranges: input.timeRanges,
    time_increment: input.timeIncrement,
    breakdowns: input.breakdowns,
    action_breakdowns: input.actionBreakdowns,
    action_attribution_windows: input.actionAttributionWindows,
    filtering: input.filtering,
    sort: input.sort,
    limit: input.limit,
    after: input.after,
    before: input.before,
  });
}

function normalizeMetaUser(payload: Record<string, unknown>) {
  return {
    id: requiredString(payload.id, "Meta user ID", providerResponseError),
    name: rawStringOrNull(payload.name),
    raw: payload,
  };
}

function normalizeAdAccount(payload: Record<string, unknown>) {
  return {
    id: requiredString(payload.id, "Meta ad account ID", providerResponseError),
    accountId: rawStringOrNull(payload.account_id),
    name: rawStringOrNull(payload.name),
    currency: rawStringOrNull(payload.currency),
    timezoneName: rawStringOrNull(payload.timezone_name),
    accountStatus: optionalInteger(payload.account_status) ?? null,
    businessName: rawStringOrNull(payload.business_name),
    raw: payload,
  };
}

function normalizeCampaign(payload: Record<string, unknown>) {
  return {
    id: requiredString(payload.id, "Meta campaign ID", providerResponseError),
    name: rawStringOrNull(payload.name),
    status: rawStringOrNull(payload.status),
    effectiveStatus: rawStringOrNull(payload.effective_status),
    objective: rawStringOrNull(payload.objective),
    buyingType: rawStringOrNull(payload.buying_type),
    createdTime: rawStringOrNull(payload.created_time),
    updatedTime: rawStringOrNull(payload.updated_time),
    raw: payload,
  };
}

function normalizeInsight(payload: Record<string, unknown>) {
  return {
    campaignId: rawStringOrNull(payload.campaign_id),
    campaignName: rawStringOrNull(payload.campaign_name),
    adsetId: rawStringOrNull(payload.adset_id),
    adsetName: rawStringOrNull(payload.adset_name),
    adId: rawStringOrNull(payload.ad_id),
    adName: rawStringOrNull(payload.ad_name),
    impressions: rawStringOrNull(payload.impressions),
    clicks: rawStringOrNull(payload.clicks),
    spend: rawStringOrNull(payload.spend),
    dateStart: rawStringOrNull(payload.date_start),
    dateStop: rawStringOrNull(payload.date_stop),
    raw: payload,
  };
}

function normalizeEntity(raw: Record<string, unknown>) {
  return {
    id: requiredString(raw.id, "Meta object ID", providerResponseError),
    name: rawStringOrNull(raw.name),
    raw,
  };
}

async function readEntity(
  input: Record<string, unknown>,
  context: MetaContext,
  idField: string,
  outputField: string,
  fields: string,
  normalize: (raw: Record<string, unknown>) => unknown = normalizeEntity,
) {
  const id = requiredInputString(input[idField], idField);
  const raw = await metaRequest(idField === "adAccountId" ? metaAdAccountId(id) : metaId(id), context, {
    query: { fields: metaFields(input.fields, fields) },
  });

  return { [outputField]: normalize(raw) };
}

async function listEntities(
  input: Record<string, unknown>,
  context: MetaContext,
  edge: string,
  outputField: string,
  fields: string,
) {
  const id = metaAdAccountId(requiredInputString(input.adAccountId, "adAccountId"));
  const raw = await metaRequest(`${id}/${edge}`, context, {
    query: {
      fields: metaFields(input.fields, fields),
      limit: input.limit,
      after: input.after,
      before: input.before,
      effective_status: input.effectiveStatus,
      date_preset: input.datePreset,
      time_range: input.timeRange,
      updated_since: input.updatedSince,
      is_completed: input.isCompleted,
    },
  });

  return {
    [outputField]: objectArray(raw.data, "Meta advertising objects", providerResponseError).map(normalizeEntity),
    paging: normalizePaging(raw.paging),
  };
}

function reportStatus(status: string, progress: number | null) {
  if (status === "Job Completed" && progress === 100) return "succeeded";
  if (status === "Job Failed" || status === "Job Skipped") return "failed";
  return "running";
}
