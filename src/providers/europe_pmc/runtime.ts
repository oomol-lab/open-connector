import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { combineProviderActionHandlers, ProviderRequestError } from "../provider-runtime.ts";
import { requestEuropePmcObject, requestEuropePmcText } from "./request.ts";
import { europePmcAnnotationActionHandlers } from "./runtime-annotations.ts";
import { europePmcGrantActionHandlers } from "./runtime-grants.ts";

const defaultPage = 1;
const defaultPageSize = 25;
const defaultResultType = "lite";

type EuropePmcActionHandler = (input: Record<string, unknown>, fetcher: typeof fetch) => Promise<unknown>;

export const europePmcActionHandlers: ProviderActionHandlers<"europe_pmc", EuropePmcActionHandler> =
  combineProviderActionHandlers<"europe_pmc", EuropePmcActionHandler>("europe_pmc", {
    async search_publications(input, fetcher) {
      const payload = await requestEuropePmcObject({
        path: "/search",
        params: {
          query: readRequiredString(input.query, "query"),
          resultType: readOptionalString(input.resultType) ?? defaultResultType,
          synonym: readOptionalBooleanString(input.synonym),
          cursorMark: readOptionalString(input.cursorMark),
          pageSize: readOptionalIntegerString(input.pageSize),
          sort: readOptionalString(input.sort),
          format: "json",
        },
        fetcher,
      });
      const rawResults = readNestedRecordArray(payload.resultList, "result");

      return {
        version: readNullableString(payload.version),
        hitCount: readNonNegativeInteger(payload.hitCount, "hitCount"),
        nextCursorMark: readNullableString(payload.nextCursorMark),
        publications: rawResults.map(normalizePublication),
        request: optionalRecord(payload.request) ?? {},
        rawResults,
      };
    },

    async get_publication(input, fetcher) {
      const source = readRequiredString(input.source, "source");
      const id = readRequiredString(input.id, "id");
      const payload = await requestEuropePmcObject({
        path: `/article/${encodeURIComponent(source)}/${encodeURIComponent(id)}`,
        params: {
          resultType: readOptionalString(input.resultType) ?? "core",
          format: "json",
        },
        fetcher,
      });
      const rawPublication = optionalRecord(payload.result);
      const publication =
        rawPublication && readOptionalString(rawPublication.id) && readOptionalString(rawPublication.source)
          ? normalizePublication(rawPublication)
          : null;

      return {
        found: publication != null,
        version: readNullableString(payload.version),
        publication,
        request: optionalRecord(payload.request) ?? {},
      };
    },

    async get_references(input, fetcher) {
      return getRelatedPublications("references", input, fetcher);
    },

    async get_citations(input, fetcher) {
      return getRelatedPublications("citations", input, fetcher);
    },

    async get_data_links(input, fetcher) {
      const source = readRequiredString(input.source, "source");
      const id = readRequiredString(input.id, "id");
      const payload = await requestEuropePmcObject({
        path: `/${encodeURIComponent(source)}/${encodeURIComponent(id)}/datalinks`,
        params: {
          category: readOptionalString(input.category),
          obtainedBy: readOptionalString(input.obtainedBy),
          fromDate: readOptionalString(input.fromDate),
          tags: readOptionalStringArray(input.tags)?.join(","),
          sectionLimit: readOptionalIntegerString(input.sectionLimit),
          format: "json",
        },
        fetcher,
      });
      const dataLinkList = optionalRecord(payload.dataLinkList) ?? {};

      return {
        version: readNullableString(payload.version),
        hitCount: readNonNegativeInteger(payload.hitCount, "hitCount"),
        categories: readRecordArray(dataLinkList.Category),
        request: optionalRecord(payload.request) ?? {},
        raw: payload,
      };
    },

    async get_full_text_xml(input, fetcher) {
      const pmcid = readRequiredString(input.pmcid, "pmcid");
      const response = await requestEuropePmcText({
        path: `/${encodeURIComponent(pmcid)}/fullTextXML`,
        accept: "application/xml, text/xml",
        fetcher,
      });

      if (!response.body.includes("<article")) {
        throw new ProviderRequestError(502, "Europe PMC returned malformed full text XML");
      }

      return {
        pmcid,
        contentType: response.contentType,
        contentLength: response.body.length,
        xml: response.body,
      };
    },
    async get_evaluations(input, fetcher) {
      const source = readRequiredString(input.source, "source");
      const id = readRequiredString(input.id, "id");
      const payload = await requestEuropePmcObject({
        path: `/evaluations/${encodeURIComponent(source)}/${encodeURIComponent(id)}`,
        params: { format: "json" },
        fetcher,
      });
      const rawEvaluations = readNestedRecordArray(payload.evaluationList, "evaluation");

      return {
        version: readNullableString(payload.version),
        evaluations: rawEvaluations.map(normalizeEvaluation),
        rawEvaluations,
      };
    },
    async check_article_status(input, fetcher) {
      const ids = readArticleIds(input.ids);
      const payload = await requestEuropePmcObject({
        path: "/status-update-search",
        params: { format: "json" },
        method: "POST",
        jsonBody: { ids },
        fetcher,
      });
      const rawUpdates = readRecordArray(payload.articlesWithStatusUpdate);

      return {
        metrics: optionalRecord(payload.metrics) ?? {},
        updates: rawUpdates.map(normalizeArticleStatusUpdate),
        rawUpdates,
      };
    },
    ...europePmcAnnotationActionHandlers,
    ...europePmcGrantActionHandlers,
  });

