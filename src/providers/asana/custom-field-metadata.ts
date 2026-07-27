/** Custom field subtypes accepted by Asana's custom field definition endpoints. */
export const asanaCustomFieldSubtypes: readonly string[] = [
  "text",
  "enum",
  "multi_enum",
  "number",
  "date",
  "people",
  "reference",
];

/** Number display formats accepted by Asana custom fields. */
export const asanaCustomFieldFormats: readonly string[] = [
  "currency",
  "identifier",
  "percentage",
  "custom",
  "duration",
  "none",
];

/** Placement choices for an Asana custom number label. */
export const asanaCustomLabelPositions: readonly string[] = ["prefix", "suffix"];

/** Resource types accepted by an Asana reference custom field. */
export const asanaCustomFieldInputRestrictions: readonly string[] = ["task", "project", "portfolio", "goal"];

/** Official colors accepted by Asana enum options. */
export const asanaEnumOptionColors: readonly string[] = [
  "none",
  "red",
  "orange",
  "yellow-orange",
  "yellow",
  "yellow-green",
  "green",
  "blue-green",
  "aqua",
  "blue",
  "indigo",
  "purple",
  "magenta",
  "hot-pink",
  "pink",
  "cool-gray",
];
