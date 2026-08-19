import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { OAuthProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalNumber, optionalString } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";

export const apaleoApiBaseUrl = "https://api.apaleo.com";

type ApaleoQueryValue = string | number | boolean | Array<string | number> | undefined;

type ApaleoActionContext = OAuthProviderContext;

type ApaleoActionHandler = (input: Record<string, unknown>, context: ApaleoActionContext) => Promise<unknown>;

type ApaleoRequestOptions = {
  path: string;
  accessToken: string;
  fetcher: typeof fetch;
  method?: string;
  query?: Record<string, ApaleoQueryValue>;
  body?: unknown;
  idempotencyKey?: string;
  notFoundAsNull?: boolean;
  signal?: AbortSignal;
};

export const apaleoActionHandlers: ProviderActionHandlers<"apaleo", ApaleoActionHandler> = {
  list_properties(input, context) {
    return listProperties(input, context);
  },
  count_properties(_input, context) {
    return countProperties(context);
  },
  get_property(input, context) {
    return getProperty(input, context);
  },
  check_property_exists(input, context) {
    return checkPropertyExists(input, context);
  },
  create_property(input, context) {
    return createProperty(input, context);
  },
  clone_property(input, context) {
    return cloneProperty(input, context);
  },
  archive_property(input, context) {
    return archiveProperty(input, context);
  },
  move_property_to_live(input, context) {
    return movePropertyToLive(input, context);
  },
  reset_property_data(input, context) {
    return resetPropertyData(input, context);
  },
  list_supported_countries(_input, context) {
    return listSupportedCountries(context);
  },
  list_units(input, context) {
    return listUnits(input, context);
  },
  count_units(input, context) {
    return countUnits(input, context);
  },
  get_unit(input, context) {
    return getUnit(input, context);
  },
  check_unit_exists(input, context) {
    return checkUnitExists(input, context);
  },
  create_unit(input, context) {
    return createUnit(input, context);
  },
  create_multiple_units(input, context) {
    return createMultipleUnits(input, context);
  },
  delete_unit(input, context) {
    return deleteUnit(input, context);
  },
  list_unit_groups(input, context) {
    return listUnitGroups(input, context);
  },
  count_unit_groups(input, context) {
    return countUnitGroups(input, context);
  },
  get_unit_group(input, context) {
    return getUnitGroup(input, context);
  },
  check_unit_group_exists(input, context) {
    return checkUnitGroupExists(input, context);
  },
  create_unit_group(input, context) {
    return createUnitGroup(input, context);
  },
  replace_unit_group(input, context) {
    return replaceUnitGroup(input, context);
  },
  delete_unit_group(input, context) {
    return deleteUnitGroup(input, context);
  },
  list_unit_attributes(input, context) {
    return listUnitAttributes(input, context);
  },
  get_unit_attribute(input, context) {
    return getUnitAttribute(input, context);
  },
  check_unit_attribute_exists(input, context) {
    return checkUnitAttributeExists(input, context);
  },
  create_unit_attribute(input, context) {
    return createUnitAttribute(input, context);
  },
  delete_unit_attribute(input, context) {
    return deleteUnitAttribute(input, context);
  },
};

