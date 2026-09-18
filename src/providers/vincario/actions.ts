import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "vincario";

const emptyInputSchema = s.object("No input parameters are required.", {});

const vinInputSchema = s.object("Input parameters for a Vincario VIN lookup.", {
  vin: s.string("The 17-character vehicle identification number to look up.", { minLength: 17, maxLength: 17 }),
});

const chargeFields = {
  price: s.number("The number of credits charged for the request."),
  price_currency: s.string("The currency or credit unit reported for the request price."),
  balance: s.looseRequiredObject("Remaining credits grouped by Vincario service.", {}),
};

const balanceOutputSchema = s.looseRequiredObject("The remaining Vincario service balances.", {});

const vinDecodeInfoOutputSchema = s.looseRequiredObject("The available decode fields for the supplied VIN.", {
  ...chargeFields,
  decode: s.array("Decode field labels available for the VIN.", s.string("A decode field label.")),
});

const decodeVinOutputSchema = s.looseRequiredObject("The decoded vehicle data returned by Vincario.", {
  ...chargeFields,
  decode: s.array(
    "Decoded vehicle attributes.",
    s.looseRequiredObject("A decoded vehicle attribute.", {
      label: s.string("The vehicle attribute label."),
      value: s.unknown("The decoded value, whose type depends on the attribute."),
    }),
  ),
});

const stolenCheckOutputSchema = s.looseRequiredObject("The stolen-vehicle check returned by Vincario.", {
  ...chargeFields,
  vin: s.string("The VIN checked by Vincario."),
  stolen: s.array(
    "Stolen-vehicle checks returned by each available source.",
    s.looseRequiredObject("A stolen-vehicle source result.", {
      code: s.string("The country or Vincario database source code."),
      status: s.stringEnum("The stolen-vehicle status reported by the source.", [
        "stolen",
        "not-stolen",
        "could-not-verify",
      ]),
    }),
  ),
});

const vehicleMarketValueInputSchema = s.object(
  "Input parameters for estimating a vehicle's market value.",
  {
    vin: s.string("The 17-character vehicle identification number to look up.", { minLength: 17, maxLength: 17 }),
    odometer: s.nonNegativeInteger("Optional odometer reading used for the price-adjusted estimate."),
    odometerUnit: s.stringEnum("Unit of the odometer reading.", ["km", "mi"]),
  },
  { optional: ["odometer", "odometerUnit"] },
);

const vehicleMarketValueOutputSchema = s.looseRequiredObject(
  "The vehicle identity and market-value estimates returned by Vincario.",
  {
    ...chargeFields,
    vin: s.string("The VIN evaluated by Vincario."),
    vehicle: s.looseRequiredObject("Decoded vehicle details used for the estimate.", {}),
    period: s.looseRequiredObject("The market-data period used for the estimate.", {}),
    market_price: s.looseRequiredObject("Market price statistics grouped by region.", {}),
    market_odometer: s.looseRequiredObject("Market odometer statistics grouped by region.", {}),
  },
);

export const vincarioActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_balance",
    operationType: "read",
    description: "Get the remaining Vincario credits for each API service.",
    inputSchema: emptyInputSchema,
    outputSchema: balanceOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_vin_decode_info",
    operationType: "read",
    description: "List the vehicle fields Vincario can decode for a VIN without charging credits.",
    inputSchema: vinInputSchema,
    outputSchema: vinDecodeInfoOutputSchema,
  }),
  defineProviderAction(service, {
    name: "decode_vin",
    operationType: "read",
    description: "Decode a VIN into detailed vehicle specifications with Vincario.",
    inputSchema: vinInputSchema,
    outputSchema: decodeVinOutputSchema,
  }),
  defineProviderAction(service, {
    name: "check_stolen",
    operationType: "read",
    description: "Check a VIN against the stolen-vehicle sources available through Vincario.",
    inputSchema: vinInputSchema,
    outputSchema: stolenCheckOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_vehicle_market_value",
    operationType: "read",
    description: "Estimate a vehicle's market price and odometer statistics from its VIN.",
    inputSchema: vehicleMarketValueInputSchema,
    outputSchema: vehicleMarketValueOutputSchema,
  }),
];
