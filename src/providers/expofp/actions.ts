import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "expofp";

const positiveId = (description: string): JsonSchema => s.positiveInteger(description);
const metadata = s.object(
  {
    key: s.nonEmptyString("Metadata key visible only through the ExpoFP API."),
    value: s.nonEmptyString("Metadata value visible only through the ExpoFP API."),
  },
  { description: "One ExpoFP metadata key-value pair." },
);
const resource = s.object(
  {
    id: positiveId("Category identifier returned by ExpoFP."),
    name: s.nonEmptyString("Category name returned by ExpoFP."),
  },
  { description: "One ExpoFP category resource." },
);
const expo = s.object(
  {
    id: positiveId("Expo identifier returned by ExpoFP."),
    key: s.nonEmptyString("Unique Expo key returned by ExpoFP."),
    name: s.nonEmptyString("Expo name returned by ExpoFP."),
  },
  { description: "One Expo returned by ExpoFP." },
);
const exhibitorInfo = s.object(
  {
    id: positiveId("Exhibitor identifier returned by ExpoFP."),
    name: s.nonEmptyString("Exhibitor name returned by ExpoFP."),
    booths: s.stringArray("Booth names assigned to the exhibitor."),
    categories: s.stringArray("Category names assigned to the exhibitor."),
    tags: s.stringArray("String tags assigned to the exhibitor."),
    extras: s.stringArray("Extra names assigned to the exhibitor."),
  },
  { description: "Compact exhibitor listing item returned by ExpoFP." },
);
const exhibitorWritableFields = {
  name: s.nonEmptyString("Exhibitor name."),
  description: s.nonEmptyString("Sanitized HTML description with the tags allowed by ExpoFP."),
  featured: s.boolean("Whether the exhibitor is featured."),
  advertised: s.boolean("Whether the exhibitor logo is advertised in the header."),
  country: s.nonEmptyString("Country."),
  address: s.nonEmptyString("Address line 1."),
  address2: s.nonEmptyString("Address line 2."),
  city: s.nonEmptyString("City."),
  state: s.nonEmptyString("State or province."),
  zip: s.nonEmptyString("ZIP or postal code."),
  phone1: s.nonEmptyString("Primary phone number."),
  phone2: s.nonEmptyString("Secondary phone number."),
  publicEmail: s.nonEmptyString("Public email address."),
  privateEmail: s.nonEmptyString("Private email address."),
  vatNumber: s.nonEmptyString("VAT number."),
  website: s.nonEmptyString("Website URL."),
  facebook: s.nonEmptyString("Facebook URL."),
  instagram: s.nonEmptyString("Instagram URL."),
  linkedin: s.nonEmptyString("LinkedIn URL."),
  twitter: s.nonEmptyString("Twitter or X URL."),
  googlePlus: s.nonEmptyString("Google+ URL."),
  xing: s.nonEmptyString("Xing URL."),
  youtube: s.nonEmptyString("YouTube URL."),
  videoUrl: s.nonEmptyString("Video URL."),
  contactName: s.nonEmptyString("Contact person name."),
  contactPhone: s.nonEmptyString("Contact person phone number."),
  adminNotes: s.nonEmptyString("Administrative notes hidden from the public view."),
  externalId: s.nonEmptyString("External identifier used to link the exhibitor upstream."),
  autoLoginUrl: s.nonEmptyString("Auto-login URL for the exhibitor portal."),
  categories: s.array("Categories assigned to the exhibitor.", resource),
  tags: s.stringArray("Tags assigned to the exhibitor."),
  metadata: s.array("Metadata key-value pairs visible only via API.", metadata),
};
const writableFieldNames = Object.keys(exhibitorWritableFields);
const exhibitor = s.object(
  {
    ...exhibitorWritableFields,
    id: positiveId("Exhibitor identifier returned by ExpoFP."),
    booths: s.stringArray("Booth names assigned to the exhibitor."),
    images: s.stringArray("Gallery image identifiers assigned to the exhibitor."),
    logoFileUrl: s.nullableString("Logo image URL."),
    updatedAt: s.nonEmptyString("Last updated timestamp in ISO8601 format."),
  },
  {
    optional: [...writableFieldNames, "logoFileUrl", "updatedAt"],
    description: "Full exhibitor record returned by ExpoFP.",
  },
);

