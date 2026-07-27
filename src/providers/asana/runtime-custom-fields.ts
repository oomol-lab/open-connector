import type { AsanaActionHandler } from "./runtime.ts";

import {
  compactObject,
  nullableString,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalString,
  requiredString,
  requiredStringArray,
} from "../../core/cast.ts";
import {
  asanaCustomFieldFormats,
  asanaCustomFieldInputRestrictions,
  asanaCustomFieldSubtypes,
  asanaCustomLabelPositions,
  asanaEnumOptionColors,
} from "./custom-field-metadata.ts";
import {
  asanaInvalidInputError,
  asanaPathGid,
  buildAsanaFieldsQuery,
  buildAsanaPaginationQuery,
  deleteAsanaResource,
  getAsanaResource,
  listAsanaResources,
  listAsanaUnpaginatedResources,
  requireNonEmptyAsanaBody,
  writeAsanaResource,
} from "./runtime.ts";

const defaultCustomFieldFields = [
  "name",
  "resource_subtype",
  "description",
  "enum_options",
  "enum_options.name",
  "enum_options.enabled",
  "enum_options.color",
  "precision",
  "format",
  "currency_code",
  "custom_label",
  "custom_label_position",
  "has_notifications_enabled",
  "input_restrictions",
  "is_global_to_workspace",
  "privacy_setting",
  "default_access_level",
];
const defaultEnumOptionFields = ["name", "enabled", "color"];
const defaultCustomFieldSettingFields = [
  "custom_field",
  "custom_field.name",
  "custom_field.resource_subtype",
  "custom_field.description",
  "custom_field.enum_options",
  "custom_field.enum_options.name",
  "custom_field.enum_options.enabled",
  "custom_field.enum_options.color",
  "is_important",
  "parent",
  "parent.name",
  "project",
  "project.name",
];
const customFieldSubtypes = new Set(asanaCustomFieldSubtypes);
const customFieldFormats = new Set(asanaCustomFieldFormats);
const customLabelPositions = new Set(asanaCustomLabelPositions);
const enumColors = new Set(asanaEnumOptionColors);
const referenceInputRestrictions = new Set(asanaCustomFieldInputRestrictions);
const numberOnlyInputFields = ["precision", "format", "currencyCode", "customLabel", "customLabelPosition"];

export const customFieldActionHandlers: Record<string, AsanaActionHandler> = {
  create_custom_field(input, context) {
    return writeAsanaResource("/custom_fields", buildCustomFieldCreateBody(input), "customField", context, {
      method: "POST",
      query: buildAsanaFieldsQuery(input, defaultCustomFieldFields),
    });
  },

  get_custom_field(input, context) {
    return getAsanaResource(
      `/custom_fields/${asanaPathGid(input.customFieldId, "customFieldId")}`,
      buildAsanaFieldsQuery(input, defaultCustomFieldFields),
      "customField",
      context,
    );
  },

  update_custom_field(input, context) {
    return writeAsanaResource(
      `/custom_fields/${asanaPathGid(input.customFieldId, "customFieldId")}`,
      buildCustomFieldMutationBody(input, false),
      "customField",
      context,
      {
        method: "PUT",
        query: buildAsanaFieldsQuery(input, defaultCustomFieldFields),
        notFoundAsInvalidInput: true,
      },
    );
  },

  delete_custom_field(input, context) {
    return deleteAsanaResource(`/custom_fields/${asanaPathGid(input.customFieldId, "customFieldId")}`, context, true);
  },

  list_workspace_custom_fields(input, context) {
    return listAsanaResources(
      `/workspaces/${asanaPathGid(input.workspaceId, "workspaceId")}/custom_fields`,
      buildAsanaPaginationQuery(input, defaultCustomFieldFields),
      "customFields",
      context,
    );
  },

  create_custom_field_enum_option(input, context) {
    return writeAsanaResource(
      `/custom_fields/${asanaPathGid(input.customFieldId, "customFieldId")}/enum_options`,
      buildEnumOptionBody(input, true),
      "enumOption",
      context,
      {
        method: "POST",
        query: buildAsanaFieldsQuery(input, defaultEnumOptionFields),
        notFoundAsInvalidInput: true,
      },
    );
  },

  insert_custom_field_enum_option(input, context) {
    const before = optionalString(input.beforeEnumOptionId);
    const after = optionalString(input.afterEnumOptionId);
    requireExactlyOnePlacementAnchor(before, after, "beforeEnumOptionId", "afterEnumOptionId");
    return writeAsanaResource(
      `/custom_fields/${asanaPathGid(input.customFieldId, "customFieldId")}/enum_options/insert`,
      compactObject({
        enum_option: requiredString(input.enumOptionId, "enumOptionId", asanaInvalidInputError),
        before_enum_option: before,
        after_enum_option: after,
      }),
      "enumOption",
      context,
      {
        method: "POST",
        query: buildAsanaFieldsQuery(input, defaultEnumOptionFields),
        notFoundAsInvalidInput: true,
      },
    );
  },

  update_custom_field_enum_option(input, context) {
    return writeAsanaResource(
      `/enum_options/${asanaPathGid(input.enumOptionId, "enumOptionId")}`,
      buildEnumOptionBody(input, false),
      "enumOption",
      context,
      {
        method: "PUT",
        query: buildAsanaFieldsQuery(input, defaultEnumOptionFields),
        notFoundAsInvalidInput: true,
      },
    );
  },

  list_project_custom_field_settings(input, context) {
    return listAsanaResources(
      `/projects/${asanaPathGid(input.projectId, "projectId")}/custom_field_settings`,
      buildAsanaPaginationQuery(input, defaultCustomFieldSettingFields),
      "customFieldSettings",
      context,
    );
  },

  list_team_custom_field_settings(input, context) {
    return listAsanaUnpaginatedResources(
      `/teams/${asanaPathGid(input.teamId, "teamId")}/custom_field_settings`,
      buildAsanaFieldsQuery(input, defaultCustomFieldSettingFields),
      "customFieldSettings",
      context,
    );
  },
};

