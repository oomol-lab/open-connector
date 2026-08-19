import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "control_d";

const profileId = s.nonEmptyString("The Control D profile primary key.");
const forceOrgId = s.nonEmptyString("Optional child organization ID forwarded as the X-Force-Org-Id header.");
const ruleActionCode = s.integer("The Control D rule action code: 0=BLOCK, 1=BYPASS, 2=SPOOF, 3=REDIRECT.", {
  minimum: 0,
  maximum: 3,
});
const ruleStatus = s.integer("The Control D rule status code: 0=disabled, 1=enabled.", {
  minimum: 0,
  maximum: 1,
});

const countSummary = s.looseObject(
  {
    count: s.integer("The number of items reported by Control D for this area."),
  },
  { description: "A count summary returned by Control D." },
);

const profileSchema = s.looseObject(
  {
    PK: s.string("The Control D profile primary key."),
    name: s.string("The profile display name returned by Control D."),
    stats: s.integer("The analytics level configured for the profile."),
    profile: s.looseObject(
      {
        da: s.stringArray("The default action configuration returned by Control D."),
        flt: countSummary,
        grp: countSummary,
        svc: countSummary,
        cflt: countSummary,
        rule: countSummary,
        ipflt: countSummary,
      },
      { description: "The nested profile summary returned by Control D." },
    ),
    updated: s.integer("The Unix timestamp of the last profile update."),
  },
  { description: "A Control D profile returned by the API." },
);

const serviceCategorySchema = s.looseObject(
  {
    PK: s.string("The service category primary key returned by Control D."),
    name: s.string("The display name of the service category."),
    description: s.string("The description of the service category."),
    count: s.integer("The number of services in the category."),
  },
  { description: "A Control D service category." },
);

const serviceSchema = s.looseObject(
  {
    PK: s.string("The service primary key returned by Control D."),
    name: s.string("The display name of the service."),
    category: s.string("The category primary key that owns the service."),
    unlock_location: s.string("The default unlock or redirect location returned by Control D."),
    warning: s.string("An optional warning attached to the service."),
    locations: s.stringArray("Alternative location codes supported by the service."),
  },
  { description: "A Control D service returned by the service catalog." },
);

const profileRuleSchema = s.looseObject(
  {
    PK: s.string("The rule primary key, usually the hostname pattern."),
    group: s.integer("The numeric folder identifier that contains the rule."),
    order: s.integer("The evaluation order of the rule within the folder."),
    action: s.looseObject(
      {
        do: ruleActionCode,
        status: ruleStatus,
        via: s.string("The spoof target or redirect location returned by Control D."),
        via_v6: s.string("The IPv6 spoof target returned by Control D."),
      },
      { description: "The action payload of a Control D custom rule." },
    ),
  },
  { description: "A Control D custom DNS rule." },
);

export const controlDActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_ip",
    description:
      "Return the current IP address and datacenter seen by the Control D API for troubleshooting API token allowed-IP issues.",
    inputSchema: s.object({}, { description: "No input parameters for retrieving the current Control D IP context." }),
    outputSchema: s.object(
      {
        ip: s.string("The current IP address seen by the Control D API."),
        type: s.string("The IP version label returned by Control D."),
        org: s.string("The organization or ISP associated with the current IP address."),
        country: s.string("The country code associated with the current IP address."),
        handler: s.string("The Control D datacenter that handled the request."),
      },
      { required: ["ip", "type", "org", "country", "handler"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_profiles",
    description: "List the Control D profiles available to the authenticated API token.",
    inputSchema: s.object(
      { forceOrgId },
      { optional: ["forceOrgId"], description: "Input parameters for listing profiles." },
    ),
    outputSchema: s.object(
      { profiles: s.array("The profiles returned by Control D.", profileSchema) },
      { required: ["profiles"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_profile",
    description: "Fetch one Control D profile by primary key.",
    inputSchema: s.object(
      { profileId, forceOrgId },
      { required: ["profileId"], description: "Input parameters for fetching one Control D profile." },
    ),
    outputSchema: s.object({ profile: profileSchema }, { required: ["profile"] }),
  }),
  defineProviderAction(service, {
    name: "list_service_categories",
    description: "List the Control D service categories that can be used for service discovery.",
    inputSchema: s.object({}, { description: "No input parameters for listing Control D service categories." }),
    outputSchema: s.object(
      { categories: s.array("The service categories returned by Control D.", serviceCategorySchema) },
      { required: ["categories"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_services_by_category",
    description: "List the Control D services available in one service category.",
    inputSchema: s.object(
      { category: s.nonEmptyString("The Control D service category primary key.") },
      { required: ["category"] },
    ),
    outputSchema: s.object(
      { services: s.array("The services returned by Control D.", serviceSchema) },
      { required: ["services"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_profile_rules",
    description: "List the root-folder custom DNS rules configured on a Control D profile.",
    inputSchema: s.object(
      { profileId, forceOrgId },
      { required: ["profileId"], description: "Input parameters for listing custom DNS rules." },
    ),
    outputSchema: s.object(
      { rules: s.array("The custom DNS rules returned by Control D.", profileRuleSchema) },
      { required: ["rules"] },
    ),
  }),
  defineProviderAction(service, {
    name: "upsert_profile_rule",
    description:
      "Create or replace root-folder custom DNS rules on a Control D profile for one or more hostname patterns.",
    inputSchema: s.object(
      {
        profileId,
        forceOrgId,
        do: ruleActionCode,
        status: ruleStatus,
        hostnames: s.stringArray("The hostname patterns to create or update in Control D.", {
          minItems: 1,
          itemDescription: "One hostname or wildcard domain pattern.",
        }),
        via: s.nonEmptyString("The spoof target or redirect location to send upstream."),
        viaV6: s.nonEmptyString("The IPv6 spoof target to send upstream when do=2."),
      },
      {
        required: ["profileId", "do", "hostnames"],
        optional: ["forceOrgId", "status", "via", "viaV6"],
        description: "Input parameters for creating or replacing Control D custom rules.",
      },
    ),
    outputSchema: s.object(
      { rules: s.array("The rules that match the requested hostname patterns after the write.", profileRuleSchema) },
      { required: ["rules"] },
    ),
  }),
  defineProviderAction(service, {
    name: "delete_profile_rule",
    description: "Delete one root-folder custom DNS rule from a Control D profile.",
    inputSchema: s.object(
      {
        profileId,
        ruleId: s.nonEmptyString("The Control D rule primary key, usually a hostname or wildcard pattern."),
        forceOrgId,
      },
      { required: ["profileId", "ruleId"], description: "Input parameters for deleting one Control D custom rule." },
    ),
    outputSchema: s.object(
      {
        deleted: s.literal(true, { description: "Whether the Control D rule delete request succeeded." }),
        profileId,
        ruleId: s.nonEmptyString("The rule primary key that was deleted."),
        message: s.string("The optional confirmation message returned by Control D."),
      },
      { required: ["deleted", "profileId", "ruleId"] },
    ),
  }),
];
