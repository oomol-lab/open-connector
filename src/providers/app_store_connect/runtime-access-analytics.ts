import type { AppStoreConnectContext, AppStoreConnectHandlers } from "./runtime-helpers.ts";

import { looseArray, rawStringOrNull, optionalBoolean, pickOptionalString } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { requiredInputString, requiredResponseRecord } from "../provider-runtime.ts";
import {
  createResource,
  deleteResource,
  getResource,
  listPage,
  modifyRelationship,
  readAppStoreConnectId,
  readCommaSeparatedList,
  readIdentifierList,
  readIntegerQuery,
  readStringList,
  requestAppStoreConnect,
  requireAnyAttribute,
  resourcePath,
  toManyLinkage,
  toOneLinkage,
  updateResource,
} from "./runtime-helpers.ts";

const xcodeMetricsMediaType = "application/vnd.apple.xcode-metrics+json";
const diagnosticLogsMediaType = "application/vnd.apple.diagnostic-logs+json";

export const appStoreConnectAccessAnalyticsHandlers: AppStoreConnectHandlers = {
  async update_user(input, context) {
    const userId = readAppStoreConnectId(input.userId, "userId");
    const roles = readStringList(input.roles);
    const allAppsVisible = optionalBoolean(input.allAppsVisible);
    const provisioningAllowed = optionalBoolean(input.provisioningAllowed);
    const visibleAppIds = readOptionalIdentifierList(input.visibleAppIds, "visibleAppIds");
    requireAnyAttribute(
      { roles, allAppsVisible, provisioningAllowed, visibleAppIds },
      "At least one of roles, allAppsVisible, provisioningAllowed or visibleAppIds is required",
    );

    const user = await updateResource(context, {
      path: resourcePath("/v1/users", userId),
      type: "users",
      id: userId,
      label: "App Store Connect user",
      attributes: { roles, allAppsVisible, provisioningAllowed },
      relationships: visibleAppIds ? { visibleApps: toManyLinkage("apps", visibleAppIds) } : undefined,
    });
    return { user };
  },

  async delete_user(input, context) {
    const userId = readAppStoreConnectId(input.userId, "userId");
    await deleteResource(context, resourcePath("/v1/users", userId), "Removing the App Store Connect user");
    return { id: userId, deleted: true };
  },

  async list_user_visible_apps(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath("/v1/users", readAppStoreConnectId(input.userId, "userId"), "visibleApps"),
      label: "App Store Connect app",
    });
    return { apps: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async add_visible_apps_to_user(input, context) {
    const userId = readAppStoreConnectId(input.userId, "userId");
    const appIds = readIdentifierList(input.appIds, "appIds");
    await modifyRelationship(context, {
      method: "POST",
      path: resourcePath("/v1/users", userId, "relationships/visibleApps"),
      type: "apps",
      ids: appIds,
      label: "Adding visible apps to the App Store Connect user",
    });
    return { userId, appIds, added: true };
  },

  async remove_visible_apps_from_user(input, context) {
    const userId = readAppStoreConnectId(input.userId, "userId");
    const appIds = readIdentifierList(input.appIds, "appIds");
    await modifyRelationship(context, {
      method: "DELETE",
      path: resourcePath("/v1/users", userId, "relationships/visibleApps"),
      type: "apps",
      ids: appIds,
      label: "Removing visible apps from the App Store Connect user",
    });
    return { userId, appIds, removed: true };
  },

  async replace_user_visible_apps(input, context) {
    const userId = readAppStoreConnectId(input.userId, "userId");
    const appIds = readIdentifierList(input.appIds, "appIds");
    await modifyRelationship(context, {
      method: "PATCH",
      path: resourcePath("/v1/users", userId, "relationships/visibleApps"),
      type: "apps",
      ids: appIds,
      label: "Replacing the visible apps of the App Store Connect user",
    });
    return { userId, appIds, replaced: true };
  },

  async list_user_invitations(input, context) {
    const page = await listPage(context, input, {
      path: "/v1/userInvitations",
      label: "App Store Connect user invitation",
      query: {
        "filter[email]": pickOptionalString(input, "email"),
        "filter[roles]": readCommaSeparatedList(input.roles),
        "filter[visibleApps]": pickOptionalString(input, "visibleAppId"),
        "sort": pickOptionalString(input, "sort"),
      },
    });
    return { userInvitations: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_user_invitation(input, context) {
    return {
      userInvitation: await getResource(
        context,
        resourcePath("/v1/userInvitations", readAppStoreConnectId(input.userInvitationId, "userInvitationId")),
        "App Store Connect user invitation",
      ),
    };
  },

  async invite_user(input, context) {
    const visibleAppIds = readOptionalIdentifierList(input.visibleAppIds, "visibleAppIds");
    const userInvitation = await createResource(context, {
      path: "/v1/userInvitations",
      type: "userInvitations",
      label: "App Store Connect user invitation",
      attributes: {
        email: requiredInputString(input.email, "email"),
        firstName: requiredInputString(input.firstName, "firstName"),
        lastName: requiredInputString(input.lastName, "lastName"),
        roles: readRequiredRoles(input.roles),
        allAppsVisible: optionalBoolean(input.allAppsVisible),
        provisioningAllowed: optionalBoolean(input.provisioningAllowed),
      },
      relationships: visibleAppIds ? { visibleApps: toManyLinkage("apps", visibleAppIds) } : undefined,
    });
    return { userInvitation };
  },

  async cancel_user_invitation(input, context) {
    const userInvitationId = readAppStoreConnectId(input.userInvitationId, "userInvitationId");
    await deleteResource(
      context,
      resourcePath("/v1/userInvitations", userInvitationId),
      "Cancelling the App Store Connect user invitation",
    );
    return { id: userInvitationId, deleted: true };
  },

  async list_user_invitation_visible_apps(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v1/userInvitations",
        readAppStoreConnectId(input.userInvitationId, "userInvitationId"),
        "visibleApps",
      ),
      label: "App Store Connect app",
    });
    return { apps: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async list_actors(input, context) {
    const page = await listPage(context, input, {
      path: "/v1/actors",
      label: "App Store Connect actor",

      query: { "filter[id]": readIdentifierList(input.actorIds, "actorIds").join(",") },
    });
    return { actors: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_actor(input, context) {
    return {
      actor: await getResource(
        context,
        resourcePath("/v1/actors", readAppStoreConnectId(input.actorId, "actorId")),
        "App Store Connect actor",
      ),
    };
  },

  async list_sandbox_testers(input, context) {
    const page = await listPage(context, input, {
      path: "/v2/sandboxTesters",
      label: "App Store Connect sandbox tester",
    });
    return { sandboxTesters: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async update_sandbox_tester(input, context) {
    const sandboxTesterId = readAppStoreConnectId(input.sandboxTesterId, "sandboxTesterId");
    const territory = pickOptionalString(input, "territory");
    const interruptPurchases = optionalBoolean(input.interruptPurchases);
    const subscriptionRenewalRate = pickOptionalString(input, "subscriptionRenewalRate");
    requireAnyAttribute(
      { territory, interruptPurchases, subscriptionRenewalRate },
      "At least one of territory, interruptPurchases or subscriptionRenewalRate is required",
    );

    const sandboxTester = await updateResource(context, {
      path: resourcePath("/v2/sandboxTesters", sandboxTesterId),
      type: "sandboxTesters",
      id: sandboxTesterId,
      label: "App Store Connect sandbox tester",
      attributes: { territory, interruptPurchases, subscriptionRenewalRate },
    });
    return { sandboxTester };
  },

  async clear_sandbox_tester_purchase_history(input, context) {
    const sandboxTesterIds = readIdentifierList(input.sandboxTesterIds, "sandboxTesterIds");

    const request = await createResource(context, {
      path: "/v2/sandboxTestersClearPurchaseHistoryRequest",
      type: "sandboxTestersClearPurchaseHistoryRequest",
      label: "App Store Connect sandbox purchase history reset",
      relationships: { sandboxTesters: toManyLinkage("sandboxTesters", sandboxTesterIds) },
    });
    return { id: request.id, sandboxTesterIds, cleared: true };
  },

  async list_analytics_report_requests(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath("/v1/apps", readAppStoreConnectId(input.appId, "appId"), "analyticsReportRequests"),
      label: "App Store Connect analytics report request",
      query: { "filter[accessType]": pickOptionalString(input, "accessType") },
    });
    return { analyticsReportRequests: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_analytics_report_request(input, context) {
    return {
      analyticsReportRequest: await getResource(
        context,
        resourcePath(
          "/v1/analyticsReportRequests",
          readAppStoreConnectId(input.analyticsReportRequestId, "analyticsReportRequestId"),
        ),
        "App Store Connect analytics report request",
      ),
    };
  },

  async create_analytics_report_request(input, context) {
    const analyticsReportRequest = await createResource(context, {
      path: "/v1/analyticsReportRequests",
      type: "analyticsReportRequests",
      label: "App Store Connect analytics report request",
      attributes: { accessType: requiredInputString(input.accessType, "accessType") },
      relationships: {
        app: toOneLinkage("apps", readAppStoreConnectId(input.appId, "appId")),
      },
    });
    return { analyticsReportRequest };
  },

  async delete_analytics_report_request(input, context) {
    const analyticsReportRequestId = readAppStoreConnectId(input.analyticsReportRequestId, "analyticsReportRequestId");
    await deleteResource(
      context,
      resourcePath("/v1/analyticsReportRequests", analyticsReportRequestId),
      "Deleting the App Store Connect analytics report request",
    );
    return { id: analyticsReportRequestId, deleted: true };
  },

  async list_analytics_reports(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v1/analyticsReportRequests",
        readAppStoreConnectId(input.analyticsReportRequestId, "analyticsReportRequestId"),
        "reports",
      ),
      label: "App Store Connect analytics report",
      query: {
        "filter[category]": pickOptionalString(input, "category"),
        "filter[name]": pickOptionalString(input, "name"),
      },
    });
    return { analyticsReports: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_analytics_report(input, context) {
    return {
      analyticsReport: await getResource(
        context,
        resourcePath("/v1/analyticsReports", readAppStoreConnectId(input.analyticsReportId, "analyticsReportId")),
        "App Store Connect analytics report",
      ),
    };
  },

  async list_analytics_report_instances(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v1/analyticsReports",
        readAppStoreConnectId(input.analyticsReportId, "analyticsReportId"),
        "instances",
      ),
      label: "App Store Connect analytics report instance",
      query: {
        "filter[granularity]": pickOptionalString(input, "granularity"),
        "filter[processingDate]": pickOptionalString(input, "processingDate"),
      },
    });
    return { analyticsReportInstances: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_analytics_report_instance(input, context) {
    return {
      analyticsReportInstance: await getResource(
        context,
        resourcePath(
          "/v1/analyticsReportInstances",
          readAppStoreConnectId(input.analyticsReportInstanceId, "analyticsReportInstanceId"),
        ),
        "App Store Connect analytics report instance",
      ),
    };
  },

  async list_analytics_report_segments(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v1/analyticsReportInstances",
        readAppStoreConnectId(input.analyticsReportInstanceId, "analyticsReportInstanceId"),
        "segments",
      ),
      label: "App Store Connect analytics report segment",
    });
    return { analyticsReportSegments: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async list_diagnostic_signatures(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath("/v1/builds", readAppStoreConnectId(input.buildId, "buildId"), "diagnosticSignatures"),
      label: "App Store Connect diagnostic signature",
      query: { "filter[diagnosticType]": pickOptionalString(input, "diagnosticType") },
    });
    return { diagnosticSignatures: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_diagnostic_signature_logs(input, context) {
    const label = "App Store Connect diagnostic logs";
    const { payload } = await requestAppStoreConnect(withAcceptMediaType(context, diagnosticLogsMediaType), {
      path: resourcePath(
        "/v1/diagnosticSignatures",
        readAppStoreConnectId(input.diagnosticSignatureId, "diagnosticSignatureId"),
        "logs",
      ),
      query: { limit: readIntegerQuery(input.limit) },
    });

    const document = requiredResponseRecord(payload, label);
    return {
      version: rawStringOrNull(document.version),
      productData: looseArray(document.productData).map((item) =>
        requiredResponseRecord(item, `${label} product data item`),
      ),
    };
  },

  async get_app_perf_power_metrics(input, context) {
    return readPerfPowerMetrics(
      context,
      input,
      resourcePath("/v1/apps", readAppStoreConnectId(input.appId, "appId"), "perfPowerMetrics"),
    );
  },

  async get_build_perf_power_metrics(input, context) {
    return readPerfPowerMetrics(
      context,
      input,
      resourcePath("/v1/builds", readAppStoreConnectId(input.buildId, "buildId"), "perfPowerMetrics"),
    );
  },
};

async function readPerfPowerMetrics(
  context: AppStoreConnectContext,
  input: Record<string, unknown>,
  path: string,
): Promise<{ metrics: Record<string, unknown> }> {
  const { payload } = await requestAppStoreConnect(withAcceptMediaType(context, xcodeMetricsMediaType), {
    path,
    query: {
      "filter[platform]": pickOptionalString(input, "platform"),
      "filter[metricType]": readCommaSeparatedList(input.metricTypes),
      "filter[deviceType]": readCommaSeparatedList(input.deviceTypes),
    },
  });
  return { metrics: requiredResponseRecord(payload, "App Store Connect performance metrics") };
}

function withAcceptMediaType(context: AppStoreConnectContext, mediaType: string): AppStoreConnectContext {
  const fetcher = ((url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set("accept", mediaType);
    return context.fetcher(url, { ...init, headers });
  }) as typeof fetch;
  return { authorization: context.authorization, fetcher };
}

function readOptionalIdentifierList(value: unknown, fieldName: string): string[] | undefined {
  return value === undefined || value === null ? undefined : readIdentifierList(value, fieldName);
}

function readRequiredRoles(value: unknown): string[] {
  const roles = readStringList(value);
  if (!roles?.length) {
    throw new ProviderRequestError(400, "roles must contain at least one role");
  }
  return roles;
}
