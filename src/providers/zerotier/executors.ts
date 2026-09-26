import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { ZerotierActionContext } from "./runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalNumber,
  optionalObjectArray,
  optionalRecord,
  optionalString,
  optionalStringArray,
  requiredStringArray,
} from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  providerInputError,
  ProviderRequestError,
  requiredInputString,
  requireCustomCredential,
} from "../provider-runtime.ts";
import {
  createZerotierContext,
  parseZerotierApiVersion,
  requireZerotierApiVersion,
  validateZerotierCredential,
  zerotierAuthorizationHeader,
  zerotierList,
  zerotierRequest,
  zerotierResult,
  zerotierStatus,
  zerotierV1BaseUrl,
  zerotierV2BaseUrl,
} from "./runtime.ts";

const service = "zerotier";

type ZerotierHandler = ProviderRuntimeHandler<ZerotierActionContext>;

const id = (input: Record<string, unknown>, field: string): string =>
  encodePathSegment(requiredInputString(input[field], field));

const requiredStrings = (value: unknown, field: string): string[] =>
  requiredStringArray(value, field, providerInputError);

const iamResourcePath = (input: Record<string, unknown>): string => {
  const resourceType = requiredInputString(input.resourceType, "resourceType");
  if (resourceType !== "org" && resourceType !== "network-group" && resourceType !== "network") {
    throw providerInputError('resourceType must be "org", "network-group", or "network".');
  }
  return `/${resourceType}/${id(input, "resourceId")}/iam`;
};

const bool = (value: unknown): "true" | undefined => (value === true ? "true" : undefined);

