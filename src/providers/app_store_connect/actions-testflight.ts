import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { service } from "./schemas.ts";
import {
  betaGroupResource,
  betaInviteTypes,
  betaReviewSubmissionFields,
  betaTesterResource,
  deletedOutput,
  emailString,
  manageTestFlightBuildsRoles,
  manageTestFlightRoles,
  nonEmptyString,
  pageOutput,
  paginationInputs,
  testNotesOutput,
} from "./schemas.ts";

export const appStoreConnectTestFlightActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_beta_groups",
    operationType: "read",
    description: "List the TestFlight groups of one app, including the public invitation link of each group.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing TestFlight groups.",
      {
        appId: nonEmptyString("App Store Connect identifier of the app."),
        name: nonEmptyString("Return only the group with this exact name."),
        isInternalGroup: s.boolean("Return only internal groups when true, or only external groups when false."),
        publicLinkEnabled: s.boolean("Return only groups whose public link is enabled or disabled."),
        ...paginationInputs,
      },
      { required: ["appId"] },
    ),
    outputSchema: pageOutput(
      "betaGroups",
      betaGroupResource,
      "TestFlight groups returned for this page.",
      "A page of TestFlight groups.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_beta_group",
    operationType: "write",
    description: "Create a TestFlight group for an app, optionally enabling its public invitation link.",
    requiredScopes: [],
    providerPermissions: [...manageTestFlightRoles],
    inputSchema: s.object(
      "The TestFlight group to create.",
      {
        appId: nonEmptyString("App Store Connect identifier of the app the group belongs to."),
        name: nonEmptyString("Group name shown in TestFlight."),
        publicLinkEnabled: s.boolean("Enable a public TestFlight invitation link for the group."),
        publicLinkLimitEnabled: s.boolean("Enforce a maximum number of testers joining through the public link."),
        publicLinkLimit: s.integer(
          "Maximum number of testers allowed to join through the public link, from 1 to 10,000.",
          { minimum: 1, maximum: 10000 },
        ),
        feedbackEnabled: s.boolean("Let testers send feedback from TestFlight."),
        hasAccessToAllBuilds: s.boolean("Automatically give the group every new build of the app."),
      },
      { required: ["appId", "name"] },
    ),
    outputSchema: s.actionOutput({ betaGroup: betaGroupResource }, "The created TestFlight group."),
  }),
  defineProviderAction(service, {
    name: "delete_beta_group",
    operationType: "destructive",
    description: "Delete a TestFlight group. Testers who only belonged to that group lose access to its builds.",
    requiredScopes: [],
    providerPermissions: [...manageTestFlightRoles],
    inputSchema: s.actionInput(
      { betaGroupId: nonEmptyString("App Store Connect identifier of the TestFlight group.") },
      ["betaGroupId"],
      "Identifies the TestFlight group to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted TestFlight group."),
      "Confirmation that the TestFlight group was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_beta_testers",
    operationType: "read",
    description: "List TestFlight testers, optionally narrowed to one app, group, or build.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing TestFlight testers.",
      {
        email: emailString("Return only the tester with this exact email address."),
        firstName: nonEmptyString("Return only testers with this exact first name."),
        lastName: nonEmptyString("Return only testers with this exact last name."),
        inviteType: s.stringEnum("Return only testers invited this way.", betaInviteTypes),
        appId: nonEmptyString("Return only testers who have access to this app."),
        betaGroupId: nonEmptyString("Return only testers who belong to this TestFlight group."),
        buildId: nonEmptyString("Return only testers who were assigned this build individually."),
        sort: s.stringEnum("Sort order for the returned testers.", [
          "firstName",
          "-firstName",
          "lastName",
          "-lastName",
          "email",
          "-email",
          "inviteType",
          "-inviteType",
          "state",
          "-state",
        ]),
        ...paginationInputs,
      },
      {
        optional: [
          "email",
          "firstName",
          "lastName",
          "inviteType",
          "appId",
          "betaGroupId",
          "buildId",
          "sort",
          "limit",
          "cursor",
        ],
      },
    ),
    outputSchema: pageOutput(
      "betaTesters",
      betaTesterResource,
      "TestFlight testers returned for this page.",
      "A page of TestFlight testers.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_beta_tester",
    operationType: "write",
    description:
      "Invite a TestFlight tester by email. App Store Connect only creates a tester that is assigned to something, so pass at least one of betaGroupIds or buildIds.",
    requiredScopes: [],
    providerPermissions: [...manageTestFlightRoles],
    inputSchema: s.object(
      "The TestFlight tester to invite.",
      {
        email: emailString("Email address the TestFlight invitation is sent to."),
        firstName: nonEmptyString("Tester first name."),
        lastName: nonEmptyString("Tester last name."),
        betaGroupIds: s.stringArray("TestFlight groups to add the tester to. Required unless buildIds is given.", {
          minItems: 1,
          itemDescription: "App Store Connect identifier of a TestFlight group.",
        }),
        buildIds: s.stringArray("Builds to assign to the tester individually. Required unless betaGroupIds is given.", {
          minItems: 1,
          itemDescription: "App Store Connect identifier of a build.",
        }),
      },
      { required: ["email"] },
    ),
    outputSchema: s.actionOutput({ betaTester: betaTesterResource }, "The invited TestFlight tester."),
  }),
  defineProviderAction(service, {
    name: "delete_beta_tester",
    operationType: "destructive",
    description: "Remove a TestFlight tester from the team, revoking their access to every build and group.",
    requiredScopes: [],
    providerPermissions: [...manageTestFlightRoles],
    inputSchema: s.actionInput(
      { betaTesterId: nonEmptyString("App Store Connect identifier of the TestFlight tester.") },
      ["betaTesterId"],
      "Identifies the TestFlight tester to remove.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the removed TestFlight tester."),
      "Confirmation that the TestFlight tester was removed.",
    ),
  }),
  defineProviderAction(service, {
    name: "add_beta_testers_to_group",
    operationType: "write",
    description: "Add existing TestFlight testers to one group so they receive the builds that group can install.",
    requiredScopes: [],
    providerPermissions: [...manageTestFlightRoles],
    inputSchema: s.object(
      "The testers to add to a TestFlight group.",
      {
        betaGroupId: nonEmptyString("App Store Connect identifier of the TestFlight group."),
        betaTesterIds: s.stringArray("Identifiers of the testers to add.", {
          minItems: 1,
          itemDescription: "App Store Connect identifier of a TestFlight tester.",
        }),
      },
      { required: ["betaGroupId", "betaTesterIds"] },
    ),
    outputSchema: s.actionOutput(
      {
        betaGroupId: s.string("The TestFlight group the testers were added to."),
        betaTesterIds: s.stringArray("Identifiers of the testers that were added.", {
          itemDescription: "App Store Connect identifier of a TestFlight tester.",
        }),
        added: s.boolean("Always true once App Store Connect confirmed the change."),
      },
      "Confirmation that the testers were added to the group.",
    ),
  }),
  defineProviderAction(service, {
    name: "remove_beta_testers_from_group",
    operationType: "destructive",
    description:
      "Remove testers from one TestFlight group. The testers stay on the team and keep access through their other groups.",
    requiredScopes: [],
    providerPermissions: [...manageTestFlightRoles],
    inputSchema: s.object(
      "The testers to remove from a TestFlight group.",
      {
        betaGroupId: nonEmptyString("App Store Connect identifier of the TestFlight group."),
        betaTesterIds: s.stringArray("Identifiers of the testers to remove.", {
          minItems: 1,
          itemDescription: "App Store Connect identifier of a TestFlight tester.",
        }),
      },
      { required: ["betaGroupId", "betaTesterIds"] },
    ),
    outputSchema: s.actionOutput(
      {
        betaGroupId: s.string("The TestFlight group the testers were removed from."),
        betaTesterIds: s.stringArray("Identifiers of the testers that were removed.", {
          itemDescription: "App Store Connect identifier of a TestFlight tester.",
        }),
        removed: s.boolean("Always true once App Store Connect confirmed the change."),
      },
      "Confirmation that the testers were removed from the group.",
    ),
  }),
  defineProviderAction(service, {
    name: "add_build_to_beta_groups",
    operationType: "write",
    description: "Make one build available to TestFlight groups so their testers can install it.",
    requiredScopes: [],
    providerPermissions: [...manageTestFlightRoles],
    inputSchema: s.object(
      "The build to distribute and the groups that should receive it.",
      {
        buildId: nonEmptyString("App Store Connect identifier of the build."),
        betaGroupIds: s.stringArray("Identifiers of the TestFlight groups to add the build to.", {
          minItems: 1,
          itemDescription: "App Store Connect identifier of a TestFlight group.",
        }),
      },
      { required: ["buildId", "betaGroupIds"] },
    ),
    outputSchema: s.actionOutput(
      {
        buildId: s.string("The build that was distributed."),
        betaGroupIds: s.stringArray("Identifiers of the groups the build was added to.", {
          itemDescription: "App Store Connect identifier of a TestFlight group.",
        }),
        added: s.boolean("Always true once App Store Connect confirmed the change."),
      },
      "Confirmation that the build was added to the groups.",
    ),
  }),
  defineProviderAction(service, {
    name: "submit_build_for_beta_review",
    operationType: "write",
    description: "Submit a build for TestFlight beta review, which external groups require before they can install it.",
    requiredScopes: [],
    providerPermissions: [...manageTestFlightBuildsRoles],
    inputSchema: s.actionInput(
      { buildId: nonEmptyString("App Store Connect identifier of the build to submit.") },
      ["buildId"],
      "Identifies the build to submit for beta review.",
    ),
    outputSchema: s.actionOutput({ ...betaReviewSubmissionFields }, "The created beta app review submission."),
  }),
  defineProviderAction(service, {
    name: "update_build_test_notes",
    operationType: "destructive",
    description:
      'Set the "What to Test" notes a build shows testers in one locale. Updates the existing notes for that locale, or creates them when the locale has none yet.',
    requiredScopes: [],
    providerPermissions: [...manageTestFlightBuildsRoles],
    inputSchema: s.object(
      "The test notes to publish for one build and locale.",
      {
        buildId: nonEmptyString("App Store Connect identifier of the build."),
        locale: nonEmptyString("TestFlight locale the notes are written in, such as en-US."),
        whatsNew: nonEmptyString("Test notes shown to testers in that locale."),
      },
      { required: ["buildId", "locale", "whatsNew"] },
    ),
    outputSchema: s.actionOutput(
      {
        ...testNotesOutput,
        created: s.boolean("True when the locale had no notes yet and they were created."),
      },
      "The stored test notes for one build and locale.",
    ),
  }),
];
