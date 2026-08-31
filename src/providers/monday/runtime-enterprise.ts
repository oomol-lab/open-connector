import type { ProviderActionHandlerSubset } from "../provider-runtime.ts";
import type { MondayProviderActionInput } from "./runtime-common.ts";
import type { MondayActionHandler } from "./runtime-common.ts";

import { compactObject, optionalRecord as asOptionalObject } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { asArray, mondayGraphqlRequest, normalizeMondayUser } from "./runtime-common.ts";

export const mondayEnterpriseActionHandlers: ProviderActionHandlerSubset<"monday", MondayActionHandler> = {
  list_departments(input, fetcher) {
    return mondayListDepartments(input, fetcher);
  },
  create_department(input, fetcher) {
    return mondayCreateDepartment(input, fetcher);
  },
  update_department(input, fetcher) {
    return mondayUpdateDepartment(input, fetcher);
  },
  delete_department(input, fetcher) {
    return mondayDeleteDepartment(input, fetcher);
  },
  assign_department_members(input, fetcher) {
    return mondayAssignDepartmentMembers(input, fetcher);
  },
  clear_users_department(input, fetcher) {
    return mondayClearUsersDepartment(input, fetcher);
  },
};

async function mondayListDepartments(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    departments?: Array<Record<string, unknown>>;
  }>(
    input.apiKey,
    {
      query: `
        query ListDepartments($ids: [ID!]) {
          departments(ids: $ids) {
            id
            name
            reserved_seats
            assigned_seats
            members {
              id
              name
              email
            }
            owners {
              id
              name
              email
            }
          }
        }
      `,
      variables: compactObject({
        ids: Array.isArray(source.ids) ? source.ids : undefined,
      }),
    },
    fetcher,
    "execute",
  );

  return {
    departments: asArray(payload.departments).map((department) => normalizeMondayDepartment(department)),
  };
}

async function mondayCreateDepartment(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    create_department?: Record<string, unknown>;
  }>(
    input.apiKey,
    {
      query: `
        mutation CreateDepartment($data: CreateDepartmentDataInput!) {
          create_department(data: $data) {
            id
            name
            reserved_seats
            assigned_seats
            members {
              id
              name
              email
            }
            owners {
              id
              name
              email
            }
          }
        }
      `,
      variables: {
        data: source.data,
      },
    },
    fetcher,
    "execute",
  );

  return {
    department: normalizeMondayDepartment(payload.create_department),
  };
}

async function mondayUpdateDepartment(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    update_department?: Record<string, unknown>;
  }>(
    input.apiKey,
    {
      query: `
        mutation UpdateDepartment($department_id: ID!, $data: UpdateDepartmentOptionsInput) {
          update_department(department_id: $department_id, data: $data) {
            id
            name
            reserved_seats
            assigned_seats
            members {
              id
              name
              email
            }
            owners {
              id
              name
              email
            }
          }
        }
      `,
      variables: {
        department_id: source.department_id,
        data: source.data,
      },
    },
    fetcher,
    "execute",
  );

  return {
    department: normalizeMondayDepartment(payload.update_department),
  };
}

async function mondayDeleteDepartment(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    delete_department?: Record<string, unknown>;
  }>(
    input.apiKey,
    {
      query: `
        mutation DeleteDepartment($department_id: ID!) {
          delete_department(department_id: $department_id) {
            id
          }
        }
      `,
      variables: {
        department_id: source.department_id,
      },
    },
    fetcher,
    "execute",
  );

  return {
    deletedDepartmentId: normalizeId(asOptionalObject(payload.delete_department)?.id, "monday department id"),
  };
}

async function mondayAssignDepartmentMembers(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    assign_department_members?: Record<string, unknown>;
  }>(
    input.apiKey,
    {
      query: `
        mutation AssignDepartmentMembers($department_id: ID!, $user_ids: [ID!]!) {
          assign_department_members(department_id: $department_id, user_ids: $user_ids) {
            successful_users {
              id
              name
              email
            }
            failed_users {
              id
              name
              email
            }
          }
        }
      `,
      variables: {
        department_id: source.department_id,
        user_ids: source.user_ids,
      },
    },
    fetcher,
    "execute",
  );

  const result = asOptionalObject(payload.assign_department_members);

  return {
    successfulUsers: asArray(result?.successful_users).map((user) => normalizeMondayUser(user)),
    failedUsers: asArray(result?.failed_users).map((user) => normalizeMondayUser(user)),
  };
}

async function mondayClearUsersDepartment(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    clear_users_department?: Record<string, unknown>;
  }>(
    input.apiKey,
    {
      query: `
        mutation ClearUsersDepartment($user_ids: [ID!]!) {
          clear_users_department(user_ids: $user_ids) {
            cleared_users {
              id
              name
              email
            }
          }
        }
      `,
      variables: {
        user_ids: source.user_ids,
      },
    },
    fetcher,
    "execute",
  );

  const result = asOptionalObject(payload.clear_users_department);

  return {
    clearedUsers: asArray(result?.cleared_users).map((user) => normalizeMondayUser(user)),
  };
}

function normalizeMondayDepartment(value: unknown) {
  const record = asOptionalObject(value);
  if (!record) {
    throw new ProviderRequestError(502, "monday department payload is missing");
  }

  return {
    id: normalizeId(record.id, "monday department id"),
    name: normalizeString(record.name, "monday department name"),
    reserved_seats: normalizeInteger(record.reserved_seats, "monday reserved seats"),
    assigned_seats: normalizeInteger(record.assigned_seats, "monday assigned seats"),
    members: asArray(record.members).map((user) => normalizeMondayUser(user)),
    owners: asArray(record.owners).map((user) => normalizeMondayUser(user)),
  };
}

function toOptionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function toOptionalId(value: unknown) {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function normalizeString(value: unknown, fieldName: string) {
  const normalized = toOptionalString(value);
  if (!normalized) {
    throw new ProviderRequestError(502, `${fieldName} is missing`);
  }
  return normalized;
}

function normalizeId(value: unknown, fieldName: string) {
  const normalized = toOptionalId(value);
  if (!normalized) {
    throw new ProviderRequestError(502, `${fieldName} is missing`);
  }
  return normalized;
}

function normalizeInteger(value: unknown, fieldName: string) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(502, `${fieldName} is missing`);
  }
  return value;
}