function action(input: {
  name: string;
  operationType: ActionDefinition["operationType"];
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}): ActionDefinition {
  return defineProviderAction(service, {
    ...input,
    requiredScopes: [],
    providerPermissions: [],
  });
}

export const expofpActions: ActionDefinition[] = [
  action({
    name: "list_expos",
    operationType: "read",
    description: "List all expos accessible to the current ExpoFP API token.",
    inputSchema: s.actionInput({}, []),
    outputSchema: s.actionOutput(
      { expos: s.array("Expos returned by ExpoFP.", expo) },
      "The response returned when listing ExpoFP expos.",
    ),
  }),
  action({
    name: "list_exhibitors",
    operationType: "read",
    description: "List all exhibitors in one ExpoFP expo.",
    inputSchema: s.actionInput({ eventId: positiveId("Expo identifier whose exhibitors should be listed.") }, [
      "eventId",
    ]),
    outputSchema: s.actionOutput(
      { exhibitors: s.array("Exhibitors returned by ExpoFP.", exhibitorInfo) },
      "The response returned when listing ExpoFP exhibitors.",
    ),
  }),
  action({
    name: "get_exhibitor",
    operationType: "read",
    description: "Get one ExpoFP exhibitor by exhibitor ID.",
    inputSchema: s.actionInput({ id: positiveId("Exhibitor identifier returned by ExpoFP.") }, ["id"]),
    outputSchema: s.actionOutput({ exhibitor }, "The response returned when fetching one ExpoFP exhibitor."),
  }),
  action({
    name: "get_exhibitor_id",
    operationType: "read",
    description: "Resolve an ExpoFP exhibitor ID from expo ID and exhibitor external ID.",
    inputSchema: s.actionInput(
      {
        eventId: positiveId("Expo identifier that owns the exhibitor."),
        externalId: s.nonEmptyString("External identifier configured on the exhibitor."),
      },
      ["eventId", "externalId"],
    ),
    outputSchema: s.actionOutput(
      { id: positiveId("Exhibitor identifier returned by ExpoFP.") },
      "The response returned when resolving an ExpoFP exhibitor ID.",
    ),
  }),
  action({
    name: "add_exhibitor",
    operationType: "write",
    description: "Create a new exhibitor in one ExpoFP expo.",
    inputSchema: s.actionInput(
      { eventId: positiveId("Expo identifier where the exhibitor should be created."), ...exhibitorWritableFields },
      ["eventId"],
    ),
    outputSchema: s.actionOutput(
      { id: positiveId("Exhibitor identifier created by ExpoFP.") },
      "The response returned when creating an ExpoFP exhibitor.",
    ),
  }),
  action({
    name: "update_exhibitor",
    operationType: "write",
    description: "Partially update an ExpoFP exhibitor by exhibitor ID.",
    inputSchema: s.actionInput(
      { id: positiveId("Exhibitor identifier that should be updated."), ...exhibitorWritableFields },
      ["id"],
    ),
    outputSchema: s.actionOutput(
      { success: s.boolean("Whether ExpoFP accepted the exhibitor update.") },
      "The response returned when updating an ExpoFP exhibitor.",
    ),
  }),
  action({
    name: "delete_exhibitor",
    operationType: "destructive",
    description: "Delete an ExpoFP exhibitor by exhibitor ID.",
    inputSchema: s.actionInput({ id: positiveId("Exhibitor identifier that should be deleted.") }, ["id"]),
    outputSchema: s.actionOutput(
      { success: s.boolean("Whether ExpoFP accepted the exhibitor deletion.") },
      "The response returned when deleting an ExpoFP exhibitor.",
    ),
  }),
];
