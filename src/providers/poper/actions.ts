import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "poper";

const popupSchema = s.looseObject("One popup returned by Poper.");
const popupResponseSchema = s.looseObject("One response collected by a Poper popup.");

export const poperActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_popups",
    description: "List all popups in the authenticated Poper account.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for listing Poper popups.", {}),
    outputSchema: s.object("The popups returned by Poper.", {
      popups: s.array("Popups in the authenticated Poper account.", popupSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_popup_responses",
    description: "List responses collected by one Poper popup.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for listing responses from a Poper popup.", {
      popup_id: s.nonEmptyString("The Poper popup identifier whose responses to return."),
    }),
    outputSchema: s.object("The responses collected by the Poper popup.", {
      responses: s.array("Responses collected by the selected popup.", popupResponseSchema),
    }),
  }),
];
