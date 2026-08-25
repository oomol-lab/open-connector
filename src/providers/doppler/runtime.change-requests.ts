import type { ProviderActionHandlerSubset } from "../provider-runtime.ts";

import { optionalString, compactObject } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { dopplerRequest, readArray, readObject } from "./runtime.shared.ts";

interface DopplerChangeRequestActionContext {
  accessToken: string;
  fetcher: typeof fetch;
}

type DopplerChangeRequestActionHandler = (
  input: Record<string, unknown>,
  context: DopplerChangeRequestActionContext,
) => Promise<unknown>;

export const dopplerChangeRequestActionHandlers: ProviderActionHandlerSubset<
  "doppler",
  DopplerChangeRequestActionHandler
> = {
  list_change_requests(input, context) {
    return dopplerListChangeRequests(input, context.accessToken, context.fetcher);
  },
  create_change_request(input, context) {
    return dopplerCreateChangeRequest(input, context.accessToken, context.fetcher);
  },
  get_change_request(input, context) {
    return dopplerGetChangeRequest(input, context.accessToken, context.fetcher);
  },
  update_change_request(input, context) {
    return dopplerUpdateChangeRequest(input, context.accessToken, context.fetcher);
  },
  update_change_request_assignees(input, context) {
    return dopplerUpdateChangeRequestAssignees(input, context.accessToken, context.fetcher);
  },
  update_change_request_unit_status(input, context) {
    return dopplerUpdateChangeRequestUnitStatus(input, context.accessToken, context.fetcher);
  },
  review_change_request_unit(input, context) {
    return dopplerReviewChangeRequestUnit(input, context.accessToken, context.fetcher);
  },
};

async function dopplerListChangeRequests(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dopplerRequest(
    accessToken,
    {
      path: "/v3/workplace/change_requests",
      query: {
        page: asOptionalNumber(input.page),
        per_page: asOptionalNumber(input.perPage),
        status: readOptionalStringArray(input.status, "status"),
        title: optionalString(input.title),
      },
    },
    fetcher,
    "execute",
  );

  return {
    changeRequests: readArray(payload, "change requests"),
  };
}

async function dopplerCreateChangeRequest(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dopplerRequest(
    accessToken,
    {
      method: "POST",
      path: "/v3/workplace/change_requests",
      body: compactObject({
        title: asRequiredString(input.title, "title"),
        description: optionalString(input.description),
        assigned: readArray(input.assigned, "assigned"),
        units: readArray(input.units, "units"),
      }),
    },
    fetcher,
    "execute",
  );
  const record = readObject(payload, "created change request");

  return {
    changeRequest: readObject(record.changeRequest, "change request"),
  };
}

async function dopplerGetChangeRequest(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const changeRequestId = asRequiredString(input.changeRequestId, "changeRequestId");
  const payload = await dopplerRequest(
    accessToken,
    {
      path: `/v3/workplace/change_requests/change_request/${encodeURIComponent(changeRequestId)}`,
    },
    fetcher,
    "execute",
  );
  const record = readObject(payload, "change request");

  return {
    changeRequest: readObject(record.changeRequest, "change request"),
  };
}

async function dopplerUpdateChangeRequest(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const changeRequestId = asRequiredString(input.changeRequestId, "changeRequestId");
  const payload = await dopplerRequest(
    accessToken,
    {
      method: "POST",
      path: `/v3/workplace/change_requests/change_request/${encodeURIComponent(changeRequestId)}`,
      body: compactObject({
        title: optionalString(input.title),
        description: optionalString(input.description),
        assigned: readOptionalArray(input.assigned, "assigned"),
        units: readOptionalArray(input.units, "units"),
      }),
    },
    fetcher,
    "execute",
  );
  const record = readObject(payload, "updated change request");

  return {
    changeRequest: readObject(record.changeRequest, "change request"),
  };
}

async function dopplerUpdateChangeRequestAssignees(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const changeRequestId = asRequiredString(input.changeRequestId, "changeRequestId");
  const payload = await dopplerRequest(
    accessToken,
    {
      method: "PUT",
      path: `/v3/workplace/change_requests/change_request/${encodeURIComponent(changeRequestId)}/assignees`,
      body: {
        assigned: readArray(input.assigned, "assigned"),
      },
    },
    fetcher,
    "execute",
  );
  const record = readObject(payload, "change request assignees");

  return {
    assigned: readArray(record.assigned, "assigned"),
  };
}

async function dopplerUpdateChangeRequestUnitStatus(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const changeRequestId = asRequiredString(input.changeRequestId, "changeRequestId");
  const unitId = asRequiredString(input.unitId, "unitId");
  const payload = await dopplerRequest(
    accessToken,
    {
      method: "PUT",
      path: `/v3/workplace/change_requests/change_request/${encodeURIComponent(
        changeRequestId,
      )}/units/unit/${encodeURIComponent(unitId)}/status`,
      body: {
        status: asRequiredString(input.status, "status"),
      },
    },
    fetcher,
    "execute",
  );
  const record = readObject(payload, "change request unit");

  return {
    unit: readObject(record.unit, "unit"),
  };
}

async function dopplerReviewChangeRequestUnit(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const changeRequestId = asRequiredString(input.changeRequestId, "changeRequestId");
  const unitId = asRequiredString(input.unitId, "unitId");
  const payload = await dopplerRequest(
    accessToken,
    {
      method: "POST",
      path: `/v3/workplace/change_requests/change_request/${encodeURIComponent(
        changeRequestId,
      )}/units/unit/${encodeURIComponent(unitId)}/review`,
    },
    fetcher,
    "execute",
  );
  const record = readObject(payload, "change request review");

  return {
    unit: readObject(record.unit, "unit"),
  };
}

function asRequiredString(value: unknown, fieldName: string) {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function asOptionalNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function readOptionalArray(value: unknown, label: string) {
  if (value === undefined) {
    return undefined;
  }
  return readArray(value, label);
}

function readOptionalStringArray(value: unknown, label: string) {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${label} must be an array`);
  }
  return value.map((item) => asRequiredString(item, label));
}
