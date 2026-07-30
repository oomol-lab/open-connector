import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "home_assistant";

const contextSchema = s.looseObject("The Home Assistant context attached to a state change.", {
  id: s.nullableString("The Home Assistant context identifier."),
  parent_id: s.nullableString("The optional parent context identifier."),
  user_id: s.nullableString("The optional Home Assistant user identifier."),
});

const stateProperties = {
  entity_id: s.string("The Home Assistant entity identifier."),
  state: s.string("The current state value."),
  attributes: s.looseObject("The integration-specific attributes for the entity state."),
  last_changed: s.string("The timestamp when the state last changed."),
  last_updated: s.string("The timestamp when the state object was last updated."),
  context: contextSchema,
};

const stateSchema = s.looseRequiredObject("One Home Assistant entity state object.", stateProperties, {
  optional: ["attributes", "context"],
});

// History rows are not full state objects. With minimal_response, Home Assistant
// returns only state and last_changed for the entries between the first and last
// of the period, dropping entity_id, attributes, and last_updated; no_attributes
// drops attributes on every row. Only state and last_changed are always present.
const historyStateSchema = s.looseRequiredObject(
  "One recorded Home Assistant state. Fields other than state and last_changed are omitted for compacted rows.",
  stateProperties,
  { optional: ["entity_id", "attributes", "last_updated", "context"] },
);

const emptyInputSchema = s.actionInput({}, [], "No input is required for this action.");
const entityInputSchema = s.actionInput(
  {
    entityId: s.nonEmptyString("The Home Assistant entity identifier, for example light.living_room."),
  },
  ["entityId"],
  "Input parameters for selecting one Home Assistant entity.",
);

/** Output field for one registry that only the Home Assistant WebSocket API serves. */
export type HomeAssistantRegistryName = "entities" | "devices" | "areas" | "floors" | "labels";

/** Every registry `get_registries` can fetch, in output-field order. */
export const homeAssistantRegistryNames: HomeAssistantRegistryName[] = [
  "entities",
  "devices",
  "areas",
  "floors",
  "labels",
];

const registryNames: string[] = homeAssistantRegistryNames;

// Home Assistant's search ItemType enum; the values it accepts as a search origin.
const searchItemTypes: string[] = [
  "area",
  "automation",
  "automation_blueprint",
  "config_entry",
  "device",
  "entity",
  "floor",
  "group",
  "integration",
  "label",
  "person",
  "scene",
  "script",
  "script_blueprint",
];

function registryListSchema(description: string): JsonSchema {
  return s.nullable(s.array(description, s.looseObject("One Home Assistant registry entry.")));
}

// The editable config store reached through /api/config/<component>/config/<key>.
// Every domain there takes an admin token and only covers entries Home Assistant
// itself manages (automations.yaml, scripts.yaml, scenes.yaml); entries defined
// in other YAML files are not visible to it.
const configAdminNote =
  "Requires an admin access token, and only covers entries stored in the Home Assistant UI-editable config; entries defined in other YAML files return not found.";

const configWriteResultSchema = s.actionOutput(
  { result: s.string("The Home Assistant result status, normally ok.") },
  "The Home Assistant config write result.",
);

function configKeyInput(field: string, description: string): JsonSchema {
  return s.actionInput({ [field]: s.nonEmptyString(description) }, [field], "Input parameters for one config entry.");
}

function configSaveInput(field: string, description: string, configDescription: string): JsonSchema {
  return s.actionInput(
    {
      [field]: s.nonEmptyString(description),
      config: s.looseObject(configDescription),
    },
    [field, "config"],
    "Input parameters for saving one config entry.",
  );
}

function configReadOutput(description: string): JsonSchema {
  return s.actionOutput({ config: s.looseObject(description) }, "The stored Home Assistant configuration entry.");
}

