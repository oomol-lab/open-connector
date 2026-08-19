import type { ProviderActionHandlerSubset } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { europePmcGrantsApiBaseUrl, requestEuropePmcObject } from "./request.ts";

const defaultGrantPage = 1;
const defaultGrantResultType = "lite";

type GrantActionHandler = (input: Record<string, unknown>, fetcher: typeof fetch) => Promise<unknown>;

export const europePmcGrantActionHandlers: ProviderActionHandlerSubset<"europe_pmc", GrantActionHandler> = {
  async search_grants(input: Record<string, unknown>, fetcher: typeof fetch) {
    const query = readRequiredString(input.query, "query");
    const resultType = readOptionalString(input.resultType) ?? defaultGrantResultType;
    const page = readOptionalInteger(input.page) ?? defaultGrantPage;
    const payload = await requestEuropePmcObject({
      baseUrl: europePmcGrantsApiBaseUrl,
      path: `/get/query=${encodeURIComponent(query)}&resultType=${resultType}&page=${page}&format=json`,
      accept: "*/*",
      fetcher,
    });
    const request = optionalRecord(payload.Request);
    const rawResults = readNestedRecordArray(payload.RecordList, "Record");

    return {
      hitCount: readNonNegativeInteger(payload.HitCount, "HitCount"),
      query: readNullableString(request?.Query) ?? query,
      resultType: readNullableString(request?.ResultType) ?? resultType,
      page: readInteger(request?.Page) ?? page,
      grants: rawResults.map(normalizeGrant),
      rawResults,
    };
  },
};

function normalizeGrant(raw: Record<string, unknown>) {
  const grant = optionalRecord(raw.Grant) ?? {};
  const funder = optionalRecord(grant.Funder);
  const amount = optionalRecord(grant.Amount);

  return {
    id: readNullableString(grant.Id),
    doi: readNullableString(grant.Doi),
    title: readNullableString(grant.Title),
    abstracts: readRecordOrArray(grant.Abstract).flatMap(normalizeGrantAbstract),
    funderName: readNullableString(funder?.Name),
    funderDoi: readNullableString(funder?.FundRefID),
    grantType: readNullableString(grant.Type),
    categories: readStringOrArray(grant.Category),
    stream: readNullableString(grant.Stream),
    startDate: readNullableString(grant.StartDate),
    endDate: readNullableString(grant.EndDate),
    amount: readNullableNumber(amount?.value),
    currency: readNullableString(amount?.Currency),
    investigators: readRecordOrArray(raw.Person).map(normalizeInvestigator),
    institutions: readRecordOrArray(raw.Institution).map(normalizeInstitution),
    raw,
  };
}

function normalizeGrantAbstract(raw: Record<string, unknown>) {
  const text = readNullableString(raw.value);
  if (!text) {
    return [];
  }
  return [
    {
      text,
      language: readNullableString(raw.Language),
      type: readNullableString(raw.Type),
    },
  ];
}

function normalizeInvestigator(raw: Record<string, unknown>) {
  const orcidAlias = readRecordOrArray(raw.Alias).find(
    (alias) => readNullableString(alias.Source)?.toUpperCase() === "ORCID",
  );
  return {
    givenName: readNullableString(raw.GivenName),
    familyName: readNullableString(raw.FamilyName),
    initials: readNullableString(raw.Initials),
    title: readNullableString(raw.Title),
    orcid: readNullableString(orcidAlias?.value),
  };
}

function normalizeInstitution(raw: Record<string, unknown>) {
  return {
    name: readNullableString(raw.Name),
    rorId: readNullableString(raw.RORID),
    rorOfficialName: readNullableString(raw.RorOfficialName),
  };
}

function readRequiredString(value: unknown, fieldName: string) {
  const parsed = readOptionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function readOptionalString(value: unknown) {
  return optionalString(value)?.trim() || undefined;
}

function readNullableString(value: unknown) {
  return readOptionalString(value) ?? null;
}

function readOptionalInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function readInteger(value: unknown) {
  const numericValue = typeof value === "number" ? value : Number(readOptionalString(value));
  return Number.isInteger(numericValue) ? numericValue : null;
}

function readNonNegativeInteger(value: unknown, fieldName: string) {
  const parsed = readInteger(value);
  if (parsed == null || parsed < 0) {
    throw new ProviderRequestError(502, `Europe PMC returned an invalid ${fieldName}`);
  }
  return parsed;
}

function readNullableNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const stringValue = readOptionalString(value);
  if (!stringValue) {
    return null;
  }
  const parsed = Number(stringValue);
  return Number.isFinite(parsed) ? parsed : null;
}

function readStringOrArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const parsed = readNullableString(item);
      return parsed ? [parsed] : [];
    });
  }
  const parsed = readNullableString(value);
  return parsed ? [parsed] : [];
}

function readRecordOrArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const record = optionalRecord(item);
      return record ? [record] : [];
    });
  }
  const record = optionalRecord(value);
  return record ? [record] : [];
}

function readNestedRecordArray(value: unknown, key: string) {
  const record = optionalRecord(value);
  const nested = record?.[key];
  if (!Array.isArray(nested)) {
    return [];
  }
  return nested.flatMap((item) => {
    const itemRecord = optionalRecord(item);
    return itemRecord ? [itemRecord] : [];
  });
}
