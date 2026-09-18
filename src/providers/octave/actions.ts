import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "octave";

const agentType = s.stringEnum(
  [
    "PROSPECTOR",
    "CONTENT",
    "EMAIL",
    "ENRICH_PERSON",
    "ENRICH_COMPANY",
    "QUALIFY_PERSON",
    "QUALIFY_COMPANY",
    "CALL_PREP",
    "CONTEXT",
  ],
  { description: "The Octave agent type identifier." },
);
const metadata = s.looseObject("Request metadata returned by Octave.");
const raw = s.looseObject("The raw response payload returned by Octave.");
const agent = s.looseObject("One Octave agent.");
const agentTypeMetadata = s.looseObject("One Octave agent type definition.");
const language = s.looseObject("One language supported by Octave agents.");
const runtimeContext = s.unknown("Runtime context forwarded to Octave for the agent run.");

const noInput = s.actionInput({}, [], "No input parameters are required for this action.");

const listAgentsInput = s.actionInput(
  {
    type: agentType,
    query: s.nonEmptyString("Query used to filter the agents returned by Octave."),
    offset: s.nonNegativeInteger("Offset of the first agent to return."),
    limit: s.positiveInteger("Maximum number of agents to return."),
    orderField: s.stringEnum(["createdAt", "updatedAt"], {
      description: "Field used to order returned agents.",
    }),
    orderDirection: s.stringEnum(["ASC", "DESC"], {
      description: "Direction used to order returned agents.",
    }),
    includeExperiments: s.boolean("Whether to include experiments when listing EMAIL or CONTENT agents."),
  },
  [],
  "Input payload for listing Octave agents.",
);

const getAgentInput = s.actionInput(
  {
    oId: s.nonEmptyString("The Octave agent OId."),
  },
  ["oId"],
  "Input payload for fetching one Octave agent.",
);

const companyAgentInput = s.actionInput(
  {
    agentOId: s.nonEmptyString("The Octave agent OId. Find it in the Agents section of the Octave dashboard."),
    companyDomain: s.nonEmptyString("Company domain to process."),
    companyName: s.nonEmptyString("Company name to process."),
    crmAccountId: s.nonEmptyString("CRM account ID associated with the company."),
    runtimeContext,
    includeFullAnnotation: s.boolean("Whether Octave should return full annotation data including metadata."),
  },
  ["agentOId"],
  "Input payload for Octave company enrichment or qualification agents.",
);

const personAgentInput = s.actionInput(
  {
    agentOId: s.nonEmptyString("The Octave agent OId. Find it in the Agents section of the Octave dashboard."),
    email: s.email("Email address of the person to process."),
    firstName: s.nonEmptyString("First name of the person to process."),
    lastName: s.nonEmptyString("Last name of the person to process."),
    jobTitle: s.nonEmptyString("Job title of the person to process."),
    companyDomain: s.nonEmptyString("Company domain associated with the person."),
    companyName: s.nonEmptyString("Company name associated with the person."),
    linkedInProfile: s.url("LinkedIn profile URL of the person."),
    crmContactId: s.nonEmptyString("CRM contact ID associated with the person."),
    crmLeadId: s.nonEmptyString("CRM lead ID associated with the person."),
    crmAccountId: s.nonEmptyString("CRM account ID associated with the person."),
    runtimeContext,
    includeFullAnnotation: s.boolean("Whether Octave should return full annotation data including metadata."),
  },
  ["agentOId"],
  "Input payload for Octave person enrichment, qualification, or call prep agents.",
);

const additionalPerson = s.actionInput(
  {
    firstName: s.nonEmptyString("First name of the person."),
    lastName: s.nonEmptyString("Last name of the person."),
    title: s.nonEmptyString("Title of the person."),
    email: s.email("Email address of the person."),
    linkedInProfileUrl: s.url("LinkedIn profile URL of the person."),
    crmContactId: s.nonEmptyString("CRM contact ID associated with the person."),
    crmLeadId: s.nonEmptyString("CRM lead ID associated with the person."),
    crmAccountId: s.nonEmptyString("CRM account ID associated with the person."),
  },
  [],
  "Optional person context for an Octave context agent run.",
);

const additionalCompany = s.actionInput(
  {
    name: s.nonEmptyString("Company name."),
    domain: s.nonEmptyString("Company domain."),
    linkedInProfileUrl: s.url("LinkedIn profile URL of the company."),
    crmAccountId: s.nonEmptyString("CRM account ID associated with the company."),
  },
  [],
  "Optional company context for an Octave context agent run.",
);

const additionalContext = s.actionInput(
  {
    person: additionalPerson,
    company: additionalCompany,
    details: s.nonEmptyString("Free-form text providing additional context."),
  },
  [],
  "Optional person, company, and detail context for an Octave context agent run.",
);

