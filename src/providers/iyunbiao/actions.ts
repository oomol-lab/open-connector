import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const templateName = s.nonEmptyString("The template name returned by list_templates.");
const objectId = s.integer("The existing form ID returned by query_forms.", { minimum: 1 });
const form = s.looseRequiredObject(
  "The complete form with business fields and detail rows. Omit objectId to create; to update, first get_form and preserve objectId and objectVersion.",
  {
    objectId: s.integer("The existing form ID; omit or use zero to create."),
    objectVersion: s.integer("The current version returned by get_form; preserve it when updating."),
  },
  { optional: ["objectId", "objectVersion"] },
);
const pageInfo = s.looseRequiredObject("Pagination information returned by Yunbiao.", {});
const query = s.object(
  "Optional pagination, parameters, filters and sorting for the query.",
  {
    pageInfo: s.object(
      "Pagination by page index or row offset.",
      {
        isUseRowIndex: s.boolean("Whether to paginate by rowIndex instead of pageIndex."),
        pageIndex: s.integer("Zero-based page index.", { minimum: 0 }),
        pageSize: s.integer("Number of records to return per page.", { minimum: 1 }),
        rowIndex: s.integer("Zero-based row offset when isUseRowIndex is true.", { minimum: 0 }),
      },
      { optional: ["isUseRowIndex", "pageIndex", "pageSize", "rowIndex"] },
    ),
    paramList: s.array(
      "Parameters defined by the data interface.",
      s.object("A named interface parameter.", {
        param: s.nonEmptyString("The parameter name."),
        value: s.unknown("The parameter value accepted by the interface."),
      }),
    ),
    filter: s.array(
      "Field filters; expressions within a field support AND or OR.",
      s.object("A filter on one field.", {
        filterField: s.nonEmptyString("The field name accepted by this template or interface."),
        expressionList: s.array(
          "Comparisons for this field.",
          s.object(
            "A comparison expression.",
            {
              operator: s.anyOf(
                "Comparison: $e, $ne, $gt, $gte, $lt, $lte, or numeric operators 10 (like), 11 (not like), 12 (in), 13 (null), 14 (not null), 15 (not in).",
                [
                  s.stringEnum("An equality or ordering operator.", ["$e", "$ne", "$gt", "$gte", "$lt", "$lte"]),
                  {
                    ...s.integer("A numeric comparison operator."),
                    enum: [10, 11, 12, 13, 14, 15],
                  },
                ],
              ),
              isAnd: s.boolean("Whether to combine with AND rather than OR."),
              value: s.unknown("The comparison value; may be omitted for null checks."),
            },
            { optional: ["isAnd", "value"] },
          ),
          { minItems: 1 },
        ),
      }),
    ),
    sortList: s.array(
      "Sort order using internal field names from get_template_structure.",
      s.object("One sort field.", {
        field: s.nonEmptyString("The internal field name, for example f1."),
        isDesc: s.boolean("Whether to sort in descending order."),
      }),
    ),
  },
  { optional: ["pageInfo", "paramList", "filter", "sortList"] },
);
const queryOutput = s.looseRequiredObject(
  "The query results and upstream pagination metadata.",
  {
    results: s.array("Matching records with template-defined fields.", s.looseRequiredObject("A matching record.", {})),
    pageInfo,
  },
  { optional: ["pageInfo"] },
);
const formOutput = s.object("The returned form, including its current version and detail rows.", {
  form,
});

const userRecord = s.looseRequiredObject(
  "The complete Yunbiao user record, including roles, posts and account settings.",
  {
    objectId: s.integer("The user object ID. Omit or set both IDs to zero when creating.", { minimum: 0 }),
    formId: s.integer("The user ID returned by get_user or save_user.", { minimum: 0 }),
    account: s.string("The user account name."),
    name: s.string("The user display name."),
    password: s.string("The MD5-encoded password. Omit to preserve the current password.", {
      minLength: 32,
      maxLength: 32,
    }),
  },
  { optional: ["objectId", "formId", "account", "name", "password"] },
);
const roleRecord = s.looseRequiredObject(
  "The complete Yunbiao role record.",
  {
    objectId: s.integer("The role object ID. Omit or use zero to create.", { minimum: 0 }),
    name: s.string("The role name."),
    m_description: s.string("The role description."),
    isSys: s.boolean("Whether this is a system role."),
  },
  { optional: ["objectId", "name", "m_description", "isSys"] },
);
const userOutput = s.object("The user returned by Yunbiao.", { user: userRecord });
const roleOutput = s.object("The role returned by Yunbiao.", { role: roleRecord });
const cloudFileId = s.anyOf("The cloud drive file ID, not a form or detail row ID.", [
  s.nonEmptyString("The cloud drive file ID as a string."),
  s.integer("The cloud drive file ID as a number.", { minimum: 1 }),
]);

