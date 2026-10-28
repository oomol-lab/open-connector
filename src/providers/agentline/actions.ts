import type { ActionDefinition } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
const agentId = s.nonEmptyString("Agent ID returned by create_agent or list_agents.");
const contactId = s.nonEmptyString("Contact ID returned by create_contact or list_contacts.");
const agentFields = {
  name: s.string("Display name of the voice agent."),
  system_prompt: s.nullableString(
    "Default instructions for future inbound and outbound calls; a call may override them.",
  ),
  initial_greeting: s.nullableString("Default opening line for future calls."),
  voice_id: s.nullableString("Voice preset name or UUID; null uses the account or system default."),
  transfer_number: s.nullableString(
    "Transfer destination; must equal owner_phone. Setting owner_phone fills this automatically.",
  ),
  voicemail_message: s.nullableString("Message to leave when a call reaches voicemail."),
  owner_phone: s.nullableString("Owner phone in E.164 format, used for task mode and live-call transfers."),
};
const optionalAgentFields = Object.keys(agentFields).filter((key) => key !== "name");
const agentOutput = s.looseRequiredObject(
  "Voice agent configuration.",
  {
    id: agentId,
    account_id: s.string("Account owning the agent."),
    ...agentFields,
    created_at: s.string("Agent creation time in ISO 8601 format."),
  },
  { optional: optionalAgentFields },
);
const contactFields = {
  name: s.string("Contact name.", { minLength: 1, maxLength: 120 }),
  phone_number: s.string(
    "Phone number with + and country code; AgentLine removes spaces, dashes, dots and parentheses.",
  ),
  label: s.nullableString("Purpose or relationship; null or an empty string clears the label on update.", {
    maxLength: 64,
  }),
};
const contactOutput = s.looseRequiredObject(
  "Saved contact.",
  {
    id: contactId,
    agent_id: agentId,
    ...contactFields,
    created_at: s.string("Contact creation time in ISO 8601 format."),
    updated_at: s.string("Last contact update time in ISO 8601 format."),
  },
  { optional: ["label"] },
);
const voiceOutput = s.looseRequiredObject("Account voice settings.", {
  account_id: s.string("Account identifier."),
  default_voice_id: s.nullableString("Stored account voice preset or UUID, or null when no override is set."),
  resolved_voice_id: s.string("Effective voice UUID used unless overridden by an agent or call."),
});
const empty = s.requiredObject("No input parameters.", {});
interface AgentlineRoute {
  name: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  pathFields?: string[];
  action: ActionDefinition;
}
function route(
  name: string,
  method: AgentlineRoute["method"],
  path: string,
  operationType: "read" | "write" | "destructive",
  description: string,
  inputSchema: Record<string, unknown>,
  outputSchema: Record<string, unknown>,
  pathFields: string[] = [],
): AgentlineRoute {
  return {
    name,
    method,
    path,
    pathFields,
    action: defineProviderAction("agentline", {
      name,
      operationType,
      description,
      requiredScopes: [],
      inputSchema,
      outputSchema,
    }),
  };
}
export const agentlineRoutes: AgentlineRoute[] = [
  route(
    "list_agents",
    "GET",
    "/v1/agents",
    "read",
    "List all voice agents configured on the account.",
    empty,
    s.requiredObject("Voice agents on the account.", {
      agents: s.array("Configured agents.", agentOutput),
    }),
  ),
  route(
    "create_agent",
    "POST",
    "/v1/agents",
    "write",
    "Create a voice agent with default instructions, greeting, voice and owner phone.",
    s.object("New voice agent configuration.", agentFields, {
      optional: optionalAgentFields,
    }),
    agentOutput,
  ),
  route(
    "get_agent",
    "GET",
    "/v1/agents/{agent_id}",
    "read",
    "Get a voice agent's full configuration.",
    s.requiredObject("Agent lookup.", { agent_id: agentId }),
    agentOutput,
    ["agent_id"],
  ),
  route(
    "update_agent",
    "PATCH",
    "/v1/agents/{agent_id}",
    "write",
    "Update a voice agent for future calls. Omitted fields retain their values; active calls are unaffected.",
    s.object(
      "Agent configuration changes.",
      { agent_id: agentId, ...agentFields, name: s.nullableString("Replacement agent name.") },
      { optional: Object.keys(agentFields), minProperties: 2 },
    ),
    agentOutput,
    ["agent_id"],
  ),
  route(
    "delete_agent",
    "DELETE",
    "/v1/agents/{agent_id}",
    "destructive",
    "Permanently delete an agent and its calls, transcripts, messages, contacts and webhook. Assigned numbers are detached but remain active on the account.",
    s.requiredObject("Agent to delete.", { agent_id: agentId }),
    s.looseRequiredObject("Agent deletion result.", {
      deleted: s.boolean("Whether the agent was deleted."),
      agent_id: agentId,
    }),
    ["agent_id"],
  ),
  route(
    "list_contacts",
    "GET",
    "/v1/agents/{agent_id}/contacts",
    "read",
    "List contacts sorted by name. Advance offset by limit until it reaches total to retrieve further pages.",
    s.object(
      "Contact filters and pagination.",
      {
        agent_id: agentId,
        q: s.nullableString("Case-insensitive substring to find in name, label or phone number.", {
          maxLength: 120,
        }),
        label: s.nullableString("Case-insensitive exact label filter.", { maxLength: 64 }),
        phone_number: s.nullableString(
          "Exact phone filter with + and country code; formatting characters are ignored.",
        ),
        limit: s.integer("Page size; defaults to 100.", { minimum: 1, maximum: 500 }),
        offset: s.integer("Number of matching contacts to skip; defaults to 0.", { minimum: 0 }),
      },
      { optional: ["q", "label", "phone_number", "limit", "offset"] },
    ),
    s.looseRequiredObject("Contact page.", {
      agent_id: agentId,
      contacts: s.array("Matching contacts sorted by name.", contactOutput),
      total: s.integer("Total matching contacts before pagination."),
      limit: s.integer("Page size used."),
      offset: s.integer("Offset used."),
    }),
    ["agent_id"],
  ),
  route(
    "create_contact",
    "POST",
    "/v1/agents/{agent_id}/contacts",
    "write",
    "Save a contact for an agent. Each phone number can appear once per agent; duplicates return HTTP 409.",
    s.object("New contact.", { agent_id: agentId, ...contactFields }, { optional: ["label"] }),
    contactOutput,
    ["agent_id"],
  ),
  route(
    "get_contact",
    "GET",
    "/v1/agents/{agent_id}/contacts/{contact_id}",
    "read",
    "Get one contact from an agent's contact list.",
    s.requiredObject("Contact lookup.", { agent_id: agentId, contact_id: contactId }),
    contactOutput,
    ["agent_id", "contact_id"],
  ),
  route(
    "update_contact",
    "PATCH",
    "/v1/agents/{agent_id}/contacts/{contact_id}",
    "write",
    "Update contact fields. Omit a field to retain it; set label to null or an empty string to clear it.",
    s.object(
      "Contact changes.",
      {
        agent_id: agentId,
        contact_id: contactId,
        ...contactFields,
        name: s.nullableString("Replacement contact name; omit to retain it.", {
          minLength: 1,
          maxLength: 120,
        }),
        phone_number: s.nullableString("Replacement phone number with + and country code; omit to retain it."),
      },
      { optional: Object.keys(contactFields) },
    ),
    contactOutput,
    ["agent_id", "contact_id"],
  ),
  route(
    "delete_contact",
    "DELETE",
    "/v1/agents/{agent_id}/contacts/{contact_id}",
    "destructive",
    "Permanently delete a contact. Calls, messages and transcripts with that number are unaffected.",
    s.requiredObject("Contact to delete.", { agent_id: agentId, contact_id: contactId }),
    s.looseRequiredObject("Contact deletion result.", {
      deleted: s.boolean("Whether the contact was deleted."),
      agent_id: agentId,
      contact_id: contactId,
    }),
    ["agent_id", "contact_id"],
  ),
  route(
    "list_voices",
    "GET",
    "/v1/voices",
    "read",
    "List available voice presets and IDs for agent and account configuration.",
    empty,
    s.looseRequiredObject("Available voice presets.", {
      voices: s.array(
        "Voice presets.",
        s.looseObject("One voice preset.", {
          preset_name: s.string("Human-readable preset name."),
          voice_id: s.string("Voice UUID."),
          name: s.string("Voice display name."),
          description: s.string("Voice characteristics."),
        }),
      ),
      default_voice_id: s.string("System default voice ID."),
      usage_hint: s.string("Guidance for selecting a voice."),
    }),
  ),
  route(
    "get_account_voice",
    "GET",
    "/v1/account/voice",
    "read",
    "Read the account default voice and its resolved voice UUID.",
    empty,
    voiceOutput,
  ),
  route(
    "set_account_voice",
    "PATCH",
    "/v1/account/voice",
    "write",
    "Set the default voice for future calls unless overridden by the agent or call.",
    s.requiredObject("Account voice selection.", {
      voice_id: s.string("Voice preset name or UUID returned by list_voices."),
    }),
    voiceOutput,
  ),
  route(
    "reset_account_voice",
    "DELETE",
    "/v1/account/voice",
    "write",
    "Reset the account voice setting to the system default for future calls.",
    empty,
    voiceOutput,
  ),
];
const actions: ActionDefinition[] = agentlineRoutes.map((entry) => entry.action);
export default actions;
