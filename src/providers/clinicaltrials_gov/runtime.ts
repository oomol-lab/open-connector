import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { createProviderTimeout, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const clinicalTrialsGovApiBaseUrl = "https://clinicaltrials.gov/api/v2";

const requestTimeoutMs = 30_000;
const maxResponseBytes = 16 * 1024 * 1024;
const maxBatchIdsPerRequest = 100;
const maxRequestUrlBytes = 7_000;
const maxRedirects = 3;
const studySummaryFields = [
  "NCTId",
  "BriefTitle",
  "OfficialTitle",
  "OverallStatus",
  "StudyType",
  "Phase",
  "Condition",
  "InterventionType",
  "InterventionName",
  "LeadSponsorName",
  "HasResults",
] as const;

type ActionHandler = (input: Record<string, unknown>, fetcher: typeof fetch) => Promise<unknown>;
type ResponseBudget = { consumedBytes: number; maxBytes: number };

export const clinicalTrialsGovActionHandlers: ProviderActionHandlers<"clinicaltrials_gov", ActionHandler> = {
  search_studies(input, fetcher) {
    return searchStudies(input, fetcher);
  },
  get_study(input, fetcher) {
    return getStudy(input, fetcher);
  },
  get_studies_by_nct_ids(input, fetcher) {
    return getStudiesByNctIds(input, fetcher);
  },
  get_study_eligibility(input, fetcher) {
    return getStudyEligibility(input, fetcher);
  },
  get_study_locations(input, fetcher) {
    return getStudyLocations(input, fetcher);
  },
  get_study_results(input, fetcher) {
    return getStudyResults(input, fetcher);
  },
  get_study_documents(input, fetcher) {
    return getStudyDocuments(input, fetcher);
  },
  get_study_metadata(input, fetcher) {
    return getStudyMetadata(input, fetcher);
  },
  list_search_areas(_input, fetcher) {
    return listSearchAreas(fetcher);
  },
  list_enums(_input, fetcher) {
    return listEnums(fetcher);
  },
  get_registry_size_statistics(_input, fetcher) {
    return getRegistrySizeStatistics(fetcher);
  },
  get_field_value_statistics(input, fetcher) {
    return getFieldValueStatistics(input, fetcher);
  },
  get_list_field_size_statistics(input, fetcher) {
    return getListFieldSizeStatistics(input, fetcher);
  },
  get_api_version(_input, fetcher) {
    return getApiVersion(fetcher);
  },
} satisfies Record<string, ActionHandler>;

async function searchStudies(input: Record<string, unknown>, fetcher: typeof fetch) {
  assertFiltersAreNotIgnored(input);
  const query = new URLSearchParams();
  setOptionalString(query, "query.cond", input.conditionQuery);
  setOptionalString(query, "query.term", input.termQuery);
  setOptionalString(query, "query.locn", input.locationQuery);
  setOptionalString(query, "query.titles", input.titleQuery);
  setOptionalString(query, "query.intr", input.interventionQuery);
  setOptionalString(query, "query.outc", input.outcomeQuery);
  setOptionalString(query, "query.spons", input.sponsorQuery);
  setOptionalString(query, "query.lead", input.leadSponsorQuery);
  setOptionalString(query, "query.id", input.idQuery);
  setOptionalString(query, "query.patient", input.patientQuery);
  setOptionalString(query, "filter.advanced", input.advancedFilter);
  setOptionalString(query, "pageToken", input.pageToken);
  setOptionalString(query, "markupFormat", input.markupFormat);

  const statuses = readOptionalStringArray(input.overallStatuses, "overallStatuses");
  if (statuses) {
    query.set("filter.overallStatus", statuses.join("|"));
  }

  const nctIds = readOptionalStringArray(input.nctIds, "nctIds");
  if (nctIds) {
    query.set("filter.ids", nctIds.map(normalizeNctId).join("|"));
  }

  const geo = optionalRecord(input.geo);
  if (geo) {
    query.set(
      "filter.geo",
      `distance(${formatDecimalNumber(readNumber(geo.latitude, "geo.latitude"))},${formatDecimalNumber(
        readNumber(geo.longitude, "geo.longitude"),
      )},${formatDecimalNumber(readNumber(geo.distance, "geo.distance"))}${readOptionalString(geo.unit) ?? "km"})`,
    );
  }

  query.set("fields", buildStudyFields(input.fields).join("|"));

  const sort = readOptionalRecordArray(input.sort, "sort");
  if (sort) {
    query.set(
      "sort",
      sort
        .map((item, index) => {
          const field = readRequiredString(item.field, `sort[${index}].field`);
          const direction = readOptionalString(item.direction);
          return direction ? `${field}:${direction}` : field;
        })
        .join("|"),
    );
  }

  if (typeof input.countTotal === "boolean") {
    query.set("countTotal", String(input.countTotal));
  }
  if (typeof input.pageSize === "number") {
    query.set("pageSize", String(input.pageSize));
  }

  const payload = requireRecord(await requestJson("/studies", query, fetcher), "ClinicalTrials.gov studies response");
  const rawStudies = requireArray(payload.studies, "ClinicalTrials.gov studies response studies");
  const studies = rawStudies.map((study, index) =>
    normalizeStudy(requireRecord(study, `ClinicalTrials.gov studies response studies[${index}]`)),
  );

  return {
    studies,
    count: studies.length,
    totalCount: readOptionalInteger(payload.totalCount) ?? null,
    nextPageToken: readOptionalString(payload.nextPageToken) ?? null,
  };
}

async function getStudy(input: Record<string, unknown>, fetcher: typeof fetch) {
  const nctId = normalizeNctId(readRequiredString(input.nctId, "nctId"));
  const query = new URLSearchParams({
    fields: buildStudyFields(input.fields).join("|"),
  });
  setOptionalString(query, "markupFormat", input.markupFormat);

  const payload = await requestJson(`/studies/${encodeURIComponent(nctId)}`, query, fetcher, true);
  if (payload === null) {
    return { found: false, study: null };
  }

  return {
    found: true,
    study: normalizeStudy(requireRecord(payload, "ClinicalTrials.gov study response")),
  };
}

async function getStudiesByNctIds(input: Record<string, unknown>, fetcher: typeof fetch) {
  const requestedNctIds = [
    ...new Set(requireStringArray(input.nctIds, "nctIds").map((nctId) => normalizeNctId(nctId))),
  ];
  const fields = buildStudyFields([...(readOptionalStringArray(input.fields, "fields") ?? []), "NCTIdAlias"]);
  const rawStudies = await requestStudyBatches(requestedNctIds, fields, input.markupFormat, fetcher);
  const studyByRequestedId = new Map<string, Record<string, unknown>>();

  for (const rawStudy of rawStudies) {
    const identification = getStudyIdentification(rawStudy);
    const canonicalNctId = normalizeNctId(readRequiredString(identification.nctId, "ClinicalTrials.gov nctId"));
    studyByRequestedId.set(canonicalNctId, rawStudy);
    for (const alias of readOptionalStringArray(identification.nctIdAliases, "ClinicalTrials.gov nctIdAliases") ?? []) {
      studyByRequestedId.set(normalizeNctId(alias), rawStudy);
    }
  }

  const studies: ReturnType<typeof normalizeStudy>[] = [];
  const foundNctIds: string[] = [];
  const notFoundNctIds: string[] = [];
  const addedCanonicalIds = new Set<string>();
  for (const requestedNctId of requestedNctIds) {
    const rawStudy = studyByRequestedId.get(requestedNctId);
    if (!rawStudy) {
      notFoundNctIds.push(requestedNctId);
      continue;
    }
    const study = normalizeStudy(rawStudy);
    if (!addedCanonicalIds.has(study.nctId)) {
      studies.push(study);
      foundNctIds.push(study.nctId);
      addedCanonicalIds.add(study.nctId);
    }
  }

  return { studies, foundNctIds, notFoundNctIds, count: studies.length };
}

async function getStudyEligibility(input: Record<string, unknown>, fetcher: typeof fetch) {
  const nctId = normalizeNctId(readRequiredString(input.nctId, "nctId"));
  const payload = await requestStudyView(
    nctId,
    ["NCTId", "BriefTitle", "OverallStatus", "EligibilityModule"],
    input.markupFormat,
    fetcher,
  );
  if (!payload) {
    return { found: false, nctId, briefTitle: null, overallStatus: null, eligibility: null };
  }

  const identity = getStudyIdentity(payload);
  const protocol = requireRecord(payload.protocolSection, "ClinicalTrials.gov protocolSection");
  const rawEligibility = optionalRecord(protocol.eligibilityModule);
  return {
    found: true,
    nctId: identity.nctId,
    briefTitle: identity.briefTitle,
    overallStatus: identity.overallStatus,
    eligibility: rawEligibility
      ? {
          criteria: readOptionalString(rawEligibility.eligibilityCriteria) ?? null,
          healthyVolunteers: readOptionalBoolean(rawEligibility.healthyVolunteers) ?? null,
          sex: readOptionalString(rawEligibility.sex) ?? null,
          genderBased: readOptionalBoolean(rawEligibility.genderBased) ?? null,
          genderDescription: readOptionalString(rawEligibility.genderDescription) ?? null,
          minimumAge: readOptionalString(rawEligibility.minimumAge) ?? null,
          maximumAge: readOptionalString(rawEligibility.maximumAge) ?? null,
          standardAges: readOptionalStringArray(rawEligibility.stdAges, "ClinicalTrials.gov stdAges") ?? [],
          studyPopulation: readOptionalString(rawEligibility.studyPopulation) ?? null,
          samplingMethod: readOptionalString(rawEligibility.samplingMethod) ?? null,
          raw: rawEligibility,
        }
      : null,
  };
}

async function getStudyLocations(input: Record<string, unknown>, fetcher: typeof fetch) {
  const nctId = normalizeNctId(readRequiredString(input.nctId, "nctId"));
  const payload = await requestStudyView(
    nctId,
    ["NCTId", "BriefTitle", "OverallStatus", "ContactsLocationsModule"],
    undefined,
    fetcher,
  );
  if (!payload) {
    return {
      found: false,
      nctId,
      briefTitle: null,
      overallStatus: null,
      centralContacts: [],
      overallOfficials: [],
      locations: [],
    };
  }

  const identity = getStudyIdentity(payload);
  const protocol = requireRecord(payload.protocolSection, "ClinicalTrials.gov protocolSection");
  const contactsLocations = optionalRecord(protocol.contactsLocationsModule);
  return {
    found: true,
    nctId: identity.nctId,
    briefTitle: identity.briefTitle,
    overallStatus: identity.overallStatus,
    centralContacts: (
      readOptionalRecordArray(contactsLocations?.centralContacts, "ClinicalTrials.gov centralContacts") ?? []
    ).map(normalizeContact),
    overallOfficials: (
      readOptionalRecordArray(contactsLocations?.overallOfficials, "ClinicalTrials.gov overallOfficials") ?? []
    ).map((official) => ({
      name: readOptionalString(official.name) ?? null,
      affiliation: readOptionalString(official.affiliation) ?? null,
      role: readOptionalString(official.role) ?? null,
      raw: official,
    })),
    locations: (readOptionalRecordArray(contactsLocations?.locations, "ClinicalTrials.gov locations") ?? []).map(
      (location) => {
        const rawGeoPoint = optionalRecord(location.geoPoint);
        const latitude = readOptionalNumber(rawGeoPoint?.lat);
        const longitude = readOptionalNumber(rawGeoPoint?.lon);
        return {
          facility: readOptionalString(location.facility) ?? null,
          status: readOptionalString(location.status) ?? null,
          city: readOptionalString(location.city) ?? null,
          state: readOptionalString(location.state) ?? null,
          postalCode: readOptionalString(location.zip) ?? null,
          country: readOptionalString(location.country) ?? null,
          contacts: (readOptionalRecordArray(location.contacts, "ClinicalTrials.gov location contacts") ?? []).map(
            normalizeContact,
          ),
          geoPoint: latitude !== undefined && longitude !== undefined ? { latitude, longitude } : null,
          raw: location,
        };
      },
    ),
  };
}

async function getStudyResults(input: Record<string, unknown>, fetcher: typeof fetch) {
  const nctId = normalizeNctId(readRequiredString(input.nctId, "nctId"));
  const payload = await requestStudyView(
    nctId,
    ["NCTId", "BriefTitle", "HasResults", "ResultsSection"],
    input.markupFormat,
    fetcher,
  );
  if (!payload) {
    return { found: false, nctId, briefTitle: null, hasResults: null, results: null };
  }

  const identity = getStudyIdentity(payload);
  return {
    found: true,
    nctId: identity.nctId,
    briefTitle: identity.briefTitle,
    hasResults: readOptionalBoolean(payload.hasResults) ?? null,
    results: optionalRecord(payload.resultsSection) ?? null,
  };
}

async function getStudyDocuments(input: Record<string, unknown>, fetcher: typeof fetch) {
  const nctId = normalizeNctId(readRequiredString(input.nctId, "nctId"));
  const payload = await requestStudyView(nctId, ["NCTId", "BriefTitle", "LargeDocumentModule"], undefined, fetcher);
  if (!payload) {
    return {
      found: false,
      nctId,
      briefTitle: null,
      noStatisticalAnalysisPlan: null,
      documents: [],
    };
  }

  const identity = getStudyIdentity(payload);
  const documentSection = optionalRecord(payload.documentSection);
  const documentModule = optionalRecord(documentSection?.largeDocumentModule);
  const documents = (readOptionalRecordArray(documentModule?.largeDocs, "ClinicalTrials.gov largeDocs") ?? []).map(
    (document) => {
      return {
        type: readOptionalString(document.typeAbbrev) ?? null,
        label: readOptionalString(document.label) ?? null,
        documentDate: readOptionalString(document.date) ?? null,
        uploadDate: readOptionalString(document.uploadDate) ?? null,
        filename: readOptionalString(document.filename) ?? null,
        sizeBytes: readOptionalInteger(document.size) ?? null,
        hasProtocol: readOptionalBoolean(document.hasProtocol) ?? null,
        hasStatisticalAnalysisPlan: readOptionalBoolean(document.hasSap) ?? null,
        hasInformedConsentForm: readOptionalBoolean(document.hasIcf) ?? null,
        raw: document,
      };
    },
  );
  return {
    found: true,
    nctId: identity.nctId,
    briefTitle: identity.briefTitle,
    noStatisticalAnalysisPlan: readOptionalBoolean(documentModule?.noSap) ?? null,
    documents,
  };
}

async function getStudyMetadata(input: Record<string, unknown>, fetcher: typeof fetch) {
  const query = new URLSearchParams();
  if (typeof input.includeIndexedOnly === "boolean") {
    query.set("includeIndexedOnly", String(input.includeIndexedOnly));
  }
  if (typeof input.includeHistoricOnly === "boolean") {
    query.set("includeHistoricOnly", String(input.includeHistoricOnly));
  }
  const fields = requireRecordArray(
    await requestJson("/studies/metadata", query, fetcher),
    "ClinicalTrials.gov study metadata response",
  );
  return { fields, count: fields.length };
}

async function listSearchAreas(fetcher: typeof fetch) {
  const documents = requireRecordArray(
    await requestJson("/studies/search-areas", new URLSearchParams(), fetcher),
    "ClinicalTrials.gov search areas response",
  );
  return { documents, count: documents.length };
}

async function listEnums(fetcher: typeof fetch) {
  const rawEnums = requireRecordArray(
    await requestJson("/studies/enums", new URLSearchParams(), fetcher),
    "ClinicalTrials.gov enums response",
  );
  const enums = rawEnums.map((item, index) => ({
    type: readRequiredString(item.type, `ClinicalTrials.gov enums[${index}].type`),
    pieces: requireStringArray(item.pieces, `ClinicalTrials.gov enums[${index}].pieces`),
    values: requireRecordArray(item.values, `ClinicalTrials.gov enums[${index}].values`).map((value, valueIndex) => ({
      value: readRequiredString(value.value, `ClinicalTrials.gov enums[${index}].values[${valueIndex}].value`),
      legacyValue: readRequiredString(
        value.legacyValue,
        `ClinicalTrials.gov enums[${index}].values[${valueIndex}].legacyValue`,
      ),
      ...(optionalRecord(value.exceptions) ? { exceptions: optionalRecord(value.exceptions) } : {}),
    })),
  }));
  return { enums, count: enums.length };
}

async function getRegistrySizeStatistics(fetcher: typeof fetch) {
  return requireRecord(
    await requestJson("/stats/size", new URLSearchParams(), fetcher),
    "ClinicalTrials.gov registry size statistics response",
  );
}

async function getFieldValueStatistics(input: Record<string, unknown>, fetcher: typeof fetch) {
  const query = new URLSearchParams();
  setOptionalArray(query, "types", input.types, "types");
  setOptionalArray(query, "fields", input.fields, "fields");
  const statistics = requireRecordArray(
    await requestJson("/stats/field/values", query, fetcher),
    "ClinicalTrials.gov field value statistics response",
  );
  return { statistics, count: statistics.length };
}

async function getListFieldSizeStatistics(input: Record<string, unknown>, fetcher: typeof fetch) {
  const query = new URLSearchParams();
  setOptionalArray(query, "fields", input.fields, "fields");
  const statistics = requireRecordArray(
    await requestJson("/stats/field/sizes", query, fetcher),
    "ClinicalTrials.gov list field size statistics response",
  );
  return { statistics, count: statistics.length };
}

async function getApiVersion(fetcher: typeof fetch) {
  const payload = requireRecord(
    await requestJson("/version", new URLSearchParams(), fetcher),
    "ClinicalTrials.gov version response",
  );
  return {
    apiVersion: readRequiredString(payload.apiVersion, "ClinicalTrials.gov apiVersion"),
    dataTimestamp: readOptionalString(payload.dataTimestamp) ?? null,
  };
}

async function requestStudyView(
  nctId: string,
  fields: readonly string[],
  markupFormat: unknown,
  fetcher: typeof fetch,
) {
  const query = new URLSearchParams({ fields: fields.join("|") });
  setOptionalString(query, "markupFormat", markupFormat);
  const payload = await requestJson(`/studies/${encodeURIComponent(nctId)}`, query, fetcher, true);
  return payload === null ? null : requireRecord(payload, `ClinicalTrials.gov ${nctId} study response`);
}

async function requestStudyBatches(
  nctIds: readonly string[],
  fields: readonly string[],
  markupFormat: unknown,
  fetcher: typeof fetch,
) {
  const studies: Record<string, unknown>[] = [];
  const responseBudget: ResponseBudget = { consumedBytes: 0, maxBytes: maxResponseBytes };
  const deadlineAt = Date.now() + requestTimeoutMs;
  for (let start = 0; start < nctIds.length; start += maxBatchIdsPerRequest) {
    const remainingTimeMs = deadlineAt - Date.now();
    if (remainingTimeMs <= 0) {
      throw requestTimeoutError();
    }
    const batch = nctIds.slice(start, start + maxBatchIdsPerRequest);
    studies.push(...(await requestStudyBatch(batch, fields, markupFormat, fetcher, responseBudget, remainingTimeMs)));
  }
  return studies;
}

async function requestStudyBatch(
  nctIds: readonly string[],
  fields: readonly string[],
  markupFormat: unknown,
  fetcher: typeof fetch,
  responseBudget: ResponseBudget,
  timeoutMs: number,
): Promise<Record<string, unknown>[]> {
  const query = new URLSearchParams({
    "filter.ids": nctIds.join("|"),
    fields: fields.join("|"),
    pageSize: String(nctIds.length),
  });
  setOptionalString(query, "markupFormat", markupFormat);

  const payload = requireRecord(
    await requestJson("/studies", query, fetcher, false, responseBudget, timeoutMs),
    "ClinicalTrials.gov batch studies response",
  );
  return requireRecordArray(payload.studies, "ClinicalTrials.gov batch studies response studies");
}

async function requestJson(
  path: string,
  query: URLSearchParams,
  fetcher: typeof fetch,
  allowNotFound = false,
  responseBudget?: ResponseBudget,
  timeoutMs = requestTimeoutMs,
) {
  const url = new URL(`${clinicalTrialsGovApiBaseUrl}${path}`);
  url.search = query.toString();
  assertRequestUrlWithinLimit(url);
  const timeout = createProviderTimeout(undefined, timeoutMs);

  try {
    const response = await fetchWithOfficialRedirects(
      url,
      {
        method: "GET",
        headers: {
          accept: "application/json",
          "user-agent": providerUserAgent,
        },
        signal: timeout.signal,
      },
      fetcher,
    );
    const body = await readBoundedResponseText(response, responseBudget);

    if (allowNotFound && response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw mapResponseError(response.status, body);
    }
    if (!body) {
      throw new ProviderRequestError(502, "ClinicalTrials.gov returned an empty response");
    }

    try {
      return JSON.parse(body) as unknown;
    } catch {
      throw new ProviderRequestError(502, "ClinicalTrials.gov returned malformed JSON");
    }
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    const didTimeout = timeout.didTimeout();
    const message = didTimeout
      ? "ClinicalTrials.gov request timed out"
      : error instanceof Error
        ? `ClinicalTrials.gov request failed: ${error.message}`
        : "ClinicalTrials.gov request failed";
    throw new ProviderRequestError(didTimeout ? 504 : 502, message);
  } finally {
    timeout.cleanup();
  }
}

async function fetchWithOfficialRedirects(initialUrl: URL, init: RequestInit, fetcher: typeof fetch) {
  const originalSearch = initialUrl.search;
  let url = initialUrl;
  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const response = await fetcher(url, { ...init, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return response;
    }

    const location = response.headers.get("location");
    if (!location || redirectCount === maxRedirects) {
      await response.body?.cancel().catch(() => {});
      throw new ProviderRequestError(502, "ClinicalTrials.gov returned an invalid or excessive redirect");
    }

    const redirectedUrl = new URL(location, url);
    if (!isAllowedApiUrl(redirectedUrl)) {
      await response.body?.cancel().catch(() => {});
      throw new ProviderRequestError(502, "ClinicalTrials.gov redirected outside the official /api/v2 boundary");
    }
    const originalParams = new URLSearchParams(originalSearch);
    for (const [key, value] of originalParams) {
      if (!redirectedUrl.searchParams.has(key)) {
        redirectedUrl.searchParams.append(key, value);
      }
    }
    assertRequestUrlWithinLimit(redirectedUrl);
    await response.body?.cancel().catch(() => {});
    url = redirectedUrl;
  }
  throw new ProviderRequestError(502, "ClinicalTrials.gov redirect failed");
}

function isAllowedApiUrl(url: URL) {
  return (
    url.origin === "https://clinicaltrials.gov" && (url.pathname === "/api/v2" || url.pathname.startsWith("/api/v2/"))
  );
}

async function readBoundedResponseText(response: Response, responseBudget?: ResponseBudget) {
  const contentLength = response.headers.get("content-length");
  if (contentLength) {
    const parsed = Number(contentLength);
    const exceedsActionBudget = responseBudget && parsed > responseBudget.maxBytes - responseBudget.consumedBytes;
    if (Number.isFinite(parsed) && (parsed > maxResponseBytes || exceedsActionBudget)) {
      await response.body?.cancel().catch(() => {});
      throw responseTooLargeError();
    }
  }

  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      totalBytes += chunk.value.byteLength;
      if (
        totalBytes > maxResponseBytes ||
        (responseBudget && responseBudget.consumedBytes + totalBytes > responseBudget.maxBytes)
      ) {
        await reader.cancel().catch(() => {});
        throw responseTooLargeError();
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (responseBudget) {
    responseBudget.consumedBytes += totalBytes;
  }
  return new TextDecoder().decode(bytes);
}

function responseTooLargeError(): ProviderRequestError {
  return new ProviderRequestError(
    502,
    `ClinicalTrials.gov response exceeds ${maxResponseBytes} bytes; reduce pageSize, identifiers, or requested fields`,
    { reason: "response_too_large" },
  );
}

function requestTimeoutError(): ProviderRequestError {
  return new ProviderRequestError(504, "ClinicalTrials.gov request timed out");
}

function mapResponseError(status: number, body: string) {
  const message = body.trim().slice(0, 4_096) || `ClinicalTrials.gov request failed with status ${status}`;
  if (status === 400 || status === 404) {
    return new ProviderRequestError(400, message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(10, message, status || 502);
}

function normalizeStudy(raw: Record<string, unknown>) {
  const protocol = requireRecord(raw.protocolSection, "ClinicalTrials.gov protocolSection");
  const identification = getStudyIdentification(raw);
  const nctId = readRequiredString(identification.nctId, "ClinicalTrials.gov nctId");
  const status = optionalRecord(protocol.statusModule);
  const design = optionalRecord(protocol.designModule);
  const conditions = optionalRecord(protocol.conditionsModule);
  const interventionsModule = optionalRecord(protocol.armsInterventionsModule);
  const sponsors = optionalRecord(protocol.sponsorCollaboratorsModule);
  const leadSponsor = optionalRecord(sponsors?.leadSponsor);
  const rawInterventions = readOptionalRecordArray(
    interventionsModule?.interventions,
    "ClinicalTrials.gov interventions",
  );

  return {
    nctId,
    briefTitle: readRequiredString(identification.briefTitle, "ClinicalTrials.gov briefTitle"),
    officialTitle: readOptionalString(identification.officialTitle) ?? null,
    overallStatus: readOptionalString(status?.overallStatus) ?? null,
    studyType: readOptionalString(design?.studyType) ?? null,
    phases: readOptionalStringArray(design?.phases, "ClinicalTrials.gov phases") ?? [],
    conditions: readOptionalStringArray(conditions?.conditions, "ClinicalTrials.gov conditions") ?? [],
    interventions: (rawInterventions ?? []).map((intervention, index) => ({
      name: readRequiredString(intervention.name, `ClinicalTrials.gov interventions[${index}].name`),
      type: readOptionalString(intervention.type) ?? null,
      raw: intervention,
    })),
    leadSponsor: readOptionalString(leadSponsor?.name) ?? null,
    hasResults: readRequiredBoolean(raw.hasResults, "ClinicalTrials.gov hasResults"),
    studyUrl: `https://clinicaltrials.gov/study/${encodeURIComponent(nctId)}`,
    raw,
  };
}

function getStudyIdentification(raw: Record<string, unknown>) {
  const protocol = requireRecord(raw.protocolSection, "ClinicalTrials.gov protocolSection");
  return requireRecord(protocol.identificationModule, "ClinicalTrials.gov identificationModule");
}

function getStudyIdentity(raw: Record<string, unknown>) {
  const protocol = requireRecord(raw.protocolSection, "ClinicalTrials.gov protocolSection");
  const identification = getStudyIdentification(raw);
  const status = optionalRecord(protocol.statusModule);
  return {
    nctId: normalizeNctId(readRequiredString(identification.nctId, "ClinicalTrials.gov nctId")),
    briefTitle: readRequiredString(identification.briefTitle, "ClinicalTrials.gov briefTitle"),
    overallStatus: readOptionalString(status?.overallStatus) ?? null,
  };
}

function normalizeContact(contact: Record<string, unknown>) {
  return {
    name: readOptionalString(contact.name) ?? null,
    role: readOptionalString(contact.role) ?? null,
    phone: readOptionalString(contact.phone) ?? null,
    phoneExtension: readOptionalString(contact.phoneExt) ?? null,
    email: readOptionalString(contact.email) ?? null,
    raw: contact,
  };
}

function buildStudyFields(value: unknown) {
  const fields = new Set<string>(studySummaryFields);
  for (const field of readOptionalStringArray(value, "fields") ?? []) {
    fields.add(field);
  }
  return [...fields];
}

function normalizeNctId(value: string) {
  const numericId = Number.parseInt(value.slice(3));
  return `NCT${String(numericId).padStart(8, "0")}`;
}

function assertRequestUrlWithinLimit(url: URL) {
  if (new TextEncoder().encode(url.href).byteLength > maxRequestUrlBytes) {
    throw new ProviderRequestError(
      400,
      "ClinicalTrials.gov request URL is too long; reduce identifiers, fields, or query text, or use get_studies_by_nct_ids for large identifier lists",
    );
  }
}

function assertFiltersAreNotIgnored(input: Record<string, unknown>) {
  const hasFilter =
    input.overallStatuses !== undefined ||
    input.nctIds !== undefined ||
    input.advancedFilter !== undefined ||
    input.geo !== undefined;
  if (!hasFilter) {
    return;
  }

  const queryValues = [
    input.conditionQuery,
    input.termQuery,
    input.locationQuery,
    input.titleQuery,
    input.interventionQuery,
    input.outcomeQuery,
    input.sponsorQuery,
    input.leadSponsorQuery,
    input.idQuery,
    input.patientQuery,
  ];
  if (queryValues.some(isNctIdOnlyQuery)) {
    throw new ProviderRequestError(
      400,
      "ClinicalTrials.gov ignores filters when any query contains only NCT IDs; use nctIds with filters instead",
    );
  }
}

function isNctIdOnlyQuery(value: unknown) {
  const query = readOptionalString(value);
  if (!query) {
    return false;
  }
  const tokens: string[] = [];
  let token = "";
  for (const character of query) {
    if (", \t\n\r\f\v".includes(character)) {
      if (token) {
        tokens.push(token);
        token = "";
      }
      continue;
    }
    token += character;
  }
  if (token) {
    tokens.push(token);
  }
  return tokens.length > 0 && tokens.every(isNctId);
}

function isNctId(value: string) {
  if (value.length < 4 || value.length > 11 || value.slice(0, 3).toUpperCase() !== "NCT") {
    return false;
  }
  const digits = value.slice(3);
  const parsed = Number.parseInt(digits, 10);
  return Number.isInteger(parsed) && parsed > 0 && [...digits].every((digit) => digit >= "0" && digit <= "9");
}

function setOptionalString(query: URLSearchParams, key: string, value: unknown) {
  const resolved = readOptionalString(value);
  if (resolved !== undefined) {
    query.set(key, resolved);
  }
}

function setOptionalArray(query: URLSearchParams, key: string, value: unknown, label: string) {
  const resolved = readOptionalStringArray(value, label);
  if (resolved) {
    query.set(key, resolved.join("|"));
  }
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  const resolved = optionalRecord(value);
  if (!resolved) {
    throw new ProviderRequestError(502, `${label} must be an object`);
  }
  return resolved;
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} must be an array`);
  }
  return value;
}

function requireRecordArray(value: unknown, label: string) {
  return requireArray(value, label).map((item, index) => requireRecord(item, `${label}[${index}]`));
}

function readOptionalRecordArray(value: unknown, label: string) {
  return value === undefined ? undefined : requireRecordArray(value, label);
}

function requireStringArray(value: unknown, label: string) {
  const resolved = readOptionalStringArray(value, label);
  if (!resolved) {
    throw new ProviderRequestError(502, `${label} must be an array`);
  }
  return resolved;
}

function readOptionalStringArray(value: unknown, label: string) {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} must be an array`);
  }
  return value.map((item, index) => readRequiredString(item, `${label}[${index}]`));
}

function readRequiredString(value: unknown, label: string) {
  const resolved = readOptionalString(value);
  if (resolved === undefined) {
    throw new ProviderRequestError(502, `${label} must be a non-empty string`);
  }
  return resolved;
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readRequiredBoolean(value: unknown, label: string) {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `${label} must be a boolean`);
  }
  return value;
}

function readOptionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function readNumber(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ProviderRequestError(502, `${label} must be a finite number`);
  }
  return value;
}

function formatDecimalNumber(value: number) {
  const serialized = String(value);
  const exponentMarkerIndex = Math.max(serialized.indexOf("e"), serialized.indexOf("E"));
  if (exponentMarkerIndex === -1) {
    return serialized;
  }

  const coefficient = serialized.slice(0, exponentMarkerIndex);
  const exponent = Number(serialized.slice(exponentMarkerIndex + 1));
  const negative = coefficient.startsWith("-");
  const unsignedCoefficient = negative ? coefficient.slice(1) : coefficient;
  const pointIndex = unsignedCoefficient.indexOf(".");
  const decimalIndex = (pointIndex === -1 ? unsignedCoefficient.length : pointIndex) + exponent;
  const digits = unsignedCoefficient.replaceAll(".", "");
  let decimal: string;
  if (decimalIndex <= 0) {
    decimal = `0.${"0".repeat(-decimalIndex)}${digits}`;
  } else if (decimalIndex >= digits.length) {
    decimal = `${digits}${"0".repeat(decimalIndex - digits.length)}`;
  } else {
    decimal = `${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
  }
  return negative ? `-${decimal}` : decimal;
}

function readOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readOptionalInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}
