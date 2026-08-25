import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "hamsa";

const projectSchema = s.looseObject("A Hamsa project associated with the API key.", {
  id: s.string("The project identifier."),
  name: s.string("The project name."),
  createdAt: s.string("The project creation timestamp.", { format: "date-time" }),
});

const voiceAgentSchema = s.looseObject("A Hamsa voice agent.", {
  id: s.string("The voice agent identifier.", { format: "uuid" }),
  name: s.string("The voice agent name."),
  type: s.nullable(s.string("The voice agent type.")),
  createdAt: s.string("The voice agent creation timestamp.", { format: "date-time" }),
  updatedAt: s.string("The voice agent update timestamp.", { format: "date-time" }),
});

const ttsVoiceSchema = s.looseObject("A Hamsa text-to-speech voice.", {
  id: s.string("The voice identifier.", { format: "uuid" }),
  language: s.string("The voice language code."),
  name: s.string("The voice name."),
  tags: s.array("The gender and speaking-style tags for the voice.", s.string("A voice tag.")),
  voiceRecord: s.string("The signed URL for the voice audio sample.", { format: "uri" }),
  createdAt: s.string("The voice creation timestamp.", { format: "date-time" }),
  isFavourite: s.boolean("Whether the voice is marked as a favourite."),
  usedInJobs: s.boolean("Whether the voice has been used in text-to-speech jobs."),
  usedInVoiceAgents: s.boolean("Whether the voice is assigned to a voice agent."),
});

export const hamsaActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_project",
    description: "Get the Hamsa project associated with the connected API key.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving the connected Hamsa project.", {}),
    outputSchema: s.object("The connected Hamsa project response.", {
      project: projectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_voice_agents",
    description: "List Hamsa voice agents with pagination, search, sorting, and filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Hamsa voice agents.",
      {
        page: s.integer("The one-based page number.", { minimum: 1 }),
        pageSize: s.integer("The number of voice agents to return per page.", { minimum: 1 }),
        search: s.string("The search query used to filter voice agents by name."),
        sortOrder: s.union(
          [
            s.literal("asc", { description: "Ascending creation-time order." }),
            s.literal("desc", { description: "Descending creation-time order." }),
          ],
          { description: "The creation-time sort order." },
        ),
        types: s.array("The voice agent types to include.", s.string("A voice agent type.")),
        languages: s.array("The language codes to include.", s.string("A language code.")),
      },
      { optional: ["page", "pageSize", "search", "sortOrder", "types", "languages"] },
    ),
    outputSchema: s.object("A paginated Hamsa voice agent list.", {
      total: s.integer("The total number of matching voice agents."),
      filtered: s.integer("The number of voice agents returned in this page."),
      voiceAgents: s.array("The voice agents in this page.", voiceAgentSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_voice_agent",
    description: "Get a Hamsa voice agent by its identifier.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving a Hamsa voice agent.", {
      voiceAgentId: s.string("The voice agent identifier.", { format: "uuid" }),
    }),
    outputSchema: s.object("The Hamsa voice agent response.", {
      voiceAgent: voiceAgentSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_tts_voices",
    description: "List Hamsa text-to-speech voices available to a project.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Hamsa text-to-speech voices.",
      {
        projectId: s.string("The Hamsa project identifier.", { format: "uuid" }),
        source: s.union(
          [
            s.literal("jobs", { description: "Voices used by media jobs." }),
            s.literal("voice_agents", { description: "Voices used by voice agents." }),
          ],
          { description: "The product surface where the voices are used." },
        ),
        page: s.integer("The one-based page number.", { minimum: 1 }),
        pageSize: s.integer("The number of voices to return per page.", { minimum: 1 }),
        search: s.string("The search query used to filter voices."),
        recentlyUsed: s.boolean("Whether to return only recently used voices."),
        all: s.boolean("Whether to return all matching voices."),
        myVoices: s.boolean("Whether to return only voices owned by the connected user."),
        favourite: s.boolean("Whether to return only favourite voices."),
        genders: s.array(
          "The voice genders to include.",
          s.union(
            [
              s.literal("male", { description: "A male voice." }),
              s.literal("female", { description: "A female voice." }),
            ],
            {
              description: "A voice gender.",
            },
          ),
        ),
        languages: s.array(
          "The voice languages to include.",
          s.union([s.literal("ar", { description: "Arabic." }), s.literal("en", { description: "English." })], {
            description: "A voice language.",
          }),
        ),
        styles: s.array(
          "The speaking styles to include.",
          s.union(
            [
              s.literal("narrator", { description: "Narrator style." }),
              s.literal("conversational", { description: "Conversational style." }),
            ],
            { description: "A speaking style." },
          ),
        ),
        dialectIds: s.array(
          "The dialect identifiers to include.",
          s.string("A dialect identifier.", { format: "uuid" }),
        ),
      },
      {
        optional: [
          "page",
          "pageSize",
          "search",
          "recentlyUsed",
          "all",
          "myVoices",
          "favourite",
          "genders",
          "languages",
          "styles",
          "dialectIds",
        ],
      },
    ),
    outputSchema: s.object("A paginated Hamsa text-to-speech voice list.", {
      voices: s.array("The voices in this page.", ttsVoiceSchema),
      totalPages: s.integer("The total number of pages."),
      page: s.integer("The current page number."),
      totalCount: s.integer("The total number of matching voices."),
    }),
  }),
];
