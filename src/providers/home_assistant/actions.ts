import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "home_assistant";

const contextSchema = s.looseObject("The Home Assistant context attached to a state change.", {
  id: s.nullableString("The Home Assistant context identifier."),
  parent_id: s.nullableString("The optional parent context identifier."),
  user_id: s.nullableString("The optional Home Assistant user identifier."),
});

const stateSchema = s.looseRequiredObject(
  "One Home Assistant entity state object.",
  {
    entity_id: s.string("The Home Assistant entity identifier."),
    state: s.string("The current state value."),
    attributes: s.looseObject("The integration-specific attributes for the entity state."),
    last_changed: s.string("The timestamp when the state last changed."),
    last_updated: s.string("The timestamp when the state object was last updated."),
    context: contextSchema,
  },
  { optional: ["attributes", "context"] },
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
];

export type HomeAssistantRestActionName =
  | "get_config"
  | "list_states"
  | "get_state"
  | "list_services"
  | "call_service"
  | "list_events"
  | "fire_event"
  | "render_template";

export type HomeAssistantWebSocketActionName =
  | "get_registries"
  | "search_related"
  | "list_device_automations"
  | "execute_script"
  | "validate_config";
