export const airtableRecordsReadScope = "data.records:read";
export const airtableRecordsWriteScope = "data.records:write";
export const airtableBaseSchemaReadScope = "schema.bases:read";
export const airtableBaseSchemaWriteScope = "schema.bases:write";
export const airtableWorkspacesAndBasesReadScope = "workspacesAndBases:read";
export const airtableWorkspacesAndBasesManageScope = "workspacesAndBases:manage";

/**
 * Scopes available to regular Airtable OAuth integrations for the provider's
 * record, schema, and collaborator actions. The enterprise-admin-only
 * `workspacesAndBases:manage` scope stays out of the default authorization so
 * non-enterprise users can connect; it is still declared on `delete_base`.
 */
export const airtableOAuthScopes: string[] = [
  airtableRecordsReadScope,
  airtableRecordsWriteScope,
  airtableBaseSchemaReadScope,
  airtableBaseSchemaWriteScope,
  airtableWorkspacesAndBasesReadScope,
];