export async function apaleoJsonRequest<T>(options: ApaleoRequestOptions): Promise<T | null> {
  const response = await options.fetcher(buildApaleoUrl(options.path, options.query).toString(), {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers: buildApaleoHeaders(options.accessToken, options.idempotencyKey, options.body !== undefined),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

  if (options.notFoundAsNull && response.status === 404) {
    return null;
  }
  if (response.status === 204) {
    return null;
  }
  if (!response.ok) {
    throw await createApaleoApiError(response);
  }

  return readApaleoJsonResponse<T>(response);
}

export async function apaleoHeadExists(
  options: Omit<ApaleoRequestOptions, "body" | "idempotencyKey">,
): Promise<boolean> {
  const response = await options.fetcher(buildApaleoUrl(options.path, options.query).toString(), {
    method: "HEAD",
    headers: buildApaleoHeaders(options.accessToken),
    signal: options.signal,
  });

  if (response.status === 200) {
    return true;
  }
  if (response.status === 404) {
    return false;
  }
  if (!response.ok) {
    throw await createApaleoApiError(response);
  }

  return true;
}

export async function apaleoNoContentRequest(options: ApaleoRequestOptions): Promise<{ success: true }> {
  await apaleoJsonRequest(options);
  return { success: true };
}

export async function createApaleoApiError(response: Response): Promise<ProviderRequestError> {
  const message = await readApaleoErrorMessage(response);

  if (response.status === 400 || response.status === 422) {
    return new ProviderRequestError(400, message);
  }
  if (response.status === 401) {
    return new ProviderRequestError(401, message);
  }
  if (response.status === 403) {
    return new ProviderRequestError(403, message);
  }
  if (response.status === 404) {
    return new ProviderRequestError(404, message);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }

  return new ProviderRequestError(response.status || 500, message);
}

async function readApaleoJsonResponse<T>(response: Response) {
  try {
    return (await response.json()) as T;
  } catch {
    throw new ProviderRequestError(502, "apaleo returned an invalid JSON response");
  }
}

async function listProperties(input: Record<string, unknown>, { accessToken, fetcher, signal }: ApaleoActionContext) {
  return (
    (await apaleoJsonRequest<{ count: number; properties: unknown[] }>({
      path: "/inventory/v1/properties",
      accessToken,
      fetcher,
      query: compactObject({
        status: asStringArray(input.status),
        includeArchived: optionalBoolean(input.includeArchived),
        countryCode: asStringArray(input.countryCode),
        pageNumber: optionalNumber(input.pageNumber),
        pageSize: optionalNumber(input.pageSize),
        expand: asStringArray(input.expand),
      }),
      signal,
    })) ?? { count: 0, properties: [] }
  );
}

async function countProperties({ accessToken, fetcher, signal }: ApaleoActionContext) {
  return apaleoJsonRequest<{ count: number }>({
    path: "/inventory/v1/properties/$count",
    accessToken,
    fetcher,
    signal,
  });
}

async function getProperty(input: Record<string, unknown>, { accessToken, fetcher, signal }: ApaleoActionContext) {
  return apaleoJsonRequest<Record<string, unknown>>({
    path: `/inventory/v1/properties/${encodeURIComponent(String(input.id))}`,
    accessToken,
    fetcher,
    query: compactObject({
      languages: asStringArray(input.languages),
      expand: asStringArray(input.expand),
    }),
    signal,
  });
}

async function checkPropertyExists(
  input: Record<string, unknown>,
  { accessToken, fetcher, signal }: ApaleoActionContext,
) {
  return {
    exists: await apaleoHeadExists({
      path: `/inventory/v1/properties/${encodeURIComponent(String(input.id))}`,
      accessToken,
      fetcher,
      signal,
    }),
  };
}

async function createProperty(input: Record<string, unknown>, { accessToken, fetcher, signal }: ApaleoActionContext) {
  const { idempotencyKey, ...body } = input;
  return apaleoJsonRequest<{ id: string }>({
    path: "/inventory/v1/properties",
    accessToken,
    fetcher,
    body,
    idempotencyKey: optionalString(idempotencyKey),
    signal,
  });
}

async function cloneProperty(input: Record<string, unknown>, { accessToken, fetcher, signal }: ApaleoActionContext) {
  const { id, idempotencyKey, ...body } = input;
  return apaleoJsonRequest<{ id: string }>({
    path: `/inventory/v1/property-actions/${encodeURIComponent(String(id))}/clone`,
    accessToken,
    fetcher,
    body,
    idempotencyKey: optionalString(idempotencyKey),
    signal,
  });
}

async function archiveProperty(input: Record<string, unknown>, { accessToken, fetcher, signal }: ApaleoActionContext) {
  return apaleoNoContentRequest({
    path: `/inventory/v1/property-actions/${encodeURIComponent(String(input.id))}/archive`,
    method: "PUT",
    accessToken,
    fetcher,
    signal,
  });
}

async function movePropertyToLive(
  input: Record<string, unknown>,
  { accessToken, fetcher, signal }: ApaleoActionContext,
) {
  return apaleoNoContentRequest({
    path: `/inventory/v1/property-actions/${encodeURIComponent(String(input.id))}/set-live`,
    method: "PUT",
    accessToken,
    fetcher,
    signal,
  });
}

async function resetPropertyData(
  input: Record<string, unknown>,
  { accessToken, fetcher, signal }: ApaleoActionContext,
) {
  return apaleoNoContentRequest({
    path: `/inventory/v1/property-actions/${encodeURIComponent(String(input.id))}/reset`,
    method: "PUT",
    accessToken,
    fetcher,
    signal,
  });
}

async function listSupportedCountries({ accessToken, fetcher, signal }: ApaleoActionContext) {
  return apaleoJsonRequest<{ countryCodes: string[] }>({
    path: "/inventory/v1/types/countries",
    accessToken,
    fetcher,
    signal,
  });
}

async function listUnits(input: Record<string, unknown>, { accessToken, fetcher, signal }: ApaleoActionContext) {
  return (
    (await apaleoJsonRequest<{ count: number; units: unknown[] }>({
      path: "/inventory/v1/units",
      accessToken,
      fetcher,
      query: buildUnitQuery(input, true),
      signal,
    })) ?? { count: 0, units: [] }
  );
}

async function countUnits(input: Record<string, unknown>, { accessToken, fetcher, signal }: ApaleoActionContext) {
  return apaleoJsonRequest<{ count: number }>({
    path: "/inventory/v1/units/$count",
    accessToken,
    fetcher,
    query: buildUnitQuery(input, false),
    signal,
  });
}

async function getUnit(input: Record<string, unknown>, { accessToken, fetcher, signal }: ApaleoActionContext) {
  return apaleoJsonRequest<Record<string, unknown>>({
    path: `/inventory/v1/units/${encodeURIComponent(String(input.id))}`,
    accessToken,
    fetcher,
    query: compactObject({
      languages: asStringArray(input.languages),
      expand: asStringArray(input.expand),
    }),
    signal,
  });
}

async function checkUnitExists(input: Record<string, unknown>, { accessToken, fetcher, signal }: ApaleoActionContext) {
  return {
    exists: await apaleoHeadExists({
      path: `/inventory/v1/units/${encodeURIComponent(String(input.id))}`,
      accessToken,
      fetcher,
      signal,
    }),
  };
}

async function createUnit(input: Record<string, unknown>, { accessToken, fetcher, signal }: ApaleoActionContext) {
  const { idempotencyKey, ...body } = input;
  return apaleoJsonRequest<{ id: string }>({
    path: "/inventory/v1/units",
    accessToken,
    fetcher,
    body,
    idempotencyKey: optionalString(idempotencyKey),
    signal,
  });
}

async function createMultipleUnits(
  input: Record<string, unknown>,
  { accessToken, fetcher, signal }: ApaleoActionContext,
) {
  const { idempotencyKey, ...body } = input;
  return apaleoJsonRequest<{ ids: string[] }>({
    path: "/inventory/v1/units/bulk",
    accessToken,
    fetcher,
    body,
    idempotencyKey: optionalString(idempotencyKey),
    signal,
  });
}

async function deleteUnit(input: Record<string, unknown>, { accessToken, fetcher, signal }: ApaleoActionContext) {
  return apaleoNoContentRequest({
    path: `/inventory/v1/units/${encodeURIComponent(String(input.id))}`,
    method: "DELETE",
    accessToken,
    fetcher,
    signal,
  });
}

async function listUnitGroups(input: Record<string, unknown>, { accessToken, fetcher, signal }: ApaleoActionContext) {
  return (
    (await apaleoJsonRequest<{ count: number; unitGroups: unknown[] }>({
      path: "/inventory/v1/unit-groups",
      accessToken,
      fetcher,
      query: compactObject({
        propertyId: optionalString(input.propertyId),
        unitGroupTypes: asStringArray(input.unitGroupTypes),
        pageNumber: optionalNumber(input.pageNumber),
        pageSize: optionalNumber(input.pageSize),
        expand: asStringArray(input.expand),
      }),
      signal,
    })) ?? { count: 0, unitGroups: [] }
  );
}

async function countUnitGroups(input: Record<string, unknown>, { accessToken, fetcher, signal }: ApaleoActionContext) {
  return apaleoJsonRequest<{ count: number }>({
    path: "/inventory/v1/unit-groups/$count",
    accessToken,
    fetcher,
    query: compactObject({
      propertyId: optionalString(input.propertyId),
      unitGroupTypes: asStringArray(input.unitGroupTypes),
    }),
    signal,
  });
}

async function getUnitGroup(input: Record<string, unknown>, { accessToken, fetcher, signal }: ApaleoActionContext) {
  return apaleoJsonRequest<Record<string, unknown>>({
    path: `/inventory/v1/unit-groups/${encodeURIComponent(String(input.id))}`,
    accessToken,
    fetcher,
    query: compactObject({
      languages: asStringArray(input.languages),
      expand: asStringArray(input.expand),
    }),
    signal,
  });
}

async function checkUnitGroupExists(
  input: Record<string, unknown>,
  { accessToken, fetcher, signal }: ApaleoActionContext,
) {
  return {
    exists: await apaleoHeadExists({
      path: `/inventory/v1/unit-groups/${encodeURIComponent(String(input.id))}`,
      accessToken,
      fetcher,
      signal,
    }),
  };
}

async function createUnitGroup(input: Record<string, unknown>, { accessToken, fetcher, signal }: ApaleoActionContext) {
  const { idempotencyKey, ...body } = input;
  return apaleoJsonRequest<{ id: string }>({
    path: "/inventory/v1/unit-groups",
    accessToken,
    fetcher,
    body,
    idempotencyKey: optionalString(idempotencyKey),
    signal,
  });
}

async function replaceUnitGroup(input: Record<string, unknown>, { accessToken, fetcher, signal }: ApaleoActionContext) {
  const { id, ...body } = input;
  return apaleoNoContentRequest({
    path: `/inventory/v1/unit-groups/${encodeURIComponent(String(id))}`,
    method: "PUT",
    accessToken,
    fetcher,
    body,
    signal,
  });
}

async function deleteUnitGroup(input: Record<string, unknown>, { accessToken, fetcher, signal }: ApaleoActionContext) {
  return apaleoNoContentRequest({
    path: `/inventory/v1/unit-groups/${encodeURIComponent(String(input.id))}`,
    method: "DELETE",
    accessToken,
    fetcher,
    signal,
  });
}

async function listUnitAttributes(
  input: Record<string, unknown>,
  { accessToken, fetcher, signal }: ApaleoActionContext,
) {
  return (
    (await apaleoJsonRequest<{ count: number; unitAttributes: unknown[] }>({
      path: "/inventory/v1/unit-attributes",
      accessToken,
      fetcher,
      query: compactObject({
        pageNumber: optionalNumber(input.pageNumber),
        pageSize: optionalNumber(input.pageSize),
      }),
      signal,
    })) ?? { count: 0, unitAttributes: [] }
  );
}

async function getUnitAttribute(input: Record<string, unknown>, { accessToken, fetcher, signal }: ApaleoActionContext) {
  return apaleoJsonRequest<Record<string, unknown>>({
    path: `/inventory/v1/unit-attributes/${encodeURIComponent(String(input.id))}`,
    accessToken,
    fetcher,
    signal,
  });
}

async function checkUnitAttributeExists(
  input: Record<string, unknown>,
  { accessToken, fetcher, signal }: ApaleoActionContext,
) {
  return {
    exists: await apaleoHeadExists({
      path: `/inventory/v1/unit-attributes/${encodeURIComponent(String(input.id))}`,
      accessToken,
      fetcher,
      signal,
    }),
  };
}

async function createUnitAttribute(
  input: Record<string, unknown>,
  { accessToken, fetcher, signal }: ApaleoActionContext,
) {
  const { idempotencyKey, ...body } = input;
  return apaleoJsonRequest<{ id: string }>({
    path: "/inventory/v1/unit-attributes",
    accessToken,
    fetcher,
    body,
    idempotencyKey: optionalString(idempotencyKey),
    signal,
  });
}

async function deleteUnitAttribute(
  input: Record<string, unknown>,
  { accessToken, fetcher, signal }: ApaleoActionContext,
) {
  return apaleoNoContentRequest({
    path: `/inventory/v1/unit-attributes/${encodeURIComponent(String(input.id))}`,
    method: "DELETE",
    accessToken,
    fetcher,
    signal,
  });
}

function buildApaleoUrl(path: string, query?: Record<string, ApaleoQueryValue>) {
  const url = new URL(path, apaleoApiBaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        continue;
      }
      url.searchParams.set(key, value.join(","));
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url;
}

function buildApaleoHeaders(accessToken: string, idempotencyKey?: string, hasBody = false) {
  const headers: Record<string, string> = {
    authorization: `Bearer ${accessToken}`,
    accept: "application/json",
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  if (idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey;
  }
  return headers;
}

async function readApaleoErrorMessage(response: Response) {
  const raw = await response.text().catch(() => "");
  if (!raw) {
    return `apaleo request failed with status ${response.status}`;
  }

  try {
    const payload = JSON.parse(raw) as {
      messages?: string[];
      message?: string;
      error?: string;
      error_description?: string;
    };

    if (Array.isArray(payload.messages) && payload.messages.length > 0) {
      return payload.messages.join("; ");
    }
    if (payload.error_description) {
      return payload.error_description;
    }
    if (payload.message) {
      return payload.message;
    }
    if (payload.error) {
      return payload.error;
    }
  } catch {
    return raw;
  }

  return raw;
}

function buildUnitQuery(input: Record<string, unknown>, includePaging: boolean) {
  return compactObject({
    propertyId: optionalString(input.propertyId),
    unitGroupId: optionalString(input.unitGroupId),
    unitGroupIds: asStringArray(input.unitGroupIds),
    unitAttributeIds: asStringArray(input.unitAttributeIds),
    isOccupied: optionalBoolean(input.isOccupied),
    maintenanceType: optionalString(input.maintenanceType),
    condition: optionalString(input.condition),
    textSearch: optionalString(input.textSearch),
    status: optionalString(input.status),
    pageNumber: includePaging ? optionalNumber(input.pageNumber) : undefined,
    pageSize: includePaging ? optionalNumber(input.pageSize) : undefined,
    expand: includePaging ? asStringArray(input.expand) : undefined,
  });
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => String(item));
}