async function getRelatedPublications(
  relation: "citations" | "references",
  input: Record<string, unknown>,
  fetcher: typeof fetch,
) {
  const source = readRequiredString(input.source, "source");
  const id = readRequiredString(input.id, "id");
  const page = readOptionalInteger(input.page) ?? defaultPage;
  const pageSize = readOptionalInteger(input.pageSize) ?? defaultPageSize;
  const payload = await requestEuropePmcObject({
    path: `/${encodeURIComponent(source)}/${encodeURIComponent(id)}/${relation}`,
    params: {
      page: String(page),
      pageSize: String(pageSize),
      format: "json",
    },
    fetcher,
  });
  const listKey = relation === "references" ? "referenceList" : "citationList";
  const itemKey = relation === "references" ? "reference" : "citation";
  const rawResults = readNestedRecordArray(payload[listKey], itemKey);

  return {
    version: readNullableString(payload.version),
    hitCount: readNonNegativeInteger(payload.hitCount, "hitCount"),
    page,
    pageSize,
    [relation]: rawResults.map(normalizeRelatedPublication),
    request: optionalRecord(payload.request) ?? {},
    rawResults,
  };
}

function normalizePublication(raw: Record<string, unknown>) {
  const id = readRequiredResponseString(raw.id, "publication id");
  const source = readRequiredResponseString(raw.source, "publication source");
  const journalInfo = optionalRecord(raw.journalInfo);
  const journal = optionalRecord(journalInfo?.journal);

  return {
    id,
    source,
    pmid: readNullableString(raw.pmid),
    pmcid: readNullableString(raw.pmcid),
    doi: readNullableString(raw.doi),
    title: readNullableString(raw.title),
    authorString: readNullableString(raw.authorString),
    journalTitle: readNullableString(journal?.title),
    journalAbbreviation:
      readNullableString(journal?.medlineAbbreviation) ?? readNullableString(journal?.isoabbreviation),
    publicationYear: readNullableInteger(raw.pubYear) ?? readNullableInteger(journalInfo?.yearOfPublication),
    publicationDate:
      readNullableString(raw.firstPublicationDate) ??
      readNullableString(journalInfo?.printPublicationDate) ??
      readNullableString(raw.electronicPublicationDate),
    abstractText: readNullableString(raw.abstractText),
    citedByCount: readNullableInteger(raw.citedByCount),
    isOpenAccess: readNullableYesNo(raw.isOpenAccess),
    hasFullText: readNullableYesNo(raw.inEPMC),
    hasReferences: readNullableYesNo(raw.hasReferences),
    europePmcUrl: `https://europepmc.org/article/${encodeURIComponent(source)}/${encodeURIComponent(id)}`,
    raw,
  };
}

