import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "govee";

const requiredString = (description: string) => s.nonWhitespaceString(description);

const deviceIdentitySchema = {
  sku: requiredString("The Govee product model, such as `H605C`."),
  device: requiredString("The Govee device id returned by list_devices."),
};

const capabilityParametersSchema = s.looseObject(
  "The Govee capability parameters that describe valid values for this capability.",
);

const capabilitySchema = s.looseObject("A Govee device capability.", {
  type: s.string("The Govee capability type."),
  instance: s.string("The Govee capability instance."),
  parameters: capabilityParametersSchema,
});

const deviceSchema = s.looseObject("A Govee device returned by the Discover Devices endpoint.", {
  sku: s.string("The Govee product model."),
  device: s.string("The Govee device id."),
  deviceName: s.string("The user-visible Govee device name."),
  type: s.string("The Govee device type."),
  capabilities: s.array("The capabilities supported by the device.", capabilitySchema),
});

const stateCapabilitySchema = s.looseObject("A Govee capability state returned for a device.", {
  type: s.string("The Govee capability type."),
  instance: s.string("The Govee capability instance."),
  state: s.looseObject("The current state for the capability."),
});

const deviceStateSchema = s.looseObject("The Govee device state payload.", {
  sku: s.string("The Govee product model."),
  device: s.string("The Govee device id."),
  capabilities: s.array("The capability states returned by Govee.", stateCapabilitySchema),
});

const sceneSchema = s.looseObject("A Govee dynamic scene option.", {
  name: s.string("The scene name."),
  value: s.unknown("The value Govee expects when activating this scene capability."),
});

const scenePayloadSchema = s.looseObject("The Govee dynamic scene payload.", {
  sku: s.string("The Govee product model."),
  device: s.string("The Govee device id."),
  capabilities: s.array(
    "The dynamic scene capabilities returned by Govee.",
    s.looseObject("A Govee dynamic scene capability.", {
      type: s.string("The Govee capability type."),
      instance: s.string("The Govee capability instance."),
      parameters: s.looseObject("The scene capability parameters.", {
        dataType: s.string("The parameter data type returned by Govee."),
        options: s.array("The available dynamic scene options.", sceneSchema),
      }),
    }),
  ),
});

const goveeEnvelopeSchema = s.requiredObject("The normalized Govee API response envelope.", {
  requestId: s.nullable(s.string("The request id echoed by Govee, when returned.")),
  code: s.integer("The numeric Govee response code."),
  message: s.string("The Govee response message."),
});

const deviceInputSchema = s.requiredObject("Input parameters identifying one Govee device.", {
  ...deviceIdentitySchema,
});

const controlCapabilityInputSchema = s.object(
  "Input parameters for controlling a Govee capability.",
  {
    ...deviceIdentitySchema,
    type: requiredString("The Govee capability type, such as `devices.capabilities.on_off`."),
    instance: requiredString("The Govee capability instance, such as `powerSwitch`."),
    value: s.unknown("The value to send for this capability, as documented in list_devices."),
    requestId: s.uuid("A caller-supplied request id. When omitted, the provider generates a UUID."),
  },
  { optional: ["requestId"] },
);

export const goveeActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_devices",
    operationType: "read",
    description: "List Govee devices visible to the API key, including each device's supported capabilities.",
    requiredScopes: [],
    inputSchema: s.requiredObject("Input parameters for listing Govee devices.", {}),
    outputSchema: s.requiredObject("The Govee devices visible to the API key.", {
      devices: s.array("The discovered Govee devices.", deviceSchema),
      raw: s.looseObject("The raw Govee response envelope."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_device_state",
    operationType: "read",
    description: "Get the current state for one Govee device by sku and device id.",
    requiredScopes: [],
    inputSchema: deviceInputSchema,
    outputSchema: s.requiredObject("The current Govee device state.", {
      state: deviceStateSchema,
      raw: s.looseObject("The raw Govee response envelope."),
    }),
  }),
  defineProviderAction(service, {
    name: "control_capability",
    operationType: "destructive",
    description:
      "Send one documented Govee capability value to a device, such as power, brightness, color, mode, or temperature.",
    requiredScopes: [],
    inputSchema: controlCapabilityInputSchema,
    outputSchema: s.requiredObject("The Govee control response.", {
      result: goveeEnvelopeSchema,
      raw: s.looseObject("The raw Govee response envelope."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_light_scenes",
    operationType: "read",
    description: "List dynamic light scenes available for one Govee device.",
    requiredScopes: [],
    inputSchema: deviceInputSchema,
    outputSchema: s.requiredObject("The dynamic light scenes available for the Govee device.", {
      scenes: scenePayloadSchema,
      raw: s.looseObject("The raw Govee response envelope."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_diy_scenes",
    operationType: "read",
    description: "List dynamic DIY scenes available for one Govee device.",
    requiredScopes: [],
    inputSchema: deviceInputSchema,
    outputSchema: s.requiredObject("The dynamic DIY scenes available for the Govee device.", {
      scenes: scenePayloadSchema,
      raw: s.looseObject("The raw Govee response envelope."),
    }),
  }),
];