export const zerotierActionHandlers: ProviderActionHandlers<"zerotier", ZerotierHandler> = {
  // ── Shared actions (dispatch on the connection's apiVersion) ──────────────
  async list_networks(input, ctx) {
    if (ctx.apiVersion === "v2") {
      const payload = await zerotierRequest(ctx, {
        path: "/network",
        query: {
          "org-id": optionalString(input.orgId) ?? ctx.orgId,
          stats: bool(input.stats),
          "permission-check": optionalStringArray(input.permissionCheck),
        },
      });
      return zerotierList(payload);
    }
    return zerotierList(await zerotierRequest(ctx, { path: "/network" }));
  },

  async get_network(input, ctx) {
    return zerotierResult(await zerotierRequest(ctx, { path: `/network/${id(input, "networkId")}` }));
  },

  async create_network(input, ctx) {
    if (ctx.apiVersion === "v2") {
      const groupId = optionalString(input.networkGroupId);
      if (!groupId) {
        throw providerInputError("networkGroupId is required for v2 (the network group the network is created under).");
      }
      const body = compactObject({
        name: optionalString(input.name),
        description: optionalString(input.description),
        config: input.config,
      });
      return zerotierResult(
        await zerotierRequest(ctx, {
          method: "POST",
          path: `/network-group/${encodePathSegment(groupId)}/network`,
          body,
        }),
      );
    }
    const config = { ...optionalRecord(input.config) };
    if (input.name !== undefined) {
      config.name = input.name;
    }
    return zerotierResult(await zerotierRequest(ctx, { method: "POST", path: "/network", body: { config } }));
  },

  async update_network(input, ctx) {
    const networkId = id(input, "networkId");
    if (ctx.apiVersion === "v2") {
      const body = compactObject({
        name: optionalString(input.name),
        description: optionalString(input.description),
        config: input.config,
      });
      return zerotierResult(await zerotierRequest(ctx, { method: "POST", path: `/network/${networkId}`, body }));
    }
    const config = { ...optionalRecord(input.config) };
    if (input.name !== undefined) {
      config.name = input.name;
    }
    return zerotierResult(
      await zerotierRequest(ctx, {
        method: "POST",
        path: `/network/${networkId}`,
        body: compactObject({ config, description: optionalString(input.description) }),
      }),
    );
  },

  async delete_network(input, ctx) {
    return zerotierStatus(await zerotierRequest(ctx, { method: "DELETE", path: `/network/${id(input, "networkId")}` }));
  },

  async list_members(input, ctx) {
    return zerotierList(await zerotierRequest(ctx, { path: `/network/${id(input, "networkId")}/member` }));
  },

  async get_member(input, ctx) {
    return zerotierResult(
      await zerotierRequest(ctx, {
        path: `/network/${id(input, "networkId")}/member/${id(input, "memberId")}`,
      }),
    );
  },

  async update_member(input, ctx) {
    const path = `/network/${id(input, "networkId")}/member/${id(input, "memberId")}`;
    if (ctx.apiVersion === "v2") {
      return zerotierResult(
        await zerotierRequest(ctx, {
          method: "POST",
          path,
          body: compactObject({
            name: optionalString(input.name),
            description: optionalString(input.description),
            activeBridge: optionalBoolean(input.activeBridge),
            noAutoAssignIps: optionalBoolean(input.noAutoAssignIps),
            ipv4Assignments: optionalStringArray(input.ipv4Assignments),
            ipv6Assignments: optionalStringArray(input.ipv6Assignments),
          }),
        }),
      );
    }
    const config = compactObject({
      authorized: optionalBoolean(input.authorized),
      activeBridge: optionalBoolean(input.activeBridge),
      noAutoAssignIps: optionalBoolean(input.noAutoAssignIps),
      ipAssignments: optionalStringArray(input.ipAssignments),
    });
    return zerotierResult(
      await zerotierRequest(ctx, {
        method: "POST",
        path,
        body: compactObject({
          name: optionalString(input.name),
          description: optionalString(input.description),
          config,
        }),
      }),
    );
  },

  async delete_member(input, ctx) {
    const networkId = id(input, "networkId");
    const memberId = requiredInputString(input.memberId, "memberId");
    if (ctx.apiVersion === "v2") {
      return zerotierStatus(
        await zerotierRequest(ctx, {
          method: "DELETE",
          path: `/network/${networkId}/member`,
          body: [{ deviceId: memberId }],
        }),
      );
    }
    return zerotierStatus(
      await zerotierRequest(ctx, {
        method: "DELETE",
        path: `/network/${networkId}/member/${encodePathSegment(memberId)}`,
      }),
    );
  },

  async authorize_member(input, ctx) {
    const path = `/network/${id(input, "networkId")}/member/${id(input, "memberId")}`;
    if (ctx.apiVersion === "v2") {
      return zerotierResult(await zerotierRequest(ctx, { method: "POST", path: `${path}/authorize`, body: {} }));
    }
    return zerotierResult(await zerotierRequest(ctx, { method: "POST", path, body: { config: { authorized: true } } }));
  },

  async deauthorize_member(input, ctx) {
    const path = `/network/${id(input, "networkId")}/member/${id(input, "memberId")}`;
    if (ctx.apiVersion === "v2") {
      return zerotierResult(await zerotierRequest(ctx, { method: "POST", path: `${path}/de-authorize`, body: {} }));
    }
    return zerotierResult(
      await zerotierRequest(ctx, { method: "POST", path, body: { config: { authorized: false } } }),
    );
  },

  async get_org(input, ctx) {
    const orgId = optionalString(input.orgId) ?? ctx.orgId;
    if (ctx.apiVersion === "v2") {
      if (!orgId) {
        throw providerInputError("orgId is required for v2 (no credential orgId configured either).");
      }
      return zerotierResult(await zerotierRequest(ctx, { path: `/org/${encodePathSegment(orgId)}` }));
    }
    return zerotierResult(await zerotierRequest(ctx, { path: orgId ? `/org/${encodePathSegment(orgId)}` : "/org" }));
  },

  // ── v1-only actions (Legacy Central, api.zerotier.com) ────────────────────
  async get_status(input, ctx) {
    requireZerotierApiVersion(ctx, "v1");
    return zerotierResult(await zerotierRequest(ctx, { path: "/status" }));
  },

  async get_random_token(input, ctx) {
    requireZerotierApiVersion(ctx, "v1");
    return zerotierResult(await zerotierRequest(ctx, { path: "/randomToken" }));
  },

  async list_org_members(input, ctx) {
    requireZerotierApiVersion(ctx, "v1");
    return zerotierList(await zerotierRequest(ctx, { path: `/org/${id(input, "orgId")}/user` }));
  },

  async list_invitations(input, ctx) {
    requireZerotierApiVersion(ctx, "v1");
    return zerotierList(await zerotierRequest(ctx, { path: "/org-invitation" }));
  },

  async create_invitation(input, ctx) {
    requireZerotierApiVersion(ctx, "v1");
    return zerotierResult(
      await zerotierRequest(ctx, {
        method: "POST",
        path: "/org-invitation",
        body: { email: requiredInputString(input.email, "email") },
      }),
    );
  },

  async get_invitation(input, ctx) {
    requireZerotierApiVersion(ctx, "v1");
    return zerotierResult(await zerotierRequest(ctx, { path: `/org-invitation/${id(input, "invitationId")}` }));
  },

  async accept_invitation(input, ctx) {
    requireZerotierApiVersion(ctx, "v1");
    return zerotierResult(
      await zerotierRequest(ctx, { method: "POST", path: `/org-invitation/${id(input, "invitationId")}`, body: {} }),
    );
  },

  async decline_invitation(input, ctx) {
    requireZerotierApiVersion(ctx, "v1");
    return zerotierStatus(
      await zerotierRequest(ctx, { method: "DELETE", path: `/org-invitation/${id(input, "invitationId")}` }),
    );
  },

  async get_user(input, ctx) {
    requireZerotierApiVersion(ctx, "v1");
    return zerotierResult(await zerotierRequest(ctx, { path: `/user/${id(input, "userId")}` }));
  },

  async update_user(input, ctx) {
    requireZerotierApiVersion(ctx, "v1");
    return zerotierResult(
      await zerotierRequest(ctx, {
        method: "POST",
        path: `/user/${id(input, "userId")}`,
        body: compactObject({
          displayName: optionalString(input.displayName),
          email: optionalString(input.email),
          smsNumber: optionalString(input.smsNumber),
        }),
      }),
    );
  },

  async delete_user(input, ctx) {
    requireZerotierApiVersion(ctx, "v1");
    return zerotierStatus(await zerotierRequest(ctx, { method: "DELETE", path: `/user/${id(input, "userId")}` }));
  },

  async add_user_token(input, ctx) {
    requireZerotierApiVersion(ctx, "v1");
    return zerotierResult(
      await zerotierRequest(ctx, {
        method: "POST",
        path: `/user/${id(input, "userId")}/token`,
        body: { tokenName: requiredInputString(input.tokenName, "tokenName") },
      }),
    );
  },

  async delete_user_token(input, ctx) {
    requireZerotierApiVersion(ctx, "v1");
    return zerotierStatus(
      await zerotierRequest(ctx, {
        method: "DELETE",
        path: `/user/${id(input, "userId")}/token/${encodePathSegment(requiredInputString(input.tokenName, "tokenName"))}`,
      }),
    );
  },

  async set_network_user_permissions(input, ctx) {
    requireZerotierApiVersion(ctx, "v1");
    return zerotierResult(
      await zerotierRequest(ctx, {
        method: "POST",
        path: `/network/${id(input, "networkId")}/users`,
        body: {
          id: requiredInputString(input.userId, "userId"),
          r: input.read === true,
          a: input.authorize === true,
          m: input.modify === true,
          d: input.delete === true,
        },
      }),
    );
  },

  // ── v2-only actions (New Central, central.zerotier.com) ───────────────────
  async list_orgs(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    const payload = await zerotierRequest(ctx, {
      path: "/org",
      query: {
        "permission-check": optionalStringArray(input.permissionCheck),
        latest: optionalStringArray(input.latest),
        stats: bool(input.stats),
      },
    });
    return zerotierList(payload);
  },

  async list_network_groups(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    const payload = await zerotierRequest(ctx, {
      path: "/network-group",
      query: {
        "org-id": optionalString(input.orgId) ?? ctx.orgId,
        stats: bool(input.stats),
        "permission-check": optionalStringArray(input.permissionCheck),
      },
    });
    return zerotierList(payload);
  },

  async get_network_group(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierResult(await zerotierRequest(ctx, { path: `/network-group/${id(input, "networkGroupId")}` }));
  },

  async create_network_group(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierResult(
      await zerotierRequest(ctx, {
        method: "POST",
        path: `/org/${id(input, "orgId")}/network-group`,
        body: compactObject({
          name: requiredInputString(input.name, "name"),
          description: optionalString(input.description),
        }),
      }),
    );
  },

  async update_network_group(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierResult(
      await zerotierRequest(ctx, {
        method: "POST",
        path: `/network-group/${id(input, "networkGroupId")}`,
        body: compactObject({
          name: optionalString(input.name),
          description: optionalString(input.description),
        }),
      }),
    );
  },

  async delete_network_group(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierStatus(
      await zerotierRequest(ctx, { method: "DELETE", path: `/network-group/${id(input, "networkGroupId")}` }),
    );
  },

  async list_network_group_networks(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    const payload = await zerotierRequest(ctx, {
      path: `/network-group/${id(input, "networkGroupId")}/network`,
      query: {
        stats: bool(input.stats),
        "permission-check": optionalStringArray(input.permissionCheck),
      },
    });
    return zerotierList(payload);
  },

  async get_iam(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierList(await zerotierRequest(ctx, { path: iamResourcePath(input) }));
  },

  async add_iam(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierList(
      await zerotierRequest(ctx, {
        method: "POST",
        path: iamResourcePath(input),
        body: [
          {
            principal: requiredInputString(input.principal, "principal"),
            roles: requiredStrings(input.roles, "roles"),
          },
        ],
      }),
    );
  },

  async replace_iam(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierList(
      await zerotierRequest(ctx, {
        method: "PUT",
        path: iamResourcePath(input),
        body: optionalObjectArray(input.assignments, "assignments"),
      }),
    );
  },

  async remove_iam(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierList(
      await zerotierRequest(ctx, {
        method: "DELETE",
        path: iamResourcePath(input),
        body: [
          {
            principal: requiredInputString(input.principal, "principal"),
            roles: requiredStrings(input.roles, "roles"),
          },
        ],
      }),
    );
  },

  async get_org_iam_tree(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierResult(await zerotierRequest(ctx, { path: `/org/${id(input, "orgId")}/iam-tree` }));
  },

  async search_principals(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    const payload = await zerotierRequest(ctx, {
      path: `/org/${id(input, "orgId")}/principal`,
      query: {
        search: requiredInputString(input.search, "search"),
        "principal-type": optionalStringArray(input.principalType),
      },
    });
    return zerotierList(payload);
  },

  async invite_users(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierResult(
      await zerotierRequest(ctx, {
        method: "POST",
        path: `/org/${id(input, "orgId")}/invite-users`,
        body: { emails: requiredStrings(input.emails, "emails") },
      }),
    );
  },

  async get_org_subscription(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierResult(await zerotierRequest(ctx, { path: `/org/${id(input, "orgId")}/subscription` }));
  },

  async list_service_accounts(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierList(await zerotierRequest(ctx, { path: `/org/${id(input, "orgId")}/service-account` }));
  },

  async create_service_account(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierResult(
      await zerotierRequest(ctx, {
        method: "POST",
        path: `/org/${id(input, "orgId")}/service-account`,
        body: compactObject({
          id: requiredInputString(input.id, "id"),
          name: requiredInputString(input.name, "name"),
          description: optionalString(input.description),
        }),
      }),
    );
  },

  async get_service_account(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierResult(await zerotierRequest(ctx, { path: `/service-account/${id(input, "serviceAccountId")}` }));
  },

  async update_service_account(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierResult(
      await zerotierRequest(ctx, {
        method: "POST",
        path: `/service-account/${id(input, "serviceAccountId")}`,
        body: compactObject({
          name: optionalString(input.name),
          description: optionalString(input.description),
        }),
      }),
    );
  },

  async delete_service_account(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierStatus(
      await zerotierRequest(ctx, { method: "DELETE", path: `/service-account/${id(input, "serviceAccountId")}` }),
    );
  },

  async create_api_key(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierResult(
      await zerotierRequest(ctx, {
        method: "POST",
        path: `/service-account/${id(input, "serviceAccountId")}/api-key`,
        body: compactObject({
          expires: requiredInputString(input.expires, "expires"),
          description: optionalString(input.description),
        }),
      }),
    );
  },

  async get_api_key(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierResult(await zerotierRequest(ctx, { path: `/api-key/${id(input, "apiKeyId")}` }));
  },

  async update_api_key(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierResult(
      await zerotierRequest(ctx, {
        method: "POST",
        path: `/api-key/${id(input, "apiKeyId")}`,
        body: compactObject({ description: optionalString(input.description) }),
      }),
    );
  },

  async delete_api_key(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierStatus(await zerotierRequest(ctx, { method: "DELETE", path: `/api-key/${id(input, "apiKeyId")}` }));
  },

  async list_webhooks(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierList(await zerotierRequest(ctx, { path: `/org/${id(input, "orgId")}/webhook` }));
  },

  async create_webhook(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierResult(
      await zerotierRequest(ctx, {
        method: "POST",
        path: `/org/${id(input, "orgId")}/webhook`,
        body: compactObject({
          url: requiredInputString(input.url, "url"),
          eventList: requiredStrings(input.eventList, "eventList"),
          description: optionalString(input.description),
        }),
      }),
    );
  },

  async get_webhook(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierResult(await zerotierRequest(ctx, { path: `/webhook/${id(input, "webhookId")}` }));
  },

  async update_webhook(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierResult(
      await zerotierRequest(ctx, {
        method: "POST",
        path: `/webhook/${id(input, "webhookId")}`,
        body: compactObject({
          url: optionalString(input.url),
          eventList: optionalStringArray(input.eventList),
          description: optionalString(input.description),
        }),
      }),
    );
  },

  async delete_webhook(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierStatus(await zerotierRequest(ctx, { method: "DELETE", path: `/webhook/${id(input, "webhookId")}` }));
  },

  async rotate_webhook_secret(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierResult(
      await zerotierRequest(ctx, {
        method: "POST",
        path: `/webhook/${id(input, "webhookId")}/rotate-secret`,
        body: compactObject({ overlapHours: optionalNumber(input.overlapHours) }),
      }),
    );
  },

  async delete_webhook_secret(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierStatus(
      await zerotierRequest(ctx, { method: "DELETE", path: `/webhook-secret/${id(input, "webhookSecretId")}` }),
    );
  },

  async check_permissions(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierList(
      await zerotierRequest(ctx, { method: "POST", path: "/user/check-permissions", body: input.checks ?? [] }),
    );
  },

  async update_current_user(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierResult(
      await zerotierRequest(ctx, {
        method: "POST",
        path: "/user",
        body: compactObject({
          firstName: optionalString(input.firstName),
          lastName: optionalString(input.lastName),
        }),
      }),
    );
  },

  async delete_current_user(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierStatus(await zerotierRequest(ctx, { method: "DELETE", path: "/user" }));
  },

  async add_members(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierList(
      await zerotierRequest(ctx, {
        method: "POST",
        path: `/network/${id(input, "networkId")}/member`,
        body: optionalObjectArray(input.members, "members"),
      }),
    );
  },

  async remove_members(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    const body = requiredStrings(input.deviceIds, "deviceIds").map((deviceId) => ({ deviceId }));
    return zerotierList(
      await zerotierRequest(ctx, { method: "DELETE", path: `/network/${id(input, "networkId")}/member`, body }),
    );
  },

  async authorize_members(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierList(
      await zerotierRequest(ctx, {
        method: "POST",
        path: `/network/${id(input, "networkId")}/member/authorize`,
        body: requiredStrings(input.deviceIds, "deviceIds"),
      }),
    );
  },

  async deauthorize_members(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierList(
      await zerotierRequest(ctx, {
        method: "POST",
        path: `/network/${id(input, "networkId")}/member/de-authorize`,
        body: requiredStrings(input.deviceIds, "deviceIds"),
      }),
    );
  },

  async reject_members(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierList(
      await zerotierRequest(ctx, {
        method: "POST",
        path: `/network/${id(input, "networkId")}/member/reject`,
        body: requiredStrings(input.deviceIds, "deviceIds"),
      }),
    );
  },

  async reject_member(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierResult(
      await zerotierRequest(ctx, {
        method: "POST",
        path: `/network/${id(input, "networkId")}/member/${id(input, "memberId")}/reject`,
        body: {},
      }),
    );
  },

  async get_flow_rules(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierResult(
      await zerotierRequest(ctx, { path: `/network/${id(input, "networkId")}/flow-rule`, beta: true }),
    );
  },

  async update_flow_rules(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierResult(
      await zerotierRequest(ctx, {
        method: "POST",
        path: `/network/${id(input, "networkId")}/flow-rule`,
        body: compactObject({
          kind: requiredInputString(input.kind, "kind"),
          config: input.config,
        }),
        beta: true,
      }),
    );
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<ZerotierActionContext>({
  service,
  handlers: zerotierActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<ZerotierActionContext> {
    const credential = await requireCustomCredential(context, service);
    return createZerotierContext(credential.values, fetcher, context.signal);
  },
  fallbackMessage: "ZeroTier request failed",
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireCustomCredential(context, service);
    return parseZerotierApiVersion(credential.values.apiVersion) === "v2" ? zerotierV2BaseUrl : zerotierV1BaseUrl;
  },
  auth: { type: "none" },
  async customizeRequest({ context, headers }) {
    const credential = await requireCustomCredential(context, service);
    const apiKey = optionalString(credential.values.apiKey);
    if (!apiKey) {
      throw new ProviderRequestError(401, "Configure zerotier apiKey first.");
    }
    headers.set(
      "authorization",
      zerotierAuthorizationHeader({ apiVersion: parseZerotierApiVersion(credential.values.apiVersion), apiKey }),
    );
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateZerotierCredential(input.values, fetcher, signal);
  },
};
