import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "sensibo";

const deviceIdSchema = s.nonEmptyString("The unique Sensibo device identifier.");
const optionalFieldsSchema = s.nonEmptyString(
  "Comma-separated fields to retrieve, or * to request all available fields.",
);

const roomSchema = s.object(
  "Room information associated with the Sensibo device.",
  {
    id: s.string("The room identifier."),
    name: s.string("The room name."),
  },
  { optional: ["name"] },
);

const measurementSchema = s.object(
  "A measurement snapshot reported by the Sensibo device.",
  {
    temperature: s.number("The measured ambient temperature."),
    humidity: s.number("The measured relative humidity percentage."),
    time: s.object(
      "Timestamp information for the measurement snapshot.",
      {
        time: s.string("The measurement timestamp."),
        secondsAgo: s.number("How many seconds ago the measurement was captured."),
      },
      { optional: ["time", "secondsAgo"] },
    ),
  },
  { optional: ["temperature", "humidity", "time"] },
);

const acStateSchema = s.object(
  "The AC state currently reported by Sensibo.",
  {
    on: s.boolean("Whether the AC is currently on."),
    mode: s.string("The operating mode, such as cool, heat, fan, auto, or dry."),
    fanLevel: s.string("The current fan level."),
    targetTemperature: s.integer("The configured target temperature."),
    temperatureUnit: s.string("The temperature unit, such as C or F."),
    swing: s.string("The swing mode when the remote supports it."),
  },
  { optional: ["temperatureUnit", "swing"] },
);

const remoteModeCapabilitiesSchema = s.object(
  "Remote capability details for one AC mode.",
  {
    temperatures: s.object(
      "Temperature capability metadata for the mode.",
      {
        C: s.object("Supported Celsius temperature range.", {
          values: s.array(
            "The supported Celsius target temperatures.",
            s.integer("One supported Celsius target temperature."),
          ),
        }),
        F: s.object("Supported Fahrenheit temperature range.", {
          values: s.array(
            "The supported Fahrenheit target temperatures.",
            s.integer("One supported Fahrenheit target temperature."),
          ),
        }),
      },
      { optional: ["C", "F"] },
    ),
    fanLevels: s.array("The fan levels supported in the selected mode.", s.string("One supported fan level.")),
    swing: s.array("The swing states supported in the selected mode.", s.string("One supported swing state.")),
  },
  { optional: ["temperatures", "fanLevels", "swing"] },
);

const remoteCapabilitiesSchema = s.object(
  "Remote capabilities reported for the Sensibo device.",
  {
    modes: s.record("Mapping of supported AC modes to their capabilities.", remoteModeCapabilitiesSchema),
  },
  { optional: ["modes"] },
);

const deviceSchema = s.object(
  "A Sensibo device.",
  {
    id: s.string("The device identifier."),
    name: s.string("The device name."),
    room: roomSchema,
    measurements: measurementSchema,
    acState: acStateSchema,
    connectionStatus: s.object(
      "Connectivity information for the device.",
      {
        isAlive: s.boolean("Whether the device is currently reachable."),
        lastSeen: s.object(
          "Last seen timestamp information.",
          {
            time: s.string("The last seen timestamp."),
            secondsAgo: s.number("How many seconds ago the device was last seen."),
          },
          { optional: ["time", "secondsAgo"] },
        ),
      },
      { optional: ["isAlive", "lastSeen"] },
    ),
    productModel: s.string("The Sensibo product model."),
    remoteCapabilities: remoteCapabilitiesSchema,
  },
  {
    optional: ["name", "room", "measurements", "acState", "connectionStatus", "productModel", "remoteCapabilities"],
  },
);

const acStateHistoryEntrySchema = s.object(
  "One AC state history entry returned by Sensibo.",
  {
    status: s.string("The state transition status label."),
    reason: s.string("The reason for the state transition when provided."),
    acState: acStateSchema,
    changedProperties: s.array(
      "The AC state properties changed in this history entry.",
      s.string("One AC state property changed in this entry."),
    ),
    time: s.object(
      "Timestamp information for the history entry.",
      {
        time: s.string("The history entry timestamp."),
        secondsAgo: s.number("How many seconds ago the history entry occurred."),
      },
      { optional: ["time", "secondsAgo"] },
    ),
  },
  { optional: ["status", "reason", "changedProperties", "time"] },
);

export const sensiboActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_devices",
    description: "List Sensibo devices linked to the authenticated user.",
    inputSchema: s.actionInput(
      {
        fields: optionalFieldsSchema,
      },
      [],
      "Input parameters for listing Sensibo devices linked to the authenticated user.",
    ),
    outputSchema: s.actionOutput(
      {
        devices: s.array("The devices returned by Sensibo.", deviceSchema),
      },
      "Sensibo devices linked to the authenticated user.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_device",
    description: "Get detailed information for one Sensibo device.",
    inputSchema: s.actionInput(
      {
        device_id: deviceIdSchema,
        fields: optionalFieldsSchema,
      },
      ["device_id"],
      "Input parameters for retrieving one Sensibo device.",
    ),
    outputSchema: s.actionOutput(
      {
        device: deviceSchema,
      },
      "The requested Sensibo device.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_ac_states",
    description: "Get current and previous AC states for one Sensibo device.",
    inputSchema: s.actionInput(
      {
        device_id: deviceIdSchema,
        limit: s.integer("The number of state entries to retrieve, up to 20.", { minimum: 1, maximum: 20 }),
      },
      ["device_id"],
      "Input parameters for retrieving current and previous AC states for one Sensibo device.",
    ),
    outputSchema: s.actionOutput(
      {
        states: s.array("The AC state history entries returned by Sensibo.", acStateHistoryEntrySchema),
      },
      "Current and previous AC states for one Sensibo device.",
    ),
  }),
  defineProviderAction(service, {
    name: "set_ac_state",
    description: "Set the full AC state for one Sensibo device.",
    inputSchema: s.actionInput(
      {
        device_id: deviceIdSchema,
        acState: acStateSchema,
      },
      ["device_id", "acState"],
      "Input parameters for setting the full AC state for one Sensibo device.",
    ),
    outputSchema: s.actionOutput(
      {
        success: s.boolean("Whether Sensibo accepted the AC state update."),
      },
      "Normalized result for setting the AC state.",
    ),
  }),
];
