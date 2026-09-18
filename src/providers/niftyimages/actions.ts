import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "niftyimages";

const isoDateInputSchema = (description: string): JsonSchema => ({
  type: "string",
  anyOf: [s.date("An ISO 8601 calendar date."), s.dateTime("An ISO 8601 date-time with a timezone.")],
  description,
});

const dateRangeProperties = {
  startDate: isoDateInputSchema(
    "The inclusive start of the statistics range as an ISO 8601 date or date-time. NiftyImages defaults to 30 days ago.",
  ),
  endDate: isoDateInputSchema(
    "The inclusive end of the statistics range as an ISO 8601 date or date-time. NiftyImages defaults to today.",
  ),
};

const imageOpensSchema = s.anyOf(
  "The number of opens reported by NiftyImages, which the API may return as an integer or numeric string.",
  [
    s.nonNegativeInteger("The image open count returned as an integer."),
    s.string("The image open count returned as a numeric string."),
  ],
);

const imageSchema = s.looseRequiredObject(
  "A NiftyImages image record. Documented fields are explicit while additional upstream fields are preserved.",
  {
    Name: s.string("The image name."),
    Url: s.url("The public NiftyImages image URL."),
    Opens: imageOpensSchema,
    ImageType: s.string("The image type, such as Personalized Image, Countdown Timer, Personalized, or Timer."),
    CreateDate: s.string("The ISO 8601 date-time when the image was created."),
    LastUpdated: s.string("The ISO 8601 date-time when the image was last updated."),
    Active: s.boolean("Whether the image has not been deleted."),
  },
  { optional: ["Active"] },
);

const widgetProperties = {
  Name: s.string("The widget name."),
  WidgetKey: s.string("The widget key used in later widget API calls."),
};
const widgetSchema = s.object(
  "A NiftyImages widget record. Documented fields are explicit while additional upstream fields are preserved.",
  widgetProperties,
  { required: Object.keys(widgetProperties), additionalProperties: true },
);

const widgetStatsProperties = {
  Active: s.boolean("Whether the widget has not been deleted."),
  Images: s.nonNegativeInteger("The number of images created in the selected date range."),
  Impressions: s.nonNegativeInteger("The number of widget impressions in the selected date range."),
  Name: s.string("The widget name."),
  Users: s.nonNegativeInteger("The number of users created in the selected date range."),
  WidgetKey: s.string("The widget key used in later widget API calls."),
};
const widgetStatsSchema = s.object("Aggregated NiftyImages statistics for one widget.", widgetStatsProperties, {
  required: Object.keys(widgetStatsProperties),
  additionalProperties: true,
});

const widgetUserProperties = {
  Images: s.nonNegativeInteger("The number of images created by the widget user."),
  Impressions: s.nonNegativeInteger("The number of impressions for the widget user."),
  User: s.string("The widget user name or identifier."),
  Suspended: s.boolean("Whether the widget user is suspended."),
};
const widgetUserSchema = s.object("NiftyImages statistics for one widget user.", widgetUserProperties, {
  required: Object.keys(widgetUserProperties),
  additionalProperties: true,
});

const widgetImageProperties = {
  ImageID: s.integer("The NiftyImages identifier for the widget image."),
  ImageType: s.string("The widget image type."),
  Impressions: s.nonNegativeInteger("The number of impressions for the widget image."),
  Name: s.string("The widget image name."),
  User: s.string("The widget user name or identifier."),
  Suspended: s.boolean("Whether the widget user is suspended."),
  Uri: s.url("The public URI of the widget image."),
};
const widgetImageSchema = s.object("A NiftyImages image created for a widget user.", widgetImageProperties, {
  required: Object.keys(widgetImageProperties),
  additionalProperties: true,
});

const dateRangeInputSchema = (description: string) =>
  s.object(description, dateRangeProperties, {
    optional: ["startDate", "endDate"],
  });

const widgetDateRangeInputSchema = (description: string) =>
  s.object(
    description,
    {
      widgetKey: s.nonEmptyString("The key of the NiftyImages widget."),
      ...dateRangeProperties,
    },
    { optional: ["startDate", "endDate"] },
  );

