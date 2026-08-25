import type { ProviderActionHandlerSubset } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { europePmcAnnotationsApiBaseUrl, requestEuropePmcJson, requestEuropePmcObject } from "./request.ts";

type AnnotationActionHandler = (input: Record<string, unknown>, fetcher: typeof fetch) => Promise<unknown>;

export const europePmcAnnotationActionHandlers: ProviderActionHandlerSubset<"europe_pmc", AnnotationActionHandler> = {
  async get_annotations_by_articles(input: Record<string, unknown>, fetcher: typeof fetch) {
    const articleIds = readArticleIds(input.articles);
    const payload = await requestEuropePmcJson({
      baseUrl: europePmcAnnotationsApiBaseUrl,
      path: "/annotationsByArticleIds",
      params: {
        articleIds,
        type: readOptionalStringArray(input.types),
        subType: readOptionalStringArray(input.subtypes),
        section: readOptionalStringArray(input.sections),
        provider: readOptionalStringArray(input.providers),
        format: "JSON",
      },
      fetcher,
    });
    const rawArticles = readRecordArray(payload);

    return {
      articles: rawArticles.map(normalizeAnnotatedArticle),
      rawArticles,
    };
  },

  async search_annotations_by_entity(input: Record<string, unknown>, fetcher: typeof fetch) {
    return searchAnnotations(
      "/annotationsByEntity",
      { entity: readRequiredString(input.entity, "entity") },
      input,
      fetcher,
    );
  },

  async search_annotations_by_relationship(input: Record<string, unknown>, fetcher: typeof fetch) {
    return searchAnnotations(
      "/annotationsByRelationship",
      {
        firstEntity: readRequiredString(input.firstEntity, "firstEntity"),
        secondEntity: readRequiredString(input.secondEntity, "secondEntity"),
      },
      input,
      fetcher,
    );
  },

  async search_annotations_by_provider(input: Record<string, unknown>, fetcher: typeof fetch) {
    return searchAnnotations(
      "/annotationsByProvider",
      { provider: readRequiredString(input.provider, "provider") },
      input,
      fetcher,
    );
  },

  async search_annotations_by_section_or_type(input: Record<string, unknown>, fetcher: typeof fetch) {
    if (!readOptionalString(input.type) && !readOptionalString(input.section)) {
      throw new ProviderRequestError(400, "type or section is required");
    }
    return searchAnnotations(
      "/annotationsBySectionAndOrType",
      {
        type: readOptionalString(input.type),
        subType: readOptionalString(input.subtype),
        section: readOptionalString(input.section),
      },
      input,
      fetcher,
    );
  },
};

async function searchAnnotations(
  path: string,
  filters: Record<string, string | undefined>,
  input: Record<string, unknown>,
  fetcher: typeof fetch,
) {
  const payload = await requestEuropePmcObject({
    baseUrl: europePmcAnnotationsApiBaseUrl,
    path,
    params: {
      ...filters,
      filter: readFilter(input.onlyMatchingAnnotations),
      cursorMark: readOptionalNumberString(input.cursorMark),
      pageSize: readOptionalIntegerString(input.pageSize),
      format: "JSON",
    },
    fetcher,
  });
  const rawArticles = readRecordArray(payload.articles);

  return {
    cursorMark: readNullableNumber(payload.cursorMark),
    nextCursorMark: readNullableNumber(payload.nextCursorMark),
    articles: rawArticles.map(normalizeAnnotatedArticle),
    rawArticles,
  };
}

function normalizeAnnotatedArticle(raw: Record<string, unknown>) {
  return {
    source: readRequiredResponseString(raw.source, "annotation article source"),
    externalId: readRequiredResponseString(raw.extId, "annotation article identifier"),
    pmcid: readNullableString(raw.pmcid),
    fullTextIds: readStringArray(raw.fullTextIdList),
    annotations: readRecordArray(raw.annotations).map(normalizeAnnotation),
    raw,
  };
}

function normalizeAnnotation(raw: Record<string, unknown>) {
  return {
    id: readNullableString(raw.id),
    type: readNullableString(raw.type),
    subtype: readNullableString(raw.subType),
    provider: readNullableString(raw.provider),
    section: readNullableString(raw.section),
    fileName: readNullableString(raw.fileName),
    frequency: readNullableInteger(raw.frequency),
    prefix: readNullableString(raw.prefix),
    exact: readNullableString(raw.exact),
    postfix: readNullableString(raw.postfix),
    tags: readRecordArray(raw.tags).map((tag) => ({
      name: readNullableString(tag.name),
      uri: readNullableString(tag.uri),
    })),
    raw,
  };
}

function readFilter(value: unknown) {
  return value === false ? "0" : "1";
}

function readRequiredString(value: unknown, fieldName: string) {
  const parsed = readOptionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function readRequiredResponseString(value: unknown, fieldName: string) {
  const parsed = readOptionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(502, `Europe PMC returned a missing ${fieldName}`);
  }
  return parsed;
}

function readOptionalString(value: unknown) {
  return optionalString(value)?.trim() || undefined;
}

function readNullableString(value: unknown) {
  return readOptionalString(value) ?? null;
}

function readOptionalStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.map(readOptionalString).filter((item): item is string => item != null);
  return items.length > 0 ? items : undefined;
}

function readArticleIds(value: unknown) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "articles is required");
  }
  return value.map((item) => {
    const record = optionalRecord(item);
    const source = readRequiredString(record?.source, "articles.source");
    const id = readRequiredString(record?.id, "articles.id");
    return `${source}:${id}`;
  });
}

function readStringArray(value: unknown) {
  return readOptionalStringArray(value) ?? [];
}

function readOptionalIntegerString(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? String(value) : undefined;
}

function readOptionalNumberString(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : undefined;
}

function readNullableNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(readOptionalString(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function readNullableInteger(value: unknown) {
  const parsed = readNullableNumber(value);
  return parsed != null && Number.isInteger(parsed) ? parsed : null;
}

function readRecordArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const record = optionalRecord(item);
    return record ? [record] : [];
  });
}
