import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "lifx";

const selectorSchema = s.nonEmptyString(
  "The LIFX selector to address lights, such as `all`, `id:d073d5141876`, `group:Kitchen`, or a comma-separated selector list.",
);

const durationSchema = s.number("The transition duration in seconds.", {
  minimum: 0,
});

const powerSchema = s.stringEnum("The target power state.", ["on", "off"]);

const actionResultSchema = s.looseObject("One result returned by LIFX for a light control operation.", {
  id: s.string("The LIFX light id."),
  label: s.string("The LIFX light label."),
  status: s.string("The operation status returned by LIFX."),
});

const actionResponseSchema = s.requiredObject("The normalized LIFX operation response.", {
  accepted: s.boolean("Whether LIFX accepted the request without returning per-light results."),
  results: s.array("The per-light operation results returned by LIFX.", actionResultSchema),
});

const colorStateSchema = s.looseObject("The color state returned by LIFX.", {
  hue: s.number("The color hue value."),
  saturation: s.number("The color saturation value."),
  kelvin: s.integer("The color temperature in kelvin."),
});

const lightSchema = s.looseObject("A LIFX light returned by the List Lights endpoint.", {
  id: s.string("The LIFX light id."),
  uuid: s.string("The LIFX light UUID."),
  label: s.string("The user-visible light label."),
  connected: s.boolean("Whether the light is connected."),
  power: s.string("The light power state."),
  color: colorStateSchema,
  brightness: s.number("The light brightness from 0.0 to 1.0."),
  effect: s.string("The active firmware effect name, or OFF."),
  group: s.looseObject("The LIFX group object for the light."),
  location: s.looseObject("The LIFX location object for the light."),
  product: s.looseObject("The LIFX product object for the light."),
  last_seen: s.string("The last time LIFX saw the device."),
  seconds_since_seen: s.integer("The seconds since LIFX last saw the device."),
});

const sceneSchema = s.looseObject("A LIFX scene returned by the List Scenes endpoint.", {
  uuid: s.string("The LIFX scene UUID."),
  name: s.string("The scene name."),
  account: s.looseObject("The LIFX account object for the scene."),
  states: s.array("The light states configured in the scene.", s.looseObject("A scene state.")),
  created_at: s.integer("The Unix timestamp when the scene was created."),
  updated_at: s.integer("The Unix timestamp when the scene was last updated."),
});

const setStateInputSchema = s.object(
  "Input parameters for setting LIFX light state.",
  {
    selector: selectorSchema,
    power: powerSchema,
    color: s.nonEmptyString("The LIFX color string to set, such as `blue saturation:0.5`."),
    brightness: s.number("The brightness level from 0.0 to 1.0.", { minimum: 0, maximum: 1 }),
    duration: durationSchema,
    infrared: s.number("The maximum brightness of the infrared channel from 0.0 to 1.0.", {
      minimum: 0,
      maximum: 1,
    }),
    fast: s.boolean("Whether to use LIFX fast mode and return as soon as the request is accepted."),
  },
  { optional: ["power", "color", "brightness", "duration", "infrared", "fast"] },
);

const activateSceneInputSchema = s.object(
  "Input parameters for activating a LIFX scene.",
  {
    sceneUuid: s.uuid("The UUID of the LIFX scene to activate."),
    duration: durationSchema,
    ignore: s.array(
      "Scene state fields LIFX should not change when applying the scene.",
      s.stringEnum("A scene state field to ignore.", [
        "power",
        "infrared",
        "duration",
        "intensity",
        "hue",
        "saturation",
        "brightness",
        "kelvin",
      ]),
    ),
    overrides: s.looseObject(
      "A LIFX state object to apply to all devices in the scene, overriding the scene configuration.",
    ),
    fast: s.boolean("Whether to use LIFX fast mode and return as soon as the request is accepted."),
  },
  { optional: ["duration", "ignore", "overrides", "fast"] },
);

export const lifxActions: ProviderActionDefinition<LifxActionName>[] = [
  defineProviderAction(service, {
    name: "list_lights",
    operationType: "read",
    description: "List LIFX lights visible to the API token, optionally limited by a selector.",
    inputSchema: s.object(
      "Input parameters for listing LIFX lights.",
      {
        selector: selectorSchema,
      },
      { optional: ["selector"] },
    ),
    outputSchema: s.requiredObject("The LIFX lights matching the selector.", {
      lights: s.array("The matching LIFX lights.", lightSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "set_state",
    operationType: "write",
    description: "Set power, color, brightness, infrared, or transition duration for LIFX lights matching a selector.",
    inputSchema: setStateInputSchema,
    outputSchema: actionResponseSchema,
  }),
  defineProviderAction(service, {
    name: "toggle_power",
    operationType: "write",
    description: "Toggle the power state for LIFX lights matching a selector.",
    inputSchema: s.object(
      "Input parameters for toggling LIFX light power.",
      {
        selector: selectorSchema,
        duration: durationSchema,
      },
      { optional: ["duration"] },
    ),
    outputSchema: actionResponseSchema,
  }),
  defineProviderAction(service, {
    name: "list_scenes",
    operationType: "read",
    description: "List scenes available to the authenticated LIFX account.",
    inputSchema: s.object("Input parameters for listing LIFX scenes.", {}),
    outputSchema: s.requiredObject("The LIFX scenes available to the account.", {
      scenes: s.array("The available LIFX scenes.", sceneSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "activate_scene",
    operationType: "write",
    description: "Activate a LIFX scene by UUID, optionally overriding or ignoring state fields.",
    inputSchema: activateSceneInputSchema,
    outputSchema: actionResponseSchema,
  }),
  defineProviderAction(service, {
    name: "validate_color",
    operationType: "read",
    description:
      "Validate a LIFX color string and return the hue, saturation, brightness, and kelvin values LIFX will use.",
    inputSchema: s.requiredObject("Input parameters for validating a LIFX color string.", {
      color: s.nonEmptyString("The LIFX color string to validate, such as `red` or `kelvin:2700`."),
    }),
    outputSchema: s.requiredObject("The parsed LIFX color values.", {
      hue: s.nullableNumber("The parsed hue value."),
      saturation: s.nullableNumber("The parsed saturation value."),
      brightness: s.nullableNumber("The parsed brightness value."),
      kelvin: s.nullableNumber("The parsed kelvin value."),
    }),
  }),
  defineProviderAction(service, {
    name: "turn_effects_off",
    operationType: "write",
    description: "Turn off running LIFX effects for lights matching a selector, optionally powering the lights off.",
    inputSchema: s.object(
      "Input parameters for turning LIFX effects off.",
      {
        selector: selectorSchema,
        powerOff: s.boolean("Whether LIFX should also power the devices off."),
      },
      { optional: ["powerOff"] },
    ),
    outputSchema: actionResponseSchema,
  }),
];

export type LifxActionName =
  | "list_lights"
  | "set_state"
  | "toggle_power"
  | "list_scenes"
  | "activate_scene"
  | "validate_color"
  | "turn_effects_off";
