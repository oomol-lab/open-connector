import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const detrackApiBaseUrl = "https://app.detrack.com/api/v2";
const detrackRequestTimeoutMs = 30_000;
const detrackMaxResponseBytes = 10 * 1024 * 1024;

type DetrackRequestPhase = "validate" | "execute";
type DetrackRequestInput = {
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  phase: DetrackRequestPhase;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  signal?: AbortSignal;
};

interface DetrackActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type DetrackActionHandler = (input: Record<string, unknown>, context: DetrackActionContext) => Promise<unknown>;

export const detrackActionHandlers: ProviderActionHandlers<"detrack", DetrackActionHandler> = {
  list_jobs(input, context) {
    return listJobs(input, context);
  },
  create_job(input, context) {
    return createJob(input, context);
  },
  get_job(input, context) {
    return getJob(input, context);
  },
  update_job(input, context) {
    return updateJob(input, context);
  },
  delete_job(input, context) {
    return deleteJob(input, context);
  },
  search_jobs(input, context) {
    return searchJobs(input, context);
  },
  list_depots(input, context) {
    return listDepots(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<DetrackActionContext>({
  service: "detrack",
  handlers: detrackActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher): Promise<DetrackActionContext> {
    const credential = await requireApiKeyCredential(context, "detrack");
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "detrack",
  baseUrl: detrackApiBaseUrl,
  auth: { type: "api_key_header", name: "X-API-KEY" },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("user-agent", providerUserAgent);
  },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await detrackRequest({
      apiKey: input.apiKey,
      path: "/dn/jobs",
      query: {
        limit: 1,
      },
      fetcher,
      signal,
      phase: "validate",
    });
    const envelope = requireDetrackEnvelope(payload);
    const jobs = requireArray(envelope.data, "Detrack returned an invalid jobs list");
    return {
      profile: {
        displayName: "Detrack API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: detrackApiBaseUrl,
        validationEndpoint: "/dn/jobs",
        jobCount: jobs.length,
      },
    };
  },
};

async function listJobs(input: Record<string, unknown>, context: DetrackActionContext) {
  const payload = await detrackRequest({
    apiKey: context.apiKey,
    path: "/dn/jobs",
    query: compactObject({
      page: optionalNumber(input.page),
      limit: optionalNumber(input.limit),
      sort: optionalString(input.sort),
      type: optionalString(input.type),
      date: optionalString(input.date),
      assign_to: optionalString(input.assignTo),
      status: optionalString(input.status),
      do_number: optionalString(input.doNumber),
      query: optionalString(input.query),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return normalizeJobList(payload);
}

async function createJob(input: Record<string, unknown>, context: DetrackActionContext) {
  validateCreateJobInput(input);
  const payload = await detrackRequest({
    apiKey: context.apiKey,
    path: "/dn/jobs",
    method: "POST",
    body: {
      data: compactObject({
        type: optionalString(input.type) ?? "Delivery",
        do_number: optionalString(input.doNumber),
        date: optionalString(input.date),
        ...buildMutableJobPayload(input),
      }),
    },
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return normalizeSingleJob(payload);
}

async function getJob(input: Record<string, unknown>, context: DetrackActionContext) {
  const payload = await detrackRequest({
    apiKey: context.apiKey,
    path: buildJobPath(input),
    query: {
      type: optionalString(input.type),
    },
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return normalizeSingleJob(payload);
}

async function updateJob(input: Record<string, unknown>, context: DetrackActionContext) {
  const mutableFields = buildMutableJobPayload(input);
  if (Object.keys(mutableFields).length === 0) {
    throw new ProviderRequestError(400, "at least one job field must be provided for update");
  }
  const payload = await detrackRequest({
    apiKey: context.apiKey,
    path: buildJobPath(input),
    method: "PUT",
    query: {
      type: optionalString(input.type),
    },
    body: {
      data: mutableFields,
    },
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return normalizeSingleJob(payload);
}

async function deleteJob(input: Record<string, unknown>, context: DetrackActionContext) {
  await detrackRequest({
    apiKey: context.apiKey,
    path: buildJobPath(input),
    method: "DELETE",
    query: {
      type: optionalString(input.type),
    },
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    deleted: true,
  };
}

async function searchJobs(input: Record<string, unknown>, context: DetrackActionContext) {
  const payload = await detrackRequest({
    apiKey: context.apiKey,
    path: "/dn/jobs/search",
    method: "POST",
    body: {
      data: compactObject({
        type: optionalString(input.type),
        do_number: optionalString(input.doNumber),
        do_numbers: input.doNumbers,
        dates: buildDateRange(input.dateFrom, input.dateTo),
        start_dates: buildDateRange(input.startDateFrom, input.startDateTo),
        statuses: input.statuses,
        groups: input.groups,
        vehicles: input.vehicles,
        account_number: optionalString(input.accountNumber),
        address: optionalString(input.address),
        deliver_to_collect_from: optionalString(input.contactName),
        customer: optionalString(input.customer),
        department: optionalString(input.department),
        invoice_number: optionalString(input.invoiceNumber),
        job_type: optionalString(input.jobType),
        open_to_marketplace: optionalBoolean(input.openToMarketplace),
        order_number: optionalString(input.orderNumber),
        run_number: optionalString(input.runNumber),
        tracking_number: optionalString(input.trackingNumber),
        zone: optionalString(input.zone),
        page: optionalNumber(input.page),
        limit: optionalNumber(input.limit),
      }),
    },
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return normalizeJobList(payload);
}

async function listDepots(input: Record<string, unknown>, context: DetrackActionContext) {
  const payload = await detrackRequest({
    apiKey: context.apiKey,
    path: "/dn/depots",
    query: compactObject({
      page: optionalNumber(input.page),
      limit: optionalNumber(input.limit),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const envelope = requireDetrackEnvelope(payload);

  return {
    depots: requireArray(envelope.data, "Detrack returned an invalid depots list"),
    links: requireObject(envelope.links, "Detrack returned invalid depot pagination links"),
    totalCount: requireNumber(envelope.total_count, "Detrack returned an invalid depot count"),
  };
}

function buildJobPath(input: Record<string, unknown>) {
  const doNumber = requireInputString(input.doNumber, "doNumber");
  const date = requireInputString(input.date, "date");
  return `/dn/jobs/${encodeURIComponent(doNumber)}/${encodeURIComponent(date)}`;
}

function validateCreateJobInput(input: Record<string, unknown>): void {
  const address = optionalString(input.address)?.trim() ?? "";
  const addressLine1 = optionalString(input.addressLine1)?.trim() ?? "";
  if (!address && !addressLine1) {
    throw new ProviderRequestError(400, "address or addressLine1 is required");
  }
}

function buildMutableJobPayload(input: Record<string, unknown>) {
  return compactObject({
    address: optionalString(input.address),
    start_date: optionalString(input.startDate),
    time_window_from: optionalString(input.timeWindowFrom),
    time_window_to: optionalString(input.timeWindowTo),
    job_time: optionalString(input.jobTime),
    tracking_number: optionalString(input.trackingNumber),
    order_number: optionalString(input.orderNumber),
    address_lat: optionalNumber(input.addressLatitude),
    address_lng: optionalNumber(input.addressLongitude),
    company_name: optionalString(input.companyName),
    address_1: optionalString(input.addressLine1),
    address_2: optionalString(input.addressLine2),
    address_3: optionalString(input.addressLine3),
    postal_code: optionalString(input.postalCode),
    city: optionalString(input.city),
    state: optionalString(input.state),
    country: optionalString(input.country),
    deliver_to_collect_from: optionalString(input.contactName),
    phone_number: optionalString(input.phoneNumber),
    instructions: optionalString(input.instructions),
    assign_to: optionalString(input.assignTo),
    notify_email: optionalString(input.notifyEmail),
    webhook_url: optionalString(input.webhookUrl),
    zone: optionalString(input.zone),
    customer: optionalString(input.customer),
    account_number: optionalString(input.accountNumber),
    invoice_number: optionalString(input.invoiceNumber),
    invoice_amount: optionalNumber(input.invoiceAmount),
    group_name: optionalString(input.groupName),
    weight: optionalNumber(input.weight),
    boxes: optionalString(input.boxes),
    cartons: optionalNumber(input.cartons),
    pieces: optionalNumber(input.pieces),
    pallets: optionalNumber(input.pallets),
    run_number: optionalString(input.runNumber),
    remarks: optionalString(input.remarks),
    service_type: optionalString(input.serviceType),
    vehicle_type: optionalString(input.vehicleType),
    items: buildJobItems(input.items),
  });
}

function buildJobItems(value: unknown) {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "items must be an array");
  }

  return value.map((item) => {
    const source = requireObject(item, "each item must be an object");
    return compactObject({
      sku: optionalString(source.sku),
      purchase_order_number: optionalString(source.purchaseOrderNumber),
      batch_number: optionalString(source.batchNumber),
      expiry_date: optionalString(source.expiryDate),
      description: optionalString(source.description),
      comments: optionalString(source.comments),
      quantity: optionalNumber(source.quantity),
      unit_of_measure: optionalString(source.unitOfMeasure),
      weight: optionalNumber(source.weight),
      serial_numbers: source.serialNumbers,
    });
  });
}

function buildDateRange(fromValue: unknown, toValue: unknown) {
  const range = compactObject({
    from: optionalString(fromValue),
    to: optionalString(toValue),
  });
  return Object.keys(range).length > 0 ? range : undefined;
}

function normalizeJobList(payload: unknown) {
  const envelope = requireDetrackEnvelope(payload);
  return {
    jobs: requireArray(envelope.data, "Detrack returned an invalid jobs list"),
    links: requireObject(envelope.links, "Detrack returned invalid job pagination links"),
  };
}

function normalizeSingleJob(payload: unknown) {
  const envelope = requireDetrackEnvelope(payload);
  return {
    job: requireObject(envelope.data, "Detrack returned an invalid job"),
  };
}

async function detrackRequest(input: DetrackRequestInput) {
  const url = new URL(`${detrackApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const timeout = createProviderTimeout(input.signal, detrackRequestTimeoutMs);
  try {
    const response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        Accept: "application/json",
        "X-API-KEY": input.apiKey,
        "User-Agent": providerUserAgent,
        ...(input.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
      signal: timeout.signal,
    });
    const payload = await readDetrackPayload(response);
    if (!response.ok) {
      throw createDetrackError(response, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Detrack request timed out");
    }
    throw new ProviderRequestError(
      502,
      `Detrack request failed: ${error instanceof Error ? error.message : "Unknown transport error"}`,
    );
  } finally {
    timeout.cleanup();
  }
}

async function readDetrackPayload(response: Response) {
  const text = await readProviderTextBody(response, "Detrack response", detrackMaxResponseBytes);
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Detrack returned invalid JSON");
  }
}

function createDetrackError(response: Response, payload: unknown, phase: DetrackRequestPhase) {
  const message = readDetrackErrorMessage(payload) ?? `Detrack request failed with status ${response.status}`;

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(response.status, message);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (response.status >= 500) {
    return new ProviderRequestError(502, message);
  }
  if (phase === "validate") {
    return new ProviderRequestError(response.status || 400, message);
  }
  return new ProviderRequestError(response.status || 502, message);
}

function readDetrackErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload) {
    return payload;
  }

  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }

  const directMessage = optionalString(object.message);
  if (directMessage) {
    return directMessage;
  }

  const directError = optionalString(object.error);
  if (directError) {
    return directError;
  }

  const errorObject = optionalRecord(object.error);
  const nestedMessage = errorObject ? optionalString(errorObject.message) : undefined;
  if (nestedMessage) {
    return nestedMessage;
  }

  if (Array.isArray(object.errors)) {
    const firstError = object.errors[0];
    if (typeof firstError === "string") {
      return firstError;
    }
    return optionalString(optionalRecord(firstError)?.message);
  }

  return undefined;
}

function requireDetrackEnvelope(value: unknown) {
  return requireObject(value, "Detrack returned an invalid response envelope");
}

function requireObject(value: unknown, message: string) {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, message);
  }
  return object;
}

function requireArray(value: unknown, message: string) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, message);
  }
  return value;
}

function requireNumber(value: unknown, message: string) {
  if (typeof value !== "number") {
    throw new ProviderRequestError(502, message);
  }
  return value;
}

function requireInputString(value: unknown, fieldName: string) {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}
