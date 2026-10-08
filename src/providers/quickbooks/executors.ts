import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ResolvedCredential,
} from "../../core/types.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { QuickbooksResource, QuickbooksResourceOperation } from "./resources.ts";
import type { QuickbooksContext } from "./runtime.ts";

import {
  base64Bytes,
  looseArray,
  optionalBoolean,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import {
  ProviderRequestError,
  defineProviderExecutors,
  providerInputError,
  providerResponseError,
  requiredInputString,
  requiredResponseRecord,
} from "../provider-runtime.ts";
import { quickbooksBaseUrls } from "./constants.ts";
import { customerBody, invoiceBody, paymentBody } from "./payloads.ts";
import { quickbooksAttachable, quickbooksEntity, quickbooksResources, resourceActionName } from "./resources.ts";
import {
  assertReadOnlySelect,
  compareCondition,
  containsCondition,
  createEntity,
  equalsCondition,
  getCompanyInfo,
  readPaging,
  statusCondition,
  txnDateConditions,
  listEntities,
  operateOnEntity,
  quickbooksRequest,
  readEntity,
  readReport,
  resolveQuickbooksEnvironment,
  updateEntity,
} from "./runtime.ts";

export { oauth } from "./oauth.ts";

const service = "quickbooks";
const customer = quickbooksEntity("customer");
const invoice = quickbooksEntity("invoice");
const payment = quickbooksEntity("payment");
const account = quickbooksEntity("account");

function customerIdCondition(input: Record<string, unknown>): string[] {
  const customerId = optionalString(input.customer_id);
  return customerId ? [equalsCondition("CustomerRef", customerId)] : [];
}

type QuickbooksHandler = ProviderRuntimeHandler<QuickbooksContext>;

const handWrittenHandlers: Record<string, QuickbooksHandler> = {
  async get_company_info(_input, context): Promise<unknown> {
    return { company_info: await getCompanyInfo(context) };
  },
  async list_customers(input, context): Promise<unknown> {
    const name = optionalString(input.display_name_contains);
    return listEntities(context, {
      entity: customer.name,
      conditions: [
        statusCondition(optionalString(input.status)),
        ...(name ? [containsCondition("DisplayName", name)] : []),
      ],
      orderBy: optionalString(input.order_by) ?? "DisplayName",
      descending: optionalBoolean(input.descending),
      ...readPaging(input),
    });
  },
  async get_customer(input, context): Promise<unknown> {
    return { customer: await readEntity(context, customer, requiredInputString(input.id, "id")) };
  },
  async create_customer(input, context): Promise<unknown> {
    return { customer: await createEntity(context, customer, customerBody(input)) };
  },
  async update_customer(input, context): Promise<unknown> {
    return { customer: await updateEntity(context, customer, input, customerBody(input)) };
  },

  async list_invoices(input, context): Promise<unknown> {
    const docNumber = optionalString(input.doc_number);
    return listEntities(context, {
      entity: invoice.name,
      conditions: [
        ...customerIdCondition(input),
        ...(docNumber ? [equalsCondition("DocNumber", docNumber)] : []),
        ...txnDateConditions(input),
        ...(optionalBoolean(input.unpaid_only) ? [compareCondition("Balance", ">", "0")] : []),
      ],
      orderBy: optionalString(input.order_by) ?? "TxnDate",
      descending: optionalBoolean(input.descending),
      ...readPaging(input),
    });
  },
  async get_invoice(input, context): Promise<unknown> {
    return { invoice: await readEntity(context, invoice, requiredInputString(input.id, "id")) };
  },
  async create_invoice(input, context): Promise<unknown> {
    return { invoice: await createEntity(context, invoice, invoiceBody(input)) };
  },
  async update_invoice(input, context): Promise<unknown> {
    return { invoice: await updateEntity(context, invoice, input, invoiceBody(input)) };
  },
  async void_invoice(input, context): Promise<unknown> {
    return { invoice: await operateOnEntity(context, invoice, "void", input) };
  },
  async delete_invoice(input, context): Promise<unknown> {
    const result = await operateOnEntity(context, invoice, "delete", input);
    return { deleted: result.status === "Deleted", invoice: result };
  },
  async list_payments(input, context): Promise<unknown> {
    return listEntities(context, {
      entity: payment.name,
      conditions: [...customerIdCondition(input), ...txnDateConditions(input)],
      orderBy: optionalString(input.order_by) ?? "TxnDate",
      descending: optionalBoolean(input.descending),
      ...readPaging(input),
    });
  },
  async void_payment(input, context): Promise<unknown> {
    return { payment: await operateOnEntity(context, payment, "void", input) };
  },
  async get_payment(input, context): Promise<unknown> {
    return { payment: await readEntity(context, payment, requiredInputString(input.id, "id")) };
  },
  async create_payment(input, context): Promise<unknown> {
    return { payment: await createEntity(context, payment, paymentBody(input)) };
  },

  async list_accounts(input, context): Promise<unknown> {
    const accountType = optionalString(input.account_type);
    const name = optionalString(input.name_contains);
    return listEntities(context, {
      entity: account.name,
      conditions: [
        statusCondition(optionalString(input.status)),
        ...(accountType ? [equalsCondition("AccountType", accountType)] : []),
        ...(name ? [containsCondition("Name", name)] : []),
      ],
      orderBy: optionalString(input.order_by) ?? "Name",
      descending: optionalBoolean(input.descending),
      ...readPaging(input),
    });
  },
  async get_account(input, context): Promise<unknown> {
    return { account: await readEntity(context, account, requiredInputString(input.id, "id")) };
  },
};

const entityNamePattern = /^[A-Za-z]+$/;
const currencyCodePattern = /^[A-Za-z]{3}$/;
const maxBatchItems = 30;

function entityName(value: unknown, fieldName: string): string {
  const name = requiredInputString(value, fieldName);
  if (!entityNamePattern.test(name)) {
    throw providerInputError(`${fieldName} must be a QuickBooks entity name such as Invoice`);
  }
  return name;
}

function currencyCode(value: unknown): string {
  const code = requiredInputString(value, "currency_code");
  if (!currencyCodePattern.test(code)) {
    throw providerInputError("currency_code must be a three-letter ISO 4217 code");
  }
  return code.toUpperCase();
}

/** One entry of a batch request: a native `BatchItemRequest`. */
function batchItem(value: unknown, index: number): Record<string, unknown> {
  const item = optionalRecord(value);
  if (!item) {
    throw providerInputError(`items[${index}] must be an object`);
  }
  const bId = requiredInputString(item.id, `items[${index}].id`);
  const query = optionalString(item.query);
  if (query) {
    assertReadOnlySelect(query);
    return { bId, Query: query };
  }
  const operation = requiredInputString(item.operation, `items[${index}].operation`);
  if (operation !== "create" && operation !== "update" && operation !== "delete") {
    throw providerInputError(`items[${index}].operation must be create, update or delete`);
  }
  const body = optionalRecord(item.body);
  if (!body) {
    throw providerInputError(`items[${index}].body must be an object`);
  }
  return { bId, operation, [entityName(item.entity, `items[${index}].entity`)]: body };
}

function attachableRefs(input: Record<string, unknown>): Record<string, unknown>[] | undefined {
  const type = optionalString(input.entity_type);
  const id = optionalString(input.entity_id);
  if (!type && !id) {
    return undefined;
  }
  return [
    {
      EntityRef: { type: entityName(type, "entity_type"), value: requiredInputString(id, "entity_id") },
      IncludeOnSend: optionalBoolean(input.include_on_send),
    },
  ];
}

const extraHandlers: Record<string, QuickbooksHandler> = {
  async ping(_input, context): Promise<unknown> {
    const info = await getCompanyInfo(context);
    return { ok: true, realm_id: context.realmId, company_name: optionalString(info.CompanyName) ?? null };
  },

  async get_changes(input, context): Promise<unknown> {
    const entities = looseArray(input.entities).map((value) => entityName(value, "entities"));
    if (entities.length === 0) {
      throw providerInputError("entities must list at least one entity name");
    }
    const payload = await quickbooksRequest(context, {
      path: "cdc",
      query: { entities: entities.join(","), changedSince: requiredInputString(input.changed_since, "changed_since") },
    });
    // QuickBooks wraps the single change-data-capture result in an array.
    const response = Array.isArray(payload.CDCResponse) ? payload.CDCResponse[0] : payload.CDCResponse;
    return { changes: requiredResponseRecord(response, "QuickBooks change data capture") };
  },

  async batch(input, context): Promise<unknown> {
    const items = looseArray(input.items);
    if (items.length === 0 || items.length > maxBatchItems) {
      throw providerInputError(`items must contain between 1 and ${maxBatchItems} entries`);
    }
    const payload = await quickbooksRequest(context, {
      path: "batch",
      method: "POST",
      body: { BatchItemRequest: items.map(batchItem) },
    });
    return { items: looseArray(payload.BatchItemResponse) };
  },

  async get_exchange_rate(input, context): Promise<unknown> {
    const payload = await quickbooksRequest(context, {
      path: "exchangerate",
      query: { sourcecurrencycode: currencyCode(input.currency_code), asofdate: optionalString(input.as_of_date) },
    });
    return { exchange_rate: requiredResponseRecord(payload.ExchangeRate, "QuickBooks ExchangeRate") };
  },

  async get_preferences(_input, context): Promise<unknown> {
    const payload = await quickbooksRequest(context, { path: "preferences" });
    return { preferences: requiredResponseRecord(payload.Preferences, "QuickBooks Preferences") };
  },

  async get_report(input, context): Promise<unknown> {
    const reportName = requiredInputString(input.report_name, "report_name");
    return { report: await readReport(context, encodePathSegment(reportName), input) };
  },

  async upload_attachment(input, context): Promise<unknown> {
    const fileName = requiredInputString(input.file_name, "file_name");
    const contentType = requiredInputString(input.content_type, "content_type");
    const content = base64Bytes(input.content_base64, "content_base64", providerInputError);
    const metadata = {
      FileName: fileName,
      ContentType: contentType,
      Note: optionalString(input.note),
      AttachableRef: attachableRefs(input),
    };
    const form = new FormData();
    form.append(
      "file_metadata_01",
      new Blob([JSON.stringify(metadata)], { type: "application/json" }),
      "attachment.json",
    );
    form.append("file_content_01", new Blob([content], { type: contentType }), fileName);
    const payload = await quickbooksRequest(context, { path: "upload", method: "POST", formData: form });
    const response = optionalRecord(looseArray(payload.AttachableResponse)[0]);
    return { attachment: requiredResponseRecord(response?.Attachable, "QuickBooks Attachable") };
  },
  async list_attachments(input, context): Promise<unknown> {
    const type = optionalString(input.entity_type);
    const id = optionalString(input.entity_id);
    if (Boolean(type) !== Boolean(id)) {
      throw providerInputError("entity_type and entity_id must be given together");
    }
    return listEntities(context, {
      entity: quickbooksAttachable.name,
      conditions:
        type && id
          ? [
              equalsCondition("AttachableRef.EntityRef.Type", entityName(type, "entity_type")),
              equalsCondition("AttachableRef.EntityRef.value", id),
            ]
          : [],
      ...readPaging(input),
    });
  },
  async get_attachment(input, context): Promise<unknown> {
    return { attachment: await readEntity(context, quickbooksAttachable, requiredInputString(input.id, "id")) };
  },
  async update_attachment(input, context): Promise<unknown> {
    const body = optionalRecord(input.body);
    if (!body) {
      throw providerInputError("body must be an object");
    }
    return { attachment: await updateEntity(context, quickbooksAttachable, input, body) };
  },
  async delete_attachment(input, context): Promise<unknown> {
    const result = await operateOnEntity(context, quickbooksAttachable, "delete", input);
    return { deleted: result.status === "Deleted", attachment: result };
  },
  async get_attachment_download_url(input, context): Promise<unknown> {
    const payload = await quickbooksRequest(context, {
      path: `download/${encodePathSegment(requiredInputString(input.id, "id"))}`,
      responseText: true,
    });
    return { download_url: optionalString(payload.text) ?? null };
  },
};

function requiredBody(input: Record<string, unknown>): Record<string, unknown> {
  const body = optionalRecord(input.body);
  if (!body) {
    throw providerInputError("body must be an object");
  }
  return body;
}

function listConditions(resource: QuickbooksResource, input: Record<string, unknown>): string[] {
  const name = optionalString(input.name_contains);
  return [
    ...(resource.hasActive ? [statusCondition(optionalString(input.status))] : []),
    ...(resource.nameColumn && name ? [containsCondition(resource.nameColumn, name)] : []),
    ...(resource.hasTxnDate ? txnDateConditions(input) : []),
  ];
}

/** The handler for one operation on one table entry. */
function resourceHandler(resource: QuickbooksResource, operation: QuickbooksResourceOperation): QuickbooksHandler {
  const { entity, key } = resource;
  switch (operation) {
    case "list":
      return (input, context) =>
        listEntities(context, {
          entity: entity.name,
          conditions: listConditions(resource, input),
          orderBy: optionalString(input.order_by) ?? resource.defaultOrder,
          descending: optionalBoolean(input.descending),
          ...readPaging(input),
        });
    case "get":
      return async (input, context) => ({
        [key]: await readEntity(context, entity, requiredInputString(input.id, "id")),
      });
    case "create":
      return async (input, context) => ({ [key]: await createEntity(context, entity, requiredBody(input)) });
    case "update":
      return async (input, context) => ({ [key]: await updateEntity(context, entity, input, requiredBody(input)) });
    case "delete":
      return async (input, context) => {
        if (resource.remove === "deactivate") {
          // Some entities, such as Department, reject a sparse update that omits their name.
          const fields: Record<string, unknown> = { Active: false };
          let syncToken = optionalString(input.sync_token);
          if (resource.nameColumn) {
            const current = await readEntity(context, entity, requiredInputString(input.id, "id"));
            fields[resource.nameColumn] = current[resource.nameColumn];
            syncToken ??= requiredString(
              current.SyncToken,
              `QuickBooks ${entity.name} SyncToken`,
              providerResponseError,
            );
          }
          return {
            deleted: true,
            [key]: await updateEntity(context, entity, { ...input, sync_token: syncToken }, fields),
          };
        }
        const result = await operateOnEntity(context, entity, "delete", input);
        return { deleted: result.status === "Deleted", [key]: result };
      };
  }
}

/** Generated handlers for every table entry, keyed by action name. Hand-written handlers override them. */
const resourceHandlers: Record<string, QuickbooksHandler> = Object.fromEntries(
  Object.values(quickbooksResources).flatMap((resource) =>
    resource.operations.map((operation) => [
      resourceActionName(resource, operation),
      resourceHandler(resource, operation),
    ]),
  ),
);

/** Resolve `object_name` to a table entry that supports the operation. */
function recordResource(input: Record<string, unknown>, operation: QuickbooksResourceOperation): QuickbooksResource {
  const objectName = requiredInputString(input.object_name, "object_name");
  const resource = Object.values(quickbooksResources).find((candidate) => candidate.entity.name === objectName);
  if (!resource?.operations.includes(operation)) {
    throw providerInputError(`object_name ${objectName} does not support ${operation}`);
  }
  return resource;
}

/** Generic record actions that pick the entity from `object_name` instead of from the action name. */
function recordHandler(operation: QuickbooksResourceOperation): QuickbooksHandler {
  return async (input, context) => {
    const resource = recordResource(input, operation);
    const output = optionalRecord(await resourceHandler(resource, operation)(input, context)) ?? {};
    // List output is already generic; the single-record outputs are keyed by the entity.
    return operation === "list" ? output : { record: output[resource.key], deleted: output.deleted };
  };
}

const recordHandlers: Record<string, QuickbooksHandler> = {
  list_records: recordHandler("list"),
  get_record: recordHandler("get"),
  create_record: recordHandler("create"),
  update_record: recordHandler("update"),
  delete_record: recordHandler("delete"),
};

/** Generated CRUD handlers first so the hand-written handlers override them. */
export const quickbooksActionHandlers: Record<string, QuickbooksHandler> = {
  ...resourceHandlers,
  ...recordHandlers,
  ...extraHandlers,
  ...handWrittenHandlers,
};

export const executors: ProviderExecutors = defineProviderExecutors<QuickbooksContext>({
  service,
  handlers: quickbooksActionHandlers,
  // Both API hosts are hardcoded literals chosen from the validated environment.
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<QuickbooksContext> {
    const credential = await context.getCredential(service);
    if (credential?.authType !== "oauth2") {
      throw new ProviderRequestError(401, "Configure QuickBooks credentials first.");
    }
    return createQuickbooksContext(oauthCompany(credential), fetcher, context.signal);
  },
});

/** The token plus the company and environment it belongs to, before the host is resolved. */
interface QuickbooksCompanyToken {
  accessToken: string;
  tokenType: string;
  realmId: string | undefined;
  environment: unknown;
}

/** An OAuth connection keeps the company in `providerSecret`, written by `oauth.ts` at consent. */
function oauthCompany(credential: Extract<ResolvedCredential, { authType: "oauth2" }>): QuickbooksCompanyToken {
  const stored = optionalRecord(credential.providerSecret);
  return {
    accessToken: credential.accessToken,
    tokenType: credential.tokenType,
    realmId: optionalString(stored?.realmId),
    environment: stored?.environment,
  };
}

function createQuickbooksContext(
  company: QuickbooksCompanyToken,
  fetcher: typeof fetch,
  signal: AbortSignal | undefined,
): QuickbooksContext {
  if (!company.realmId) {
    throw new ProviderRequestError(401, "The QuickBooks connection has no company ID (realmId). Reconnect QuickBooks.");
  }
  return {
    accessToken: company.accessToken,
    tokenType: company.tokenType,
    realmId: company.realmId,
    baseUrl: quickbooksBaseUrls[resolveQuickbooksEnvironment(company.environment)],
    fetcher,
    signal,
  };
}

async function validateCompany(context: QuickbooksContext): Promise<CredentialValidationResult> {
  const info = await getCompanyInfo(context, "validate");
  return {
    profile: {
      accountId: context.realmId,
      displayName: optionalString(info.CompanyName) ?? optionalString(info.LegalName) ?? context.realmId,
    },
  };
}

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher, signal }) {
    return validateCompany(createQuickbooksContext(oauthCompany(input), fetcher, signal));
  },
};