const contextAgentInput = s.actionInput(
  {
    agentOId: s.nonEmptyString("The Octave agent OId for the preset context configuration."),
    query: s.nonEmptyString("Question or task to fetch context for."),
    runtimeContext: s.nonEmptyString("Runtime context string used by Octave when query is not provided."),
    additionalContext,
  },
  ["agentOId"],
  "Input payload for running an Octave context agent.",
);

const listAgentsOutput = s.actionOutput(
  {
    metadata,
    hasNext: s.boolean("Whether Octave has more agents after this page."),
    total: s.number("Total number of matching agents."),
    agents: s.array(agent, { description: "The agents returned by Octave." }),
    raw,
  },
  "The response returned when listing Octave agents.",
);

const getAgentOutput = s.actionOutput(
  {
    metadata,
    agent,
    raw,
  },
  "The response returned when fetching one Octave agent.",
);

const listAgentTypesOutput = s.actionOutput(
  {
    metadata,
    total: s.number("Total number of agent types."),
    agentTypes: s.array(agentTypeMetadata, {
      description: "The agent type definitions returned by Octave.",
    }),
    raw,
  },
  "The response returned when listing Octave agent types.",
);

const listLanguagesOutput = s.actionOutput(
  {
    metadata,
    languages: s.array(language, { description: "The languages returned by Octave." }),
    raw,
  },
  "The response returned when listing Octave languages.",
);

const agentRunOutput = s.actionOutput(
  {
    metadata,
    found: s.boolean("Whether Octave found a result for the agent run."),
    message: s.nullableString("Message returned by Octave for the agent run."),
    data: s.unknown("Agent-specific data returned by Octave."),
    raw,
  },
  "The response returned by an Octave agent run.",
);

const validateApiKeyOutput = s.actionOutput(
  {
    metadata,
    status: s.stringEnum(["ok"], { description: "Status of the API key validation." }),
    valid: s.boolean("Whether the API key is valid."),
    workspaceOId: s.nonEmptyString("The unique identifier for the workspace."),
    workspaceName: s.nonEmptyString("The name of the workspace."),
    workspaceDomain: s.nullableString("The domain associated with the workspace."),
    organizationOId: s.nonEmptyString("The unique identifier for the organization."),
    organizationName: s.nonEmptyString("The name of the organization."),
    organizationDomain: s.nullableString("The domain associated with the organization."),
    organizationSlug: s.nonEmptyString("The URL-friendly slug for the organization."),
    mcpUrl: s.nullableString("The MCP server URL with encoded workspace context."),
    credits: s.looseObject("Credit usage information for the API key."),
    raw,
  },
  "The response returned when validating an Octave API key.",
);

export type OctaveActionName =
  | "validate_api_key"
  | "list_agents"
  | "get_agent"
  | "list_agent_types"
  | "list_languages"
  | "run_enrich_company_agent"
  | "run_enrich_person_agent"
  | "run_qualify_company_agent"
  | "run_qualify_person_agent"
  | "run_call_prep_agent"
  | "run_context_agent";

export const octaveActions: ActionDefinition[] = [
  action(
    "validate_api_key",
    "read",
    "Validate the Octave API key and return workspace metadata.",
    noInput,
    validateApiKeyOutput,
  ),
  action("list_agents", "read", "List Octave agents in the current workspace.", listAgentsInput, listAgentsOutput),
  action("get_agent", "read", "Get one Octave agent by OId.", getAgentInput, getAgentOutput),
  action(
    "list_agent_types",
    "read",
    "List Octave agent types available to the workspace.",
    noInput,
    listAgentTypesOutput,
  ),
  action("list_languages", "read", "List languages supported by Octave agents.", noInput, listLanguagesOutput),
  action(
    "run_enrich_company_agent",
    "read",
    "Run an Octave company enrichment agent synchronously.",
    companyAgentInput,
    agentRunOutput,
  ),
  action(
    "run_enrich_person_agent",
    "read",
    "Run an Octave person enrichment agent synchronously.",
    personAgentInput,
    agentRunOutput,
  ),
  action(
    "run_qualify_company_agent",
    "write",
    "Run an Octave company qualification agent synchronously.",
    companyAgentInput,
    agentRunOutput,
  ),
  action(
    "run_qualify_person_agent",
    "write",
    "Run an Octave person qualification agent synchronously.",
    personAgentInput,
    agentRunOutput,
  ),
  action(
    "run_call_prep_agent",
    "write",
    "Run an Octave call prep agent synchronously.",
    personAgentInput,
    agentRunOutput,
  ),
  action("run_context_agent", "write", "Run an Octave context agent synchronously.", contextAgentInput, agentRunOutput),
];

function action(
  name: OctaveActionName,
  operationType: ActionDefinition["operationType"],
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): ActionDefinition {
  return defineProviderAction(service, {
    name,
    operationType,
    description,
    requiredScopes: [],
    inputSchema,
    outputSchema,
  });
}
