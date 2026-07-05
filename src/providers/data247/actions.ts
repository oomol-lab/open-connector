import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "data247";

const emptyInput = s.actionInput({}, [], "Input for checking the Data247 account balance.");
const phoneInput = s.actionInput(
  {
    phone: s.string({
      minLength: 1,
      maxLength: 40,
      description: "The phone number to submit to Data247.",
    }),
  },
  ["phone"],
  "Input for a Data247 phone-number lookup.",
);
const status = s.string("The Data247 response status.");
const message = s.string("The Data247 response message when one is returned.");
const balanceResult = s.looseRequiredObject("One Data247 balance result.", {
  balance: s.string("The current Data247 account balance as returned by the API."),
});
const carrierTypeResult = s.looseRequiredObject("One Data247 carrier type result.", {
  phone: s.string("The phone number returned by Data247."),
  type: s.string("The carrier type code returned by Data247, such as M, L, or V."),
});
const verifyPhoneResult = s.looseRequiredObject("One Data247 phone verification result.", {
  phone: s.string("The phone number returned by Data247."),
  active: s.string("Whether Data247 reports the phone number as active."),
  confidence: s.string("The confidence level returned by Data247."),
});
const genderResult = s.looseRequiredObject("One Data247 gender append result.", {
  fname: s.string("The first name returned by Data247."),
  gender: s.string("The probable gender returned by Data247."),
  gender_pct: s.string("The confidence percentage returned by Data247."),
});

function data247ListOutput(resultSchema: JsonSchema, description: string, resultsDescription: string): JsonSchema {
  return s.object(
    {
      status,
      message,
      results: s.array(resultSchema, { description: resultsDescription }),
    },
    { optional: ["message"], description },
  );
}

export type Data247ActionName = "check_balance" | "get_carrier_type" | "verify_phone" | "check_dnc" | "append_gender";

export const data247Actions: Array<ProviderActionDefinition<Data247ActionName>> = [
  defineProviderAction(service, {
    name: "check_balance",
    description: "Check the current Data247 account balance.",
    inputSchema: emptyInput,
    outputSchema: data247ListOutput(
      balanceResult,
      "The Data247 balance lookup response.",
      "The balance records returned by Data247.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_carrier_type",
    description: "Determine whether a USA or Canadian phone number is mobile, landline, or VOIP.",
    inputSchema: phoneInput,
    outputSchema: data247ListOutput(
      carrierTypeResult,
      "The Data247 carrier type lookup response.",
      "The carrier type records returned by Data247.",
    ),
  }),
  defineProviderAction(service, {
    name: "verify_phone",
    description: "Verify whether an international phone number is active.",
    inputSchema: phoneInput,
    outputSchema: data247ListOutput(
      verifyPhoneResult,
      "The Data247 phone verification response.",
      "The phone verification records returned by Data247.",
    ),
  }),
  defineProviderAction(service, {
    name: "check_dnc",
    description: "Check a phone number against Data247 Do-Not-Call data.",
    inputSchema: phoneInput,
    outputSchema: s.object(
      {
        status,
        message,
        phone: s.string("The phone number returned by Data247."),
        dnc: s.string("The DNC status returned by Data247."),
      },
      { required: ["status", "phone", "dnc"], optional: ["message"], description: "The Data247 DNC lookup response." },
    ),
  }),
  defineProviderAction(service, {
    name: "append_gender",
    description: "Infer a probable gender from a first name using Data247.",
    inputSchema: s.actionInput(
      {
        fname: s.string({
          minLength: 1,
          maxLength: 100,
          description: "The first name to submit to Data247.",
        }),
      },
      ["fname"],
      "Input for a Data247 gender append lookup.",
    ),
    outputSchema: data247ListOutput(
      genderResult,
      "The Data247 gender append response.",
      "The gender append records returned by Data247.",
    ),
  }),
];