function buildCustomFieldCreateBody(input: Record<string, unknown>): Record<string, unknown> {
  const subtype = readStringEnum(input.resourceSubtype, "resourceSubtype", customFieldSubtypes);
  validateCustomFieldCreateSubtype(input, subtype);
  return {
    workspace: requiredString(input.workspaceId, "workspaceId", asanaInvalidInputError),
    resource_subtype: subtype,
    ...buildCustomFieldMutationBody(input, true),
    ...compactObject({
      owned_by_app: optionalBoolean(input.ownedByApp),
    }),
  };
}

function buildCustomFieldMutationBody(input: Record<string, unknown>, create: boolean): Record<string, unknown> {
  if (!create) {
    validateCustomFieldUpdateCompatibility(input);
  }
  validateNumberFormatDependencies(input, create);
  const body = compactObject({
    name: create ? requiredString(input.name, "name", asanaInvalidInputError) : optionalString(input.name),
    description: typeof input.description === "string" ? input.description : undefined,
    enum_options: create && input.enumOptions !== undefined ? readEnumOptions(input.enumOptions) : undefined,
    precision: readOptionalPrecision(input.precision),
    format: readOptionalStringEnum(input.format, "format", customFieldFormats),
    currency_code: nullableString(input.currencyCode),
    custom_label: nullableString(input.customLabel),
    custom_label_position: readOptionalNullableStringEnum(
      input.customLabelPosition,
      "customLabelPosition",
      customLabelPositions,
    ),
    has_notifications_enabled: optionalBoolean(input.hasNotificationsEnabled),
    input_restrictions: readOptionalStringEnumArray(
      input.inputRestrictions,
      "inputRestrictions",
      referenceInputRestrictions,
    ),
  });
  if (!create) {
    requireNonEmptyAsanaBody(body, "At least one custom field property must be provided.");
  }
  return body;
}

function validateCustomFieldUpdateCompatibility(input: Record<string, unknown>): void {
  if (Object.hasOwn(input, "inputRestrictions") && numberOnlyInputFields.some((field) => Object.hasOwn(input, field))) {
    throw asanaInvalidInputError("inputRestrictions cannot be combined with number custom field properties.");
  }
  if (
    !Object.hasOwn(input, "format") &&
    input.currencyCode != null &&
    (input.customLabel != null || input.customLabelPosition != null)
  ) {
    throw asanaInvalidInputError(
      "currencyCode cannot be combined with customLabel or customLabelPosition without an explicit format.",
    );
  }
}

function validateCustomFieldCreateSubtype(input: Record<string, unknown>, subtype: string): void {
  const hasEnumOptions = Object.hasOwn(input, "enumOptions");
  if ((subtype === "enum" || subtype === "multi_enum") && !hasEnumOptions) {
    throw asanaInvalidInputError("enumOptions is required for enum and multi_enum custom fields.");
  }
  if (subtype !== "enum" && subtype !== "multi_enum" && hasEnumOptions) {
    throw asanaInvalidInputError("enumOptions is only supported for enum and multi_enum custom fields.");
  }
  if (subtype !== "number" && numberOnlyInputFields.some((field) => Object.hasOwn(input, field))) {
    throw asanaInvalidInputError("Number formatting fields are only supported for number custom fields.");
  }
  if (subtype !== "reference" && Object.hasOwn(input, "inputRestrictions")) {
    throw asanaInvalidInputError("inputRestrictions is only supported for reference custom fields.");
  }
}