export const iyunbiaoActions = [
  defineProviderAction("iyunbiao", {
    name: "list_templates",
    operationType: "read",
    description: "List available Yunbiao templates. Requires Yunbiao server 3.3.45.43 or later.",
    inputSchema: s.object("No input is required.", {}),
    outputSchema: s.looseRequiredObject(
      "The available templates.",
      {
        templates: s.array(
          "Templates available in this application space.",
          s.looseRequiredObject(
            "Template metadata.",
            {
              name: s.string("The template name used in other actions."),
              caption: s.string("The display caption."),
            },
            { optional: ["caption"] },
          ),
        ),
        totalCount: s.integer("The total number of templates."),
      },
      { optional: ["totalCount"] },
    ),
  }),
  defineProviderAction("iyunbiao", {
    name: "get_template_structure",
    operationType: "read",
    description: "Get Yunbiao template fields and detail table definitions. Requires server 3.3.45.43 or later.",
    inputSchema: s.object("The template to inspect.", { templateName }),
    outputSchema: s.looseRequiredObject(
      "The complete template structure.",
      {
        templateName: s.string("The template name."),
        fieldMapList: s.array(
          "Main-table field definitions.",
          s.looseRequiredObject("A field definition including its internal name and caption.", {}),
        ),
        childTableList: s.array(
          "Detail table definitions and their fields.",
          s.looseRequiredObject("A detail table definition.", {}),
        ),
      },
      { optional: ["templateName", "fieldMapList", "childTableList"] },
    ),
  }),
  defineProviderAction("iyunbiao", {
    name: "query_forms",
    operationType: "read",
    description:
      "Find Yunbiao forms with filters, sorting and pagination. Use get_form to retrieve full detail rows before editing.",
    inputSchema: s.object("The template and optional query.", { templateName, query }, { optional: ["query"] }),
    outputSchema: queryOutput,
  }),
  defineProviderAction("iyunbiao", {
    name: "get_form",
    operationType: "read",
    description: "Read a Yunbiao form with its current version, detail rows and attachment references.",
    inputSchema: s.object("The form to read.", { templateName, objectId }),
    outputSchema: formOutput,
  }),
  defineProviderAction("iyunbiao", {
    name: "save_form",
    operationType: "destructive",
    description:
      "Create or update a Yunbiao form. Before updating, read the complete form and preserve its objectId and current objectVersion.",
    inputSchema: s.object("The template and complete form to save.", { templateName, form }),
    outputSchema: formOutput,
  }),
  defineProviderAction("iyunbiao", {
    name: "batch_save_forms",
    operationType: "destructive",
    description:
      "Create or update multiple Yunbiao forms. Inspect errorFormList for individual failures even when the request succeeds.",
    inputSchema: s.object("The forms to save in one template.", {
      templateName,
      forms: s.array("Complete forms to create or update.", form, { minItems: 1 }),
    }),
    outputSchema: s.looseRequiredObject("Batch results, including any individual failures.", {
      formJsonList: s.array("Successfully saved forms with updated versions.", form),
      errorFormList: s.array(
        "Per-form failures returned by Yunbiao.",
        s.looseRequiredObject("An upstream failure record.", {}),
      ),
    }),
  }),
  defineProviderAction("iyunbiao", {
    name: "query_detail_rows",
    operationType: "read",
    description: "Query rows in a Yunbiao detail table across forms. Requires server 3.3.45.43 or later.",
    inputSchema: s.object(
      "The detail table and query.",
      { templateName, detailTableName: s.nonEmptyString("The detail table name."), query },
      { optional: ["query"] },
    ),
    outputSchema: queryOutput,
  }),
  defineProviderAction("iyunbiao", {
    name: "query_template_interface",
    operationType: "destructive",
    description:
      "Call a data interface configured on a Yunbiao template. Its configured business logic may modify data.",
    inputSchema: s.object(
      "The configured template interface to call.",
      {
        templateName,
        interfaceName: s.nonEmptyString("The configured data interface name."),
        query,
      },
      { optional: ["query"] },
    ),
    outputSchema: s.object("The upstream data interface result.", {
      result: s.unknown("The complete result defined by the configured interface."),
    }),
  }),
  defineProviderAction("iyunbiao", {
    name: "query_global_interface",
    operationType: "destructive",
    description: "Call a global Yunbiao data interface. Its configured business logic may modify data.",
    inputSchema: s.object(
      "The global interface to call.",
      { interfaceName: s.nonEmptyString("The configured global data interface name."), query },
      { optional: ["query"] },
    ),
    outputSchema: s.object("The upstream data interface result.", {
      result: s.unknown("The complete result defined by the configured interface."),
    }),
  }),
  defineProviderAction("iyunbiao", {
    name: "upload_attachment",
    operationType: "write",
    description:
      "Upload a file from a URL to Yunbiao, returning an attachment entry to include in save_form. Upload alone does not attach it to a form. Connector upload limit: 64 MiB.",
    inputSchema: s.object("The file and destination template.", {
      templateName,
      file: s.transitFile("A file uploaded to the local transit file API."),
      fileName: s.nonEmptyString("The file name including its extension."),
      fileType: s.nonEmptyString("The attachment type, for example pdf or txt."),
    }),
    outputSchema: s.object("The uploaded file and an entry ready for the form attachment table.", {
      fileId: s.integer("The uploaded attachment ID, not a form record ID."),
      attachment: s.looseRequiredObject(
        "Insert this entry into the form attachment table, usually named 附件, then call save_form.",
        {},
      ),
    }),
  }),
  defineProviderAction("iyunbiao", {
    name: "download_attachment",
    operationType: "read",
    description:
      "Download a Yunbiao attachment to a usable file transit URL. Use the attachment file ID from get_form.",
    inputSchema: s.object("The attachment to download.", {
      templateName,
      fileId: s.integer("The attachment file ID, not the form or detail row ID.", { minimum: 1 }),
      fileName: s.nonEmptyString("The attachment file name including its extension."),
    }),
    outputSchema: s.object("The downloaded file.", {
      file: s.object({
        fileId: s.nonEmptyString("The transit file identifier."),
        downloadUrl: s.url("The transit file download URL."),
        sizeBytes: s.nonNegativeInteger("The file size in bytes."),
        name: s.nonEmptyString("The file name."),
        mimeType: s.nonEmptyString("The MIME type."),
      }),
      fileName: s.string("The file name."),
      mimeType: s.string("The file media type."),
    }),
  }),
  defineProviderAction("iyunbiao", {
    name: "list_users",
    operationType: "read",
    description: "List Yunbiao users, optionally with filtering, sorting and pagination.",
    inputSchema: s.object("Optional user query.", { query }, { optional: ["query"] }),
    outputSchema: queryOutput,
  }),
  defineProviderAction("iyunbiao", {
    name: "get_user",
    operationType: "read",
    description: "Read a complete Yunbiao user record, including roles and posts.",
    inputSchema: s.object("The user to read.", {
      objectId: s.integer("The user object ID returned by list_users.", { minimum: 1 }),
    }),
    outputSchema: userOutput,
  }),
  defineProviderAction("iyunbiao", {
    name: "save_user",
    operationType: "destructive",
    description:
      "Create or update a Yunbiao user. Read get_user before updating and preserve its fields. Passwords in the user record must already be MD5-encoded.",
    inputSchema: s.object("The complete user record to save.", { user: userRecord }),
    outputSchema: userOutput,
  }),
  defineProviderAction("iyunbiao", {
    name: "list_roles",
    operationType: "read",
    description: "List Yunbiao roles, optionally with filtering, sorting and pagination.",
    inputSchema: s.object("Optional role query.", { query }, { optional: ["query"] }),
    outputSchema: queryOutput,
  }),
  defineProviderAction("iyunbiao", {
    name: "get_role",
    operationType: "read",
    description: "Read a complete Yunbiao role record.",
    inputSchema: s.object("The role to read.", {
      objectId: s.integer("The role object ID returned by list_roles.", { minimum: 1 }),
    }),
    outputSchema: roleOutput,
  }),
  defineProviderAction("iyunbiao", {
    name: "save_role",
    operationType: "destructive",
    description: "Create or update a Yunbiao role. Read get_role before updating and preserve its fields.",
    inputSchema: s.object("The complete role record to save.", { role: roleRecord }),
    outputSchema: roleOutput,
  }),
  defineProviderAction("iyunbiao", {
    name: "upload_cloud_file",
    operationType: "write",
    description:
      "Upload a file from a URL to the Yunbiao enterprise cloud drive. Upload alone does not associate it with a form. Connector upload limit: 64 MiB.",
    inputSchema: s.object(
      "The source file and cloud drive destination.",
      {
        templateName,
        file: s.transitFile("A file uploaded to the local transit file API."),
        fileName: s.nonEmptyString("The file name including its extension."),
        fileType: s.nonEmptyString("The attachment type, for example pdf or txt."),
        fileFolderPath: s.string("The enterprise cloud drive folder path. Omit to use the server default."),
      },
      { optional: ["fileFolderPath"] },
    ),
    outputSchema: s.object("The uploaded cloud drive file.", {
      fileId: s.string("The uploaded cloud drive file ID."),
      file: s.looseRequiredObject(
        "The complete cloud drive file metadata, including owner, fileId and any fields returned by Yunbiao.",
        {},
      ),
    }),
  }),
  defineProviderAction("iyunbiao", {
    name: "download_cloud_file",
    operationType: "read",
    description: "Download a Yunbiao enterprise cloud drive file to a usable file transit URL.",
    inputSchema: s.object("The cloud drive file to download.", {
      templateName,
      fileId: cloudFileId,
      fileName: s.nonEmptyString("The file name including its extension."),
    }),
    outputSchema: s.object("The downloaded file.", {
      file: s.object({
        fileId: s.nonEmptyString("The transit file identifier."),
        downloadUrl: s.url("The transit file download URL."),
        sizeBytes: s.nonNegativeInteger("The file size in bytes."),
        name: s.nonEmptyString("The file name."),
        mimeType: s.nonEmptyString("The MIME type."),
      }),
      fileName: s.string("The file name."),
      mimeType: s.string("The file media type."),
    }),
  }),
] as ProviderActionDefinition[];