function normalizeRelatedPublication(raw: Record<string, unknown>) {
  return {
    id: readNullableString(raw.id),
    source: readNullableString(raw.source),
    citationType: readNullableString(raw.citationType),
    title: readNullableString(raw.title),
    authorString: readNullableString(raw.authorString),
    journalAbbreviation: readNullableString(raw.journalAbbreviation),
    publicationYear: readNullableInteger(raw.pubYear),
    volume: readNullableString(raw.volume),
    issue: readNullableString(raw.issue),
    pageInfo: readNullableString(raw.pageInfo),
    citedByCount: readNullableInteger(raw.citedByCount),
    citedOrder: readNullableInteger(raw.citedOrder),
    matched: readNullableYesNo(raw.match),
    raw,
  };
}

function normalizeEvaluation(raw: Record<string, unknown>) {
  const evaluatorsList = optionalRecord(raw.evaluatorsList);
  return {
    id: readNullableInteger(raw.id),
    title: readNullableString(raw.title),
    doi: readNullableString(raw.doi),
    url: readNullableString(raw.url),
    dataOrigin: readNullableString(raw.dataOrigin),
    platform: readNullableString(raw.platform),
    type: readNullableString(raw.type),
    evaluationDate: readNullableString(raw.evaluationDate),
    dateUpdated: readNullableString(raw.dateUpdated),
    evaluators: readRecordArray(evaluatorsList?.evaluator),
    raw,
  };
}

function normalizeArticleStatusUpdate(raw: Record<string, unknown>) {
  return {
    source: readNullableString(raw.src),
    externalId: readNullableString(raw.extId),
    title: readNullableString(raw.title),
    firstPublicationDate: readNullableString(raw.firstPublishDate),
    statusUpdates: readOptionalStringArray(raw.statusUpdates) ?? [],
    links: readRecordArray(raw.links),
    raw,
  };
}

function readArticleIds(value: unknown) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "ids is required");
  }
  return value.map((item) => {
    const record = optionalRecord(item);
    return {
      src: readRequiredString(record?.source, "ids.source"),
      extId: readRequiredString(record?.id, "ids.id"),
    };
  });
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

function readOptionalInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function readOptionalIntegerString(value: unknown) {
  const parsed = readOptionalInteger(value);
  return parsed == null ? undefined : String(parsed);
}

function readNonNegativeInteger(value: unknown, fieldName: string) {
  const parsed = readNullableInteger(value);
  if (parsed == null || parsed < 0) {
    throw new ProviderRequestError(502, `Europe PMC returned an invalid ${fieldName}`);
  }
  return parsed;
}

function readNullableInteger(value: unknown) {
  const parsed = readOptionalInteger(value);
  if (parsed != null) {
    return parsed;
  }
  const stringValue = readOptionalString(value);
  if (!stringValue) {
    return null;
  }
  const numberValue = Number(stringValue);
  return Number.isInteger(numberValue) ? numberValue : null;
}

function readOptionalBooleanString(value: unknown) {
  if (value === true) {
    return "Y";
  }
  if (value === false) {
    return "N";
  }
  return undefined;
}

function readNullableYesNo(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }
  const stringValue = readOptionalString(value)?.toUpperCase();
  if (stringValue === "Y" || stringValue === "YES" || stringValue === "TRUE") {
    return true;
  }
  if (stringValue === "N" || stringValue === "NO" || stringValue === "FALSE") {
    return false;
  }
  return null;
}

function readOptionalStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.map(readOptionalString).filter((item): item is string => item != null);
  return items.length > 0 ? items : undefined;
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

function readNestedRecordArray(value: unknown, key: string) {
  const record = optionalRecord(value);
  return readRecordArray(record?.[key]);
}
