import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "indiegogo";

const urlNameSchema = s.nonWhitespaceString("The URL name from an Indiegogo creator or project page.");

const creatorSchema = s.looseRequiredObject("A creator returned by the Indiegogo Public API.", {
  description: s.string("The creator's public description."),
  name: s.string("The creator's display name."),
  urlName: s.string("The creator's unique URL name."),
  thumbImageUrl: s.url("The URL of the creator's thumbnail image."),
  creatorPageUrl: s.url("The URL of the creator's public Indiegogo page."),
});

const projectSchema = s.looseRequiredObject("A crowdfunding project returned by the Indiegogo Public API.", {
  backerCount: s.nonNegativeInteger("The number of project backers."),
  updateCount: s.nonNegativeInteger("The number of project updates."),
  rewardCount: s.nonNegativeInteger("The number of project rewards."),
  campaignStartDate: s.dateTime("When the crowdfunding campaign started."),
  campaignEndDate: s.dateTime("When the crowdfunding campaign ends or ended."),
  campaignGoal: s.nullableNumber("The campaign funding goal, or null when Indiegogo does not publish one."),
  creatorName: s.string("The project creator's display name."),
  creatorUrlName: s.string("The project creator's unique URL name."),
  currencyShortName: s.string("The short currency code used by the project."),
  fundsGathered: s.number("The amount of funds gathered by the project."),
  projectName: s.string("The public project name."),
  projectUrlName: s.string("The project's unique URL name."),
  shortDescription: s.string("The project's short public description."),
  commentCount: s.nonNegativeInteger("The number of project comments."),
  projectHomeUrl: s.url("The URL of the public project page."),
  projectImageUrl: s.url("The URL of the project's public image."),
});

const urlNameInputSchema = s.object("Input for an Indiegogo Public API lookup.", {
  urlName: urlNameSchema,
});

export const indiegogoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_creator",
    operationType: "read",
    description: "Get an Indiegogo creator by the URL name shown on their public creator page.",
    requiredScopes: [],
    inputSchema: urlNameInputSchema,
    outputSchema: s.object("The requested Indiegogo creator.", {
      creator: creatorSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_active_crowdfunding_projects",
    operationType: "read",
    description: "List active Indiegogo crowdfunding projects ordered by campaign start date.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to list active Indiegogo projects.", {}),
    outputSchema: s.object("The active Indiegogo crowdfunding projects.", {
      projects: s.array("The active crowdfunding projects returned by Indiegogo.", projectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_crowdfunding_project",
    operationType: "read",
    description:
      "Get an Indiegogo crowdfunding project by its URL name when it is in a public campaign or pledge-manager phase.",
    requiredScopes: [],
    inputSchema: urlNameInputSchema,
    outputSchema: s.object("The requested Indiegogo crowdfunding project.", {
      project: projectSchema,
    }),
  }),
];