export const homeAssistantActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_config",
    description: "Fetch the Home Assistant instance configuration.",
    inputSchema: emptyInputSchema,
    outputSchema: s.actionOutput(
      { config: s.looseObject("The Home Assistant configuration object.") },
      "The Home Assistant configuration response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_states",
    description: "List all current Home Assistant entity states.",
    inputSchema: emptyInputSchema,
    outputSchema: s.actionOutput(
      { states: s.array("The Home Assistant state objects.", stateSchema) },
      "The current Home Assistant entity states.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_state",
    description: "Fetch the current state for one Home Assistant entity.",
    inputSchema: entityInputSchema,
    outputSchema: s.actionOutput({ state: stateSchema }, "The selected Home Assistant entity state."),
  }),
  defineProviderAction(service, {
    name: "list_services",
    description: "List Home Assistant service domains and their available services.",
    inputSchema: emptyInputSchema,
    outputSchema: s.actionOutput(
      {
        services: s.array(
          "The Home Assistant service domains returned by the instance.",
          s.looseObject("One Home Assistant service domain entry."),
        ),
      },
      "The Home Assistant service catalog.",
    ),
  }),
  defineProviderAction(service, {
    name: "call_service",
    description: "Call a Home Assistant service to control entities, such as light.turn_on or switch.turn_off.",
    inputSchema: s.actionInput(
      {
        domain: s.nonEmptyString("The Home Assistant service domain, for example light or switch."),
        service: s.nonEmptyString("The Home Assistant service name, for example turn_on or turn_off."),
        serviceData: s.looseObject(
          "The JSON service data sent directly to Home Assistant, such as entity_id or brightness.",
        ),
        returnResponse: s.boolean("Whether to request service response data with the return_response query parameter."),
      },
      ["domain", "service"],
      "Input parameters for calling one Home Assistant service.",
    ),
    outputSchema: s.actionOutput(
      {
        changedStates: s.array("The Home Assistant states changed by the service call.", stateSchema),
        serviceResponse: s.nullable(s.looseObject("The optional Home Assistant service response object.")),
      },
      "The normalized Home Assistant service call response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_events",
    description: "List Home Assistant event types currently known by the instance.",
    inputSchema: emptyInputSchema,
    outputSchema: s.actionOutput(
      {
        events: s.array(
          "The Home Assistant event type entries returned by the instance.",
          s.looseObject("One Home Assistant event type entry."),
        ),
      },
      "The Home Assistant event type catalog.",
    ),
  }),
  defineProviderAction(service, {
    name: "fire_event",
    description: "Fire one Home Assistant event with optional event data.",
    inputSchema: s.actionInput(
      {
        eventType: s.nonEmptyString("The Home Assistant event type to fire."),
        eventData: s.looseObject("The optional JSON event data sent to Home Assistant."),
      },
      ["eventType"],
      "Input parameters for firing one Home Assistant event.",
    ),
    outputSchema: s.actionOutput(
      { response: s.looseObject("The JSON response returned by Home Assistant after firing the event.") },
      "The Home Assistant fire-event response.",
    ),
  }),
  defineProviderAction(service, {
    name: "render_template",
    description: "Render a Home Assistant template against the connected instance.",
    inputSchema: s.actionInput(
      {
        template: s.nonEmptyString("The Home Assistant template string to render."),
        variables: s.looseObject("Optional template variables passed to Home Assistant."),
      },
      ["template"],
      "Input parameters for rendering one Home Assistant template.",
    ),
    outputSchema: s.actionOutput(
      { result: s.string("The rendered template text returned by Home Assistant.") },
      "The rendered Home Assistant template response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_history",
    description:
      "Fetch recorded state history for one or more Home Assistant entities over a time period, for answering questions about how a value changed.",
    followUpActions: ["home_assistant.get_logbook"],
    inputSchema: s.actionInput(
      {
        entityIds: s.array(
          "The entity ids to fetch history for. Home Assistant requires at least one.",
          s.nonEmptyString("One Home Assistant entity identifier."),
          { minItems: 1 },
        ),
        startTime: s.dateTime("The start of the period. Defaults to one day before now when omitted."),
        endTime: s.dateTime("The end of the period. Defaults to one day after the start time."),
        minimalResponse: s.boolean(
          "Return only state changes without full attribute payloads, which greatly reduces response size.",
        ),
        noAttributes: s.boolean("Omit entity attributes from the response."),
        skipInitialState: s.boolean("Omit the state that was already active at the start of the period."),
        significantChangesOnly: s.boolean(
          "Return only significant state changes. Home Assistant defaults this to true.",
        ),
      },
      ["entityIds"],
      "Input parameters for one Home Assistant history query.",
    ),
    outputSchema: s.actionOutput(
      {
        history: s.array(
          "One list of state objects per requested entity, in the order Home Assistant returns them.",
          s.array("The recorded states for one entity.", historyStateSchema),
        ),
      },
      "The recorded Home Assistant state history.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_logbook",
    description:
      "Fetch the Home Assistant logbook: the human-readable timeline of what happened and what triggered it, for diagnosing why something changed.",
    inputSchema: s.actionInput(
      {
        startTime: s.dateTime("The start of the period. Defaults to one day before now when omitted."),
        endTime: s.dateTime("The end of the period."),
        entityIds: s.array(
          "Optional entity ids to restrict the logbook to.",
          s.nonEmptyString("One Home Assistant entity identifier."),
        ),
        period: s.positiveInteger("The number of days to cover, used when no end time is given."),
        contextId: s.nonEmptyString(
          "Optional Home Assistant context id, to list only the entries produced by one action.",
        ),
      },
      [],
      "Input parameters for one Home Assistant logbook query.",
    ),
    outputSchema: s.actionOutput(
      {
        entries: s.array("The logbook entries.", s.looseObject("One Home Assistant logbook entry.")),
      },
      "The Home Assistant logbook entries for the requested period.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_calendars",
    description: "List the calendar entities exposed by Home Assistant.",
    followUpActions: ["home_assistant.list_calendar_events"],
    inputSchema: emptyInputSchema,
    outputSchema: s.actionOutput(
      {
        calendars: s.array(
          "The Home Assistant calendar entities.",
          s.looseRequiredObject(
            "One Home Assistant calendar entity.",
            {
              entity_id: s.string("The calendar entity identifier."),
              name: s.string("The calendar display name."),
            },
            { optional: ["name"] },
          ),
        ),
      },
      "The Home Assistant calendar entities.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_calendar_events",
    description: "List the events on one Home Assistant calendar between a start and end time.",
    inputSchema: s.actionInput(
      {
        entityId: s.nonEmptyString("The calendar entity identifier, for example calendar.personal."),
        start: s.dateTime("The inclusive start of the window."),
        end: s.dateTime("The exclusive end of the window, which must be after the start."),
      },
      ["entityId", "start", "end"],
      "Input parameters for one Home Assistant calendar event query.",
    ),
    outputSchema: s.actionOutput(
      {
        events: s.array(
          "The calendar events in the requested window.",
          s.looseObject(
            "One Home Assistant calendar event. Start and end are objects holding either dateTime or date.",
          ),
        ),
      },
      "The Home Assistant calendar events.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_error_log",
    description:
      "Fetch the Home Assistant error log for the current session as plain text. Home Assistant serves this only when the instance runs with file logging enabled, so it can report not found on an otherwise healthy instance.",
    inputSchema: emptyInputSchema,
    outputSchema: s.actionOutput(
      { log: s.string("The plain-text Home Assistant error log.") },
      "The Home Assistant error log.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_registries",
    description:
      "List the Home Assistant entity, device, area, floor, and label registries in one call. These registries expose the device and room structure behind entity ids, which the REST API does not serve.",
    inputSchema: s.actionInput(
      {
        include: s.array(
          "The registries to fetch. Defaults to all five when omitted or empty.",
          s.stringEnum("One Home Assistant registry name.", registryNames),
        ),
      },
      [],
      "Input parameters for selecting which Home Assistant registries to fetch.",
    ),
    outputSchema: s.actionOutput(
      {
        entities: registryListSchema(
          "The entity registry entries, including the device and area each entity belongs to.",
        ),
        devices: registryListSchema("The device registry entries, including manufacturer, model, and area."),
        areas: registryListSchema("The area registry entries."),
        floors: registryListSchema("The floor registry entries."),
        labels: registryListSchema("The label registry entries."),
      },
      "The requested Home Assistant registries. Registries excluded from the request are null.",
    ),
  }),
  defineProviderAction(service, {
    name: "search_related",
    description:
      "Find the Home Assistant items related to one entity, device, area, automation, or config entry, such as the automations that reference a given light.",
    inputSchema: s.actionInput(
      {
        itemType: s.stringEnum("The Home Assistant item type to search from.", searchItemTypes),
        itemId: s.nonEmptyString(
          "The identifier of the item to search from, for example light.living_room for an entity.",
        ),
      },
      ["itemType", "itemId"],
      "Input parameters for one Home Assistant related-items search.",
    ),
    outputSchema: s.actionOutput(
      {
        related: s.looseObject("The related Home Assistant item identifiers, keyed by item type."),
      },
      "The Home Assistant items related to the requested item.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_device_automations",
    description:
      "List the triggers, conditions, and actions one Home Assistant device supports, for building automations against that device.",
    followUpActions: ["home_assistant.validate_config"],
    inputSchema: s.actionInput(
      {
        deviceId: s.nonEmptyString("The Home Assistant device registry identifier."),
      },
      ["deviceId"],
      "Input parameters for listing one Home Assistant device's automation capabilities.",
    ),
    outputSchema: s.actionOutput(
      {
        triggers: s.array("The device triggers.", s.looseObject("One Home Assistant device trigger.")),
        conditions: s.array("The device conditions.", s.looseObject("One Home Assistant device condition.")),
        actions: s.array("The device actions.", s.looseObject("One Home Assistant device action.")),
      },
      "The automation capabilities for the requested Home Assistant device.",
    ),
  }),
  defineProviderAction(service, {
    name: "execute_script",
    description:
      "Run a Home Assistant script sequence, which can chain several service calls, delays, and conditions in one request instead of one service call at a time.",
    inputSchema: s.actionInput(
      {
        sequence: s.array(
          "The Home Assistant script steps to run, in the same format as a script's sequence.",
          s.looseObject("One Home Assistant script step."),
        ),
        variables: s.looseObject("Optional variables made available to the script sequence."),
      },
      ["sequence"],
      "Input parameters for running one Home Assistant script sequence.",
    ),
    outputSchema: s.actionOutput(
      {
        context: s.nullable(s.looseObject("The Home Assistant context for the script run.")),
        response: s.nullable(s.looseObject("The optional script response variable returned by Home Assistant.")),
      },
      "The Home Assistant script execution result.",
    ),
  }),
  defineProviderAction(service, {
    name: "validate_config",
    description:
      "Validate Home Assistant trigger, condition, and action configurations before storing them in an automation.",
    followUpActions: ["home_assistant.save_automation_config", "home_assistant.save_script_config"],
    inputSchema: s.actionInput(
      {
        triggers: s.array("The trigger configurations to validate.", s.looseObject("One Home Assistant trigger.")),
        conditions: s.array(
          "The condition configurations to validate.",
          s.looseObject("One Home Assistant condition."),
        ),
        actions: s.array("The action configurations to validate.", s.looseObject("One Home Assistant action.")),
      },
      [],
      "Input parameters for validating Home Assistant automation configuration. At least one list is required.",
    ),
    outputSchema: s.actionOutput(
      {
        validation: s.looseObject(
          "The validation result keyed by triggers, conditions, and actions, each with valid and error fields.",
        ),
      },
      "The Home Assistant configuration validation result.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_automation_config",
    description: `Fetch the stored configuration for one Home Assistant automation. ${configAdminNote}`,
    followUpActions: ["home_assistant.save_automation_config"],
    inputSchema: configKeyInput("automationId", "The automation id, which is the id field inside the automation."),
    outputSchema: configReadOutput("The stored automation configuration."),
  }),
  defineProviderAction(service, {
    name: "save_automation_config",
    description: `Create or replace one Home Assistant automation. Posting to an unused id creates the automation. ${configAdminNote}`,
    followUpActions: ["home_assistant.get_automation_config", "home_assistant.get_logbook"],
    inputSchema: configSaveInput(
      "automationId",
      "The automation id to create or replace.",
      "The automation configuration, with the same keys as an automations.yaml entry such as alias, triggers, conditions, actions, and mode.",
    ),
    outputSchema: configWriteResultSchema,
  }),
  defineProviderAction(service, {
    name: "delete_automation_config",
    description: `Delete one Home Assistant automation. ${configAdminNote}`,
    inputSchema: configKeyInput("automationId", "The automation id to delete."),
    outputSchema: configWriteResultSchema,
  }),
  defineProviderAction(service, {
    name: "get_script_config",
    description: `Fetch the stored configuration for one Home Assistant script. ${configAdminNote}`,
    followUpActions: ["home_assistant.save_script_config"],
    inputSchema: configKeyInput("scriptKey", "The script key, the slug after script. in the entity id."),
    outputSchema: configReadOutput("The stored script configuration."),
  }),
  defineProviderAction(service, {
    name: "save_script_config",
    description: `Create or replace one Home Assistant script. Posting to an unused key creates the script. ${configAdminNote}`,
    followUpActions: ["home_assistant.get_script_config"],
    inputSchema: configSaveInput(
      "scriptKey",
      "The script key to create or replace, which must be a slug of lowercase letters, digits, and underscores.",
      "The script configuration, with the same keys as a scripts.yaml entry such as alias, sequence, and mode.",
    ),
    outputSchema: configWriteResultSchema,
  }),
  defineProviderAction(service, {
    name: "delete_script_config",
    description: `Delete one Home Assistant script. ${configAdminNote}`,
    inputSchema: configKeyInput("scriptKey", "The script key to delete."),
    outputSchema: configWriteResultSchema,
  }),
  defineProviderAction(service, {
    name: "get_scene_config",
    description: `Fetch the stored configuration for one Home Assistant scene. ${configAdminNote}`,
    followUpActions: ["home_assistant.save_scene_config"],
    inputSchema: configKeyInput("sceneId", "The scene id, which is the id field inside the scene."),
    outputSchema: configReadOutput("The stored scene configuration."),
  }),
  defineProviderAction(service, {
    name: "save_scene_config",
    description: `Create or replace one Home Assistant scene. Posting to an unused id creates the scene. ${configAdminNote}`,
    followUpActions: ["home_assistant.get_scene_config"],
    inputSchema: configSaveInput(
      "sceneId",
      "The scene id to create or replace.",
      "The scene configuration, with the same keys as a scenes.yaml entry such as name and entities.",
    ),
    outputSchema: configWriteResultSchema,
  }),
  defineProviderAction(service, {
    name: "delete_scene_config",
    description: `Delete one Home Assistant scene. ${configAdminNote}`,
    inputSchema: configKeyInput("sceneId", "The scene id to delete."),
    outputSchema: configWriteResultSchema,
  }),
  defineProviderAction(service, {
    name: "check_config",
    description:
      "Ask Home Assistant to validate its own configuration files and report errors and warnings. Requires an admin access token.",
    inputSchema: emptyInputSchema,
    outputSchema: s.actionOutput(
      {
        result: s.string("Either valid or invalid."),
        errors: s.nullableString("The configuration errors, or null when there are none."),
        warnings: s.nullableString("The configuration warnings, or null when there are none."),
      },
      "The Home Assistant configuration check result.",
    ),
  }),
];