function validateNumberFormatDependencies(input: Record<string, unknown>, requireExplicitFormat: boolean): void {
  const format = optionalString(input.format);
  const hasExplicitFormat = Object.hasOwn(input, "format");
  if (input.currencyCode != null && (requireExplicitFormat || hasExplicitFormat) && format !== "currency") {
    throw asanaInvalidInputError("currencyCode requires format to be currency.");
  }
  if (
    (input.customLabel != null || input.customLabelPosition != null) &&
    (requireExplicitFormat || hasExplicitFormat) &&
    format !== "custom"
  ) {
    throw asanaInvalidInputError("customLabel and customLabelPosition require format to be custom.");
  }
}

function readEnumOptions(value: unknown): Array<Record<string, unknown>> {
  const options = objectArray(value, "enumOptions", asanaInvalidInputError);
  if (options.length < 1 || options.length > 500) {
    throw asanaInvalidInputError("enumOptions must contain from 1 through 500 options.");
  }
  return options.map((option) => {
    const body = buildEnumOptionFields(option, false);
    if (!body.name) {
      throw asanaInvalidInputError("enumOptions.name is required.");
    }
    return body;
  });
}

function buildEnumOptionBody(input: Record<string, unknown>, create: boolean): Record<string, unknown> {
  const before = create ? optionalString(input.insertBeforeId) : undefined;
  const after = create ? optionalString(input.insertAfterId) : undefined;
  if (before && after) {
    throw asanaInvalidInputError("insertBeforeId and insertAfterId cannot both be provided.");
  }
  const fields = buildEnumOptionFields(input, !create);
  const body = {
    ...fields,
    ...compactObject({
      insert_before: before,
      insert_after: after,
    }),
  };
  if (create && !fields.name) {
    throw asanaInvalidInputError("name is required.");
  }
  if (!create) {
    requireNonEmptyAsanaBody(body, "At least one enum option property must be provided.");
  }
  return body;
}

function buildEnumOptionFields(input: Record<string, unknown>, allowDisabled: boolean): Record<string, unknown> {
  return compactObject({
    name: optionalString(input.name),
    enabled: readOptionalEnumOptionEnabled(input.enabled, allowDisabled),
    color: readOptionalStringEnum(input.color, "color", enumColors),
  });
}

function readOptionalEnumOptionEnabled(value: unknown, allowDisabled: boolean): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  const enabled = optionalBoolean(value);
  if (enabled === undefined) {
    throw asanaInvalidInputError("enabled must be a boolean.");
  }
  if (!allowDisabled && !enabled) {
    throw asanaInvalidInputError("New enum options must be enabled.");
  }
  return enabled;
}

function readOptionalPrecision(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const precision = optionalInteger(value);
  if (precision === undefined || precision < 0 || precision > 6) {
    throw asanaInvalidInputError("precision must be an integer from 0 through 6.");
  }
  return precision;
}

function readStringEnum(value: unknown, fieldName: string, allowed: Set<string>): string {
  const result = requiredString(value, fieldName, asanaInvalidInputError);
  if (!allowed.has(result)) {
    throw asanaInvalidInputError(`${fieldName} has an unsupported value.`);
  }
  return result;
}

function readOptionalStringEnum(value: unknown, fieldName: string, allowed: Set<string>): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return readStringEnum(value, fieldName, allowed);
}

function readOptionalNullableStringEnum(
  value: unknown,
  fieldName: string,
  allowed: Set<string>,
): string | null | undefined {
  if (value === null) {
    return null;
  }
  return readOptionalStringEnum(value, fieldName, allowed);
}

function readOptionalStringEnumArray(value: unknown, fieldName: string, allowed: Set<string>): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const values = requiredStringArray(value, fieldName, asanaInvalidInputError);
  if (values.length === 0 || values.some((item) => !allowed.has(item))) {
    throw asanaInvalidInputError(`${fieldName} must contain supported resource types.`);
  }
  return values;
}

function requireExactlyOnePlacementAnchor(
  before: string | undefined,
  after: string | undefined,
  beforeField: string,
  afterField: string,
): void {
  if (!!before === !!after) {
    throw asanaInvalidInputError(`Exactly one of ${beforeField} or ${afterField} must be provided.`);
  }
}
