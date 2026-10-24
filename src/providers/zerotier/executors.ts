import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-executors.ts";
import type { ZerotierActionContext } from "./runtime.ts";

import {
  booleanString,
  compactObject,
  objectArray,
  optionalBoolean,
  optionalNumber,
  optionalRawString,
  optionalRecord,
  optionalString,
  optionalStringArray,
  requiredStringArray,
} from "../../core/cast.ts";
import { defineProviderExecutors, requireCustomCredential } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { providerInputError, ProviderRequestError, requiredInputString } from "../provider-runtime.ts";
import {
  createZerotierContext,
  parseZerotierApiVersion,
  requireZerotierApiVersion,
  validateZerotierCredential,
  zerotierAuthorizationHeader,
  zerotierList,
  zerotierOrgId,
  zerotierPathSegment,
  zerotierRequest,
  zerotierResult,
  zerotierStatus,
  zerotierV1BaseUrl,
  zerotierV2BaseUrl,
} from "./runtime.ts";

const service = "zerotier";

type ZerotierHandler = ProviderRuntimeHandler<ZerotierActionContext>;

/** Read a required ID from the action input as one encoded path segment. */
const id = (input: Record<string, unknown>, field: string): string =>
  zerotierPathSegment(requiredInputString(input[field], field), field);

const iamResourcePath = (input: Record<string, unknown>): string => {
  const resourceType = requiredInputString(input.resourceType, "resourceType");
  if (resourceType !== "org" && resourceType !== "network-group" && resourceType !== "network") {
    throw providerInputError('resourceType must be "org", "network-group", or "network".');
  }
  return `/${resourceType}/${id(input, "resourceId")}/iam`;
};

