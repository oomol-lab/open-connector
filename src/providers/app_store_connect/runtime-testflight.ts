import type { AppStoreConnectHandlers } from "./runtime-helpers.ts";

import {
  recordOrEmpty,
  optionalInteger,
  rawStringOrNull,
  optionalBoolean,
  booleanString,
  pickOptionalString,
} from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { requiredInputString } from "../provider-runtime.ts";
import {
  createResource,
  deleteResource,
  listPage,
  modifyRelationship,
  normalizeResource,
  readAppStoreConnectId,
  readBetaReviewSubmissionSummary,
  readCollection,
  readIdentifierList,
  readResource,
  readStringList,
  requestAppStoreConnect,
  resourcePath,
  toManyLinkage,
  toOneLinkage,
  updateResource,
} from "./runtime-helpers.ts";

export const appStoreConnectTestFlightHandlers: AppStoreConnectHandlers = {
  async list_beta_groups(input, context) {
    const page = await listPage(context, input, {
      path: "/v1/betaGroups",
      label: "App Store Connect beta group",
      query: {
        "filter[app]": readAppStoreConnectId(input.appId, "appId"),
        "filter[name]": pickOptionalString(input, "name"),
        "filter[isInternalGroup]": booleanString(input.isInternalGroup),
        "filter[publicLinkEnabled]": booleanString(input.publicLinkEnabled),
      },
    });
    return { betaGroups: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async create_beta_group(input, context) {
    const betaGroup = await createResource(context, {
      path: "/v1/betaGroups",
      type: "betaGroups",
      label: "App Store Connect beta group",
      attributes: {
        name: requiredInputString(input.name, "name"),
        publicLinkEnabled: optionalBoolean(input.publicLinkEnabled),
        publicLinkLimitEnabled: optionalBoolean(input.publicLinkLimitEnabled),
        publicLinkLimit: optionalInteger(input.publicLinkLimit),
        feedbackEnabled: optionalBoolean(input.feedbackEnabled),
        hasAccessToAllBuilds: optionalBoolean(input.hasAccessToAllBuilds),
      },
      relationships: {
        app: toOneLinkage("apps", readAppStoreConnectId(input.appId, "appId")),
      },
    });
    return { betaGroup };
  },

  async delete_beta_group(input, context) {
    const betaGroupId = readAppStoreConnectId(input.betaGroupId, "betaGroupId");
    await deleteResource(
      context,
      resourcePath("/v1/betaGroups", betaGroupId),
      "Deleting the App Store Connect beta group",
    );
    return { id: betaGroupId, deleted: true };
  },

  async list_beta_testers(input, context) {
    const page = await listPage(context, input, {
      path: "/v1/betaTesters",
      label: "App Store Connect beta tester",
      query: {
        "filter[email]": pickOptionalString(input, "email"),
        "filter[firstName]": pickOptionalString(input, "firstName"),
        "filter[lastName]": pickOptionalString(input, "lastName"),
        "filter[inviteType]": pickOptionalString(input, "inviteType"),

        "filter[apps]": pickOptionalString(input, "appId"),
        "filter[betaGroups]": pickOptionalString(input, "betaGroupId"),
        "filter[builds]": pickOptionalString(input, "buildId"),
        "sort": pickOptionalString(input, "sort"),
      },
    });
    return { betaTesters: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async create_beta_tester(input, context) {
    const betaGroupIds = readStringList(input.betaGroupIds);
    const buildIds = readStringList(input.buildIds);

    if (!betaGroupIds?.length && !buildIds?.length) {
      throw new ProviderRequestError(400, "betaGroupIds or buildIds must contain at least one identifier");
    }

    const betaTester = await createResource(context, {
      path: "/v1/betaTesters",
      type: "betaTesters",
      label: "App Store Connect beta tester",
      attributes: {
        email: requiredInputString(input.email, "email"),
        firstName: pickOptionalString(input, "firstName"),
        lastName: pickOptionalString(input, "lastName"),
      },
      relationships: {
        betaGroups: betaGroupIds?.length ? toManyLinkage("betaGroups", betaGroupIds) : undefined,
        builds: buildIds?.length ? toManyLinkage("builds", buildIds) : undefined,
      },
    });
    return { betaTester };
  },

  async delete_beta_tester(input, context) {
    const betaTesterId = readAppStoreConnectId(input.betaTesterId, "betaTesterId");

    await deleteResource(
      context,
      resourcePath("/v1/betaTesters", betaTesterId),
      "Removing the App Store Connect beta tester",
      [202, 204],
    );
    return { id: betaTesterId, deleted: true };
  },

  async add_beta_testers_to_group(input, context) {
    const betaGroupId = readAppStoreConnectId(input.betaGroupId, "betaGroupId");
    const betaTesterIds = readIdentifierList(input.betaTesterIds, "betaTesterIds");
    await modifyRelationship(context, {
      method: "POST",
      path: resourcePath("/v1/betaGroups", betaGroupId, "relationships/betaTesters"),
      type: "betaTesters",
      ids: betaTesterIds,
      label: "Adding testers to the App Store Connect beta group",
    });
    return { betaGroupId, betaTesterIds, added: true };
  },

  async remove_beta_testers_from_group(input, context) {
    const betaGroupId = readAppStoreConnectId(input.betaGroupId, "betaGroupId");
    const betaTesterIds = readIdentifierList(input.betaTesterIds, "betaTesterIds");
    await modifyRelationship(context, {
      method: "DELETE",
      path: resourcePath("/v1/betaGroups", betaGroupId, "relationships/betaTesters"),
      type: "betaTesters",
      ids: betaTesterIds,
      label: "Removing testers from the App Store Connect beta group",
    });
    return { betaGroupId, betaTesterIds, removed: true };
  },

  async add_build_to_beta_groups(input, context) {
    const buildId = readAppStoreConnectId(input.buildId, "buildId");
    const betaGroupIds = readIdentifierList(input.betaGroupIds, "betaGroupIds");
    await modifyRelationship(context, {
      method: "POST",
      path: resourcePath("/v1/builds", buildId, "relationships/betaGroups"),
      type: "betaGroups",
      ids: betaGroupIds,
      label: "Adding the build to App Store Connect beta groups",
    });
    return { buildId, betaGroupIds, added: true };
  },

  async submit_build_for_beta_review(input, context) {
    const { payload } = await requestAppStoreConnect(context, {
      method: "POST",
      path: "/v1/betaAppReviewSubmissions",
      body: {
        data: {
          type: "betaAppReviewSubmissions",
          relationships: {
            build: toOneLinkage("builds", readAppStoreConnectId(input.buildId, "buildId")),
          },
        },
      },
    });

    return readBetaReviewSubmissionSummary(readResource(payload, "App Store Connect beta app review submission"));
  },

  async update_build_test_notes(input, context) {
    const buildId = readAppStoreConnectId(input.buildId, "buildId");
    const locale = requiredInputString(input.locale, "locale");
    const whatsNew = requiredInputString(input.whatsNew, "whatsNew");

    const existing = await requestAppStoreConnect(context, {
      path: "/v1/betaBuildLocalizations",
      query: { "filter[build]": buildId, "filter[locale]": locale, "limit": "1" },
    });
    const localizationId = readLocalizationId(existing.payload);
    if (localizationId) {
      const localization = await updateResource(context, {
        path: resourcePath("/v1/betaBuildLocalizations", localizationId),
        type: "betaBuildLocalizations",
        id: localizationId,
        label: "App Store Connect beta build localization",
        attributes: { whatsNew },
      });
      return { ...readTestNotes(localization), created: false };
    }

    const localization = await createResource(context, {
      path: "/v1/betaBuildLocalizations",
      type: "betaBuildLocalizations",
      label: "App Store Connect beta build localization",
      attributes: { locale, whatsNew },
      relationships: { build: toOneLinkage("builds", buildId) },
    });
    return { ...readTestNotes(localization), created: true };
  },
};

export function readTestNotes(localization: Record<string, unknown>): Record<string, unknown> {
  return {
    id: localization.id,
    locale: rawStringOrNull(localization.locale),
    whatsNew: rawStringOrNull(localization.whatsNew),
  };
}

function readLocalizationId(payload: unknown): string | undefined {
  const localizations = readCollection(payload, "App Store Connect beta build localization list");
  return pickOptionalString(recordOrEmpty(normalizeResourceOrUndefined(localizations[0])), "id");
}

function normalizeResourceOrUndefined(
  resource: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  return resource ? normalizeResource(resource, "App Store Connect beta build localization") : undefined;
}