const widgetUserDateRangeInputSchema = (description: string) =>
  s.object(
    description,
    {
      widgetKey: s.nonEmptyString("The key of the NiftyImages widget."),
      user: s.nonEmptyString("The widget user name or identifier. The connector URL-encodes this path value."),
      ...dateRangeProperties,
    },
    { optional: ["startDate", "endDate"] },
  );

const listImagesAction = defineProviderAction(service, {
  name: "list_images",
  operationType: "read",
  description: "Page through images in the connected NiftyImages account.",
  inputSchema: s.object(
    "Pagination parameters for listing NiftyImages images.",
    {
      pageSize: s.integer("The number of image records to return. NiftyImages defaults to 10."),
      pageNumber: s.integer("The image page number. NiftyImages defaults to 1."),
    },
    { optional: ["pageSize", "pageNumber"] },
  ),
  outputSchema: s.array("The NiftyImages images on the requested page.", imageSchema),
});

const getImageAction = defineProviderAction(service, {
  name: "get_image",
  operationType: "read",
  description: "Get details for a NiftyImages personalized image or countdown timer by its URL.",
  inputSchema: s.requiredObject("The NiftyImages image URL to inspect.", {
    url: s.url("The NiftyImages image URL to look up."),
  }),
  outputSchema: imageSchema,
});

const getImageStatsAction = defineProviderAction(service, {
  name: "get_image_stats",
  operationType: "read",
  description: "Get aggregated NiftyImages image statistics for an optional ISO 8601 date range.",
  inputSchema: dateRangeInputSchema("The optional date range for aggregated NiftyImages image statistics."),
  outputSchema: s.array("The aggregated NiftyImages image statistics.", imageSchema),
});

const listWidgetsAction = defineProviderAction(service, {
  name: "list_widgets",
  operationType: "read",
  description: "List active widgets in the connected NiftyImages account.",
  inputSchema: s.object("The input payload for listing active NiftyImages widgets.", {}),
  outputSchema: s.array("The active NiftyImages widgets.", widgetSchema),
});

const getWidgetStatsAction = defineProviderAction(service, {
  name: "get_widget_stats",
  operationType: "read",
  description: "Get aggregated NiftyImages user, image, and impression statistics grouped by widget.",
  inputSchema: dateRangeInputSchema("The optional date range for aggregated NiftyImages widget statistics."),
  outputSchema: s.array("The aggregated statistics grouped by NiftyImages widget.", widgetStatsSchema),
});

const listWidgetImagesAction = defineProviderAction(service, {
  name: "list_widget_images",
  operationType: "read",
  description: "List images created or viewed through a NiftyImages widget during an optional date range.",
  inputSchema: widgetDateRangeInputSchema("The widget and optional date range used to list NiftyImages widget images."),
  outputSchema: s.array("The images associated with the NiftyImages widget.", widgetImageSchema),
});

const listWidgetUsersAction = defineProviderAction(service, {
  name: "list_widget_users",
  operationType: "read",
  description: "List users who created images or accumulated impressions through a NiftyImages widget.",
  inputSchema: widgetDateRangeInputSchema("The widget and optional date range used to list NiftyImages widget users."),
  outputSchema: s.array("The users associated with the NiftyImages widget.", widgetUserSchema),
});

const getWidgetUserStatsAction = defineProviderAction(service, {
  name: "get_widget_user_stats",
  operationType: "read",
  description: "Get image and impression statistics for one NiftyImages widget user during an optional date range.",
  inputSchema: widgetUserDateRangeInputSchema(
    "The widget user and optional date range used to retrieve NiftyImages statistics.",
  ),
  outputSchema: widgetUserSchema,
});

const listWidgetUserImagesAction = defineProviderAction(service, {
  name: "list_widget_user_images",
  operationType: "read",
  description: "List images created or viewed by one NiftyImages widget user during an optional date range.",
  inputSchema: widgetUserDateRangeInputSchema(
    "The widget user and optional date range used to list NiftyImages images.",
  ),
  outputSchema: s.array("The images associated with the selected NiftyImages widget user.", widgetImageSchema),
});

export const niftyimagesActions: ActionDefinition[] = [
  listImagesAction,
  getImageAction,
  getImageStatsAction,
  listWidgetsAction,
  getWidgetStatsAction,
  listWidgetImagesAction,
  listWidgetUsersAction,
  getWidgetUserStatsAction,
  listWidgetUserImagesAction,
];