export const zerotierActionHandlers: ProviderActionHandlers<"zerotier", ZerotierHandler> = {
  // ── Shared actions (dispatch on the connection's apiVersion) ──────────────
  async list_networks(input, ctx) {
    if (ctx.apiVersion === "v2") {
      const payload = await zerotierRequest(ctx, {
        path: "/network",
        query: {
          "org-id": zerotierOrgId(ctx, input),
          stats: booleanString(input.stats),
          "permission-check": optionalStringArray(input.permissionCheck),
        },
      });
      return zerotierList(payload);
    }
    // v1 GET /network takes no filters, so dropping these would widen the result
    // past the scope the caller asked for. The connection orgId is a v2-only
    // default and is deliberately not checked here.
    if (input.orgId !== undefined || input.stats !== undefined || input.permissionCheck !== undefined) {
      throw providerInputError(
        "orgId, stats, and permissionCheck are v2 only; v1 GET /network lists every network the token can access.",
      );
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
        name: requiredInputString(input.name, "name"),
        description: optionalRawString(input.description),
        config: input.config,
      });
      return zerotierResult(
        await zerotierRequest(ctx, {
          method: "POST",
          path: `/network-group/${zerotierPathSegment(groupId, "networkGroupId")}/network`,
          body,
        }),
      );
    }
    if (input.networkGroupId !== undefined) {
      throw providerInputError("networkGroupId is v2 only; v1 networks have no network group.");
    }
    const config = { ...optionalRecord(input.config) };
    if (input.name !== undefined) {
      config.name = input.name;
    }
    return zerotierResult(
      await zerotierRequest(ctx, {
        method: "POST",
        path: "/network",
        body: compactObject({ config, description: optionalRawString(input.description) }),
      }),
    );
  },

  async update_network(input, ctx) {
    const networkId = id(input, "networkId");
    if (ctx.apiVersion === "v2") {
      const body = compactObject({
        name: optionalRawString(input.name),
        description: optionalRawString(input.description),
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
        body: compactObject({ config, description: optionalRawString(input.description) }),
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
      // The v2 member update body has no authorization field; dropping it would
      // report a de-authorization that never happened.
      if (input.authorized !== undefined) {
        throw providerInputError(
          "authorized is not supported by the v2 member update; use authorize_member or deauthorize_member.",
        );
      }
      if (input.ipAssignments !== undefined) {
        throw providerInputError("ipAssignments is v1 only; use ipv4Assignments/ipv6Assignments on v2.");
      }
      return zerotierResult(
        await zerotierRequest(ctx, {
          method: "POST",
          path,
          body: compactObject({
            name: optionalRawString(input.name),
            description: optionalRawString(input.description),
            activeBridge: optionalBoolean(input.activeBridge),
            noAutoAssignIps: optionalBoolean(input.noAutoAssignIps),
            ipv4Assignments: optionalStringArray(input.ipv4Assignments),
            ipv6Assignments: optionalStringArray(input.ipv6Assignments),
          }),
        }),
      );
    }
    if (input.ipv4Assignments !== undefined || input.ipv6Assignments !== undefined) {
      throw providerInputError("ipv4Assignments/ipv6Assignments are v2 only; use ipAssignments on v1.");
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
          name: optionalRawString(input.name),
          description: optionalRawString(input.description),
          config,
        }),
      }),
    );
  },

  async delete_member(input, ctx) {
    const networkId = id(input, "networkId");
    const memberId = requiredInputString(input.memberId, "memberId");
    const memberSegment = zerotierPathSegment(memberId, "memberId");
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
        path: `/network/${networkId}/member/${memberSegment}`,
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
    if (ctx.apiVersion === "v2") {
      const orgId = zerotierOrgId(ctx, input);
      if (!orgId) {
        throw providerInputError("orgId is required for v2 (no credential orgId configured either).");
      }
      return zerotierResult(await zerotierRequest(ctx, { path: `/org/${zerotierPathSegment(orgId, "orgId")}` }));
    }
    // The connection orgId is a v2-only default, so v1 reads the current user's org unless the input names one.
    const orgId = optionalString(input.orgId);
    return zerotierResult(
      await zerotierRequest(ctx, { path: orgId ? `/org/${zerotierPathSegment(orgId, "orgId")}` : "/org" }),
    );
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
          displayName: optionalRawString(input.displayName),
          smsNumber: optionalRawString(input.smsNumber),
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
        body: {
          tokenName: requiredInputString(input.tokenName, "tokenName"),
          token: requiredInputString(input.token, "token"),
        },
      }),
    );
  },

  async delete_user_token(input, ctx) {
    requireZerotierApiVersion(ctx, "v1");
    return zerotierStatus(
      await zerotierRequest(ctx, {
        method: "DELETE",
        path: `/user/${id(input, "userId")}/token/${id(input, "tokenName")}`,
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
        stats: booleanString(input.stats),
      },
    });
    return zerotierList(payload);
  },

  async list_network_groups(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    const payload = await zerotierRequest(ctx, {
      path: "/network-group",
      query: {
        "org-id": zerotierOrgId(ctx, input),
        stats: booleanString(input.stats),
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
          description: optionalRawString(input.description),
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
          name: optionalRawString(input.name),
          description: optionalRawString(input.description),
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
        stats: booleanString(input.stats),
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
    return zerotierStatus(
      await zerotierRequest(ctx, {
        method: "POST",
        path: iamResourcePath(input),
        body: [
          {
            principal: requiredInputString(input.principal, "principal"),
            roles: requiredStringArray(input.roles, "roles", providerInputError),
          },
        ],
      }),
    );
  },

  async replace_iam(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierStatus(
      await zerotierRequest(ctx, {
        method: "PUT",
        path: iamResourcePath(input),
        body: objectArray(input.assignments, "assignments", providerInputError),
      }),
    );
  },

  async remove_iam(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierStatus(
      await zerotierRequest(ctx, {
        method: "DELETE",
        path: iamResourcePath(input),
        body: [
          {
            principal: requiredInputString(input.principal, "principal"),
            roles: requiredStringArray(input.roles, "roles", providerInputError),
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
        body: { emails: requiredStringArray(input.emails, "emails", providerInputError) },
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
          description: optionalRawString(input.description),
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
          name: optionalRawString(input.name),
          description: optionalRawString(input.description),
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
          description: optionalRawString(input.description),
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
        body: compactObject({ description: optionalRawString(input.description) }),
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
          eventList: requiredStringArray(input.eventList, "eventList", providerInputError),
          description: optionalRawString(input.description),
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
          description: optionalRawString(input.description),
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
          firstName: optionalRawString(input.firstName),
          lastName: optionalRawString(input.lastName),
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
        body: objectArray(input.members, "members", providerInputError),
      }),
    );
  },

  async remove_members(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    const body = requiredStringArray(input.deviceIds, "deviceIds", providerInputError).map((deviceId) => ({
      deviceId,
    }));
    return zerotierStatus(
      await zerotierRequest(ctx, { method: "DELETE", path: `/network/${id(input, "networkId")}/member`, body }),
    );
  },

  async authorize_members(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierStatus(
      await zerotierRequest(ctx, {
        method: "POST",
        path: `/network/${id(input, "networkId")}/member/authorize`,
        body: requiredStringArray(input.deviceIds, "deviceIds", providerInputError),
      }),
    );
  },

  async deauthorize_members(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierStatus(
      await zerotierRequest(ctx, {
        method: "POST",
        path: `/network/${id(input, "networkId")}/member/de-authorize`,
        body: requiredStringArray(input.deviceIds, "deviceIds", providerInputError),
      }),
    );
  },

  async reject_members(input, ctx) {
    requireZerotierApiVersion(ctx, "v2");
    return zerotierStatus(
      await zerotierRequest(ctx, {
        method: "POST",
        path: `/network/${id(input, "networkId")}/member/reject`,
        body: requiredStringArray(input.deviceIds, "deviceIds", providerInputError),
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
