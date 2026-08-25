import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "kie_ai";

const responseCodeSchema = s.integer("The response status code returned by KIE.AI.");
const responseMessageSchema = s.string("The response message returned by KIE.AI.");

export const kieAiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account_credits",
    description: "Get the remaining credit balance for the connected KIE.AI account.",
    inputSchema: s.object("The input payload for getting KIE.AI account credits.", {}),
    outputSchema: s.object("The KIE.AI account credit response.", {
      code: responseCodeSchema,
      message: responseMessageSchema,
      credits: s.integer("The remaining credit quantity reported by KIE.AI."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_download_url",
    description: "Convert a KIE.AI generated file URL into a temporary direct download URL.",
    inputSchema: s.object("The input payload for getting a KIE.AI download URL.", {
      url: s.string("The KIE.AI generated file URL to convert into a download URL.", {
        minLength: 1,
        format: "uri",
      }),
    }),
    outputSchema: s.object("The KIE.AI generated file download URL response.", {
      code: responseCodeSchema,
      message: responseMessageSchema,
      downloadUrl: s.string("The temporary downloadable URL returned by KIE.AI.", {
        format: "uri",
      }),
      expiresInSeconds: s.integer("The documented validity window for the download URL in seconds."),
    }),
  }),
];
