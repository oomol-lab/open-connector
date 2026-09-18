import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const roleId = s.nonEmptyString("The application role ID.");
const optionsetId = s.nonEmptyString("The option set ID.");
const identifiers = (description: string) => s.stringArray(description, { itemDescription: "A Mingdao identifier." });
const memberFields = {
  userIds: identifiers("The user IDs."),
  departmentIds: identifiers("The department IDs."),
  departmentTreeIds: identifiers("The department tree IDs, including their child departments."),
  jobIds: identifiers("The job IDs."),
};
const mutationOutput = s.object("The management operation response.", {
  data: s.looseObject("The upstream operation result, including any partial-success details."),
});
const globalPermissions = s.object(
  "Global application permissions; effective when permissionScope is greater than zero.",
  {
    addRecord: s.boolean("Whether members may add records."),
    share: s.boolean("Whether members may publicly share views and records."),
    import: s.boolean("Whether members may import data."),
    export: s.boolean("Whether members may export data."),
    discuss: s.boolean("Whether members may discuss."),
    systemPrint: s.boolean("Whether members may use system printing."),
    attachmentDownload: s.boolean("Whether members may download attachments."),
    log: s.boolean("Whether members may view logs."),
  },
);
const recordDataScope = s.object("The record data permission scopes.", {
  read: s.integer("Read scope: 0 none, 20 owned by me, 30 owned by me or subordinates, 100 all."),
  edit: s.integer("Edit scope: 0 none, 20 owned by me, 30 owned by me or subordinates, 100 all."),
  delete: s.integer("Delete scope: 0 none, 20 owned by me, 30 owned by me or subordinates, 100 all."),
});
const worksheetPermissions = s.array(
  "Worksheet permission details; effective when permissionScope is zero.",
  s.object(
    "Permissions for a worksheet.",
    {
      id: s.string("The worksheet ID."),
      recordDataScope,
      worksheetActions: s.object("The worksheet action permissions.", {
        shareView: s.boolean("Whether members may publicly share views."),
        import: s.boolean("Whether members may import worksheet data."),
        export: s.boolean("Whether members may export worksheet data."),
        discuss: s.boolean("Whether members may discuss the worksheet."),
        batchOperation: s.boolean("Whether members may perform batch operations."),
      }),
      paymentActions: s.object("The payment permissions.", {
        pay: s.boolean("Whether members may make payments in the worksheet."),
      }),
      recordActions: s.object("The record action permissions.", {
        add: s.boolean("Whether members may add records."),
        share: s.boolean("Whether members may publicly share records."),
        discuss: s.boolean("Whether members may discuss records."),
        systemPrint: s.boolean("Whether members may use system printing."),
        attachmentDownload: s.boolean("Whether members may download attachments."),
        log: s.boolean("Whether members may view record logs."),
      }),
      recordPermissionInViews: s.array(
        "The record permissions within each view.",
        s.object("Record permissions for a view.", {
          viewId: s.string("The view ID."),
          read: s.boolean("Whether members may read records in the view."),
          edit: s.boolean("Whether members may edit records in the view."),
          delete: s.boolean("Whether members may delete records in the view."),
        }),
      ),
      fieldPermissions: s.array(
        "The field permissions.",
        s.object(
          "Permissions for a field.",
          {
            id: s.string("The field ID."),
            add: s.boolean("Whether members may set the field when adding records."),
            read: s.boolean("Whether members may read the field."),
            edit: s.boolean("Whether members may edit the field."),
            decrypt: s.boolean("Whether members may decrypt the field."),
          },
          { optional: ["decrypt"] },
        ),
      ),
    },
    { optional: ["id"] },
  ),
);
const optionFields = {
  value: s.string("The option value; values must not be duplicated."),
  index: s.integer("The integer sort order; smaller values come first."),
  color: s.string("The option color, effective when enableColor is true."),
  score: s.number("The option score, effective when enableScore is true; decimals and negative values are supported."),
};
const optionSetFlags = {
  enableColor: s.boolean("Whether to enable option colors."),
  enableScore: s.boolean("Whether to enable option scores."),
};

export const mingdaoManagementActions: readonly ProviderActionDefinition[] = [
  defineProviderAction("mingdao", {
    name: "create_role",
    operationType: "write",
    requiredScopes: [],
    description: "Create an application role with global or per-worksheet, view, field and page permissions.",
    inputSchema: s.object(
      "The application role creation request.",
      {
        name: s.string("The role name."),
        description: s.string("The role description."),
        hideAppForMembers: s.union(
          [
            s.boolean("Whether the application is hidden."),
            s.stringEnum("The string representation of the hide flag.", ["true", "false"]),
          ],
          {
            description:
              "Whether to hide the application from members. The official contract supports boolean values or their string form.",
          },
        ),
        type: s.union([s.integer("The numeric role type."), s.string("The string role type.")], {
          description: "The role type: 0 for a custom role, accepted as an integer or string in the official contract.",
        }),
        permissionScope: s.union(
          [s.integer("The numeric permission scope."), s.string("The string permission scope.")],
          {
            description:
              "Record scope: 80 view/edit/delete all; 60 view all and edit/delete own; 30 view joined and edit/delete own; 20 view all only; 0 distribute permitted application items. The official contract accepts an integer or string.",
          },
        ),
        globalPermissions,
        worksheetPermissions,
        pagePermissions: s.array(
          "Custom-page permission details; effective when permissionScope is zero.",
          s.object("Permissions for a custom page.", {
            id: s.string("The custom page ID."),
            enable: s.boolean("Whether members may view the custom page."),
          }),
        ),
      },
      {
        optional: ["hideAppForMembers", "globalPermissions", "worksheetPermissions", "pagePermissions"],
      },
    ),
    outputSchema: s.object("The created role response.", {
      data: s.looseObject("The created application role.", {
        id: s.string("The role ID."),
        name: s.string("The role name."),
        roleType: s.integer("The role type."),
        desc: s.string("The role description."),
        users: identifiers("The role user identifiers."),
        departments: identifiers("The role department identifiers."),
        departmentTrees: identifiers("The role department tree identifiers."),
        projectOrganizes: identifiers("The organization role identifiers."),
        jobs: identifiers("The role job identifiers."),
      }),
    }),
  }),
  defineProviderAction("mingdao", {
    name: "delete_role",
    operationType: "destructive",
    requiredScopes: [],
    description: "Delete an application role and revoke the access it grants.",
    inputSchema: s.object("The role deletion request.", { roleId }),
    outputSchema: mutationOutput,
  }),
  defineProviderAction("mingdao", {
    name: "add_role_members",
    operationType: "write",
    requiredScopes: [],
    description: "Add users, departments, department trees, jobs or organization roles to an application role.",
    inputSchema: s.object(
      "The role membership addition request.",
      {
        roleId,
        ...memberFields,
        projectOrganizeIds: identifiers("The organization role IDs to add."),
      },
      {
        optional: ["userIds", "departmentIds", "departmentTreeIds", "jobIds", "projectOrganizeIds"],
      },
    ),
    outputSchema: mutationOutput,
  }),
  defineProviderAction("mingdao", {
    name: "remove_role_members",
    operationType: "destructive",
    requiredScopes: [],
    description: "Remove users, departments, department trees, jobs or organization roles from an application role.",
    inputSchema: s.object(
      "The role membership removal request.",
      { roleId, ...memberFields, orgRoleIds: identifiers("The organization role IDs to remove.") },
      { optional: ["userIds", "departmentIds", "departmentTreeIds", "jobIds", "orgRoleIds"] },
    ),
    outputSchema: mutationOutput,
  }),
  defineProviderAction("mingdao", {
    name: "remove_user_from_all_roles",
    operationType: "destructive",
    requiredScopes: [],
    description: "Remove a user from every role in the connected application.",
    inputSchema: s.object("The user role removal request.", {
      userId: s.nonEmptyString("The user ID to remove from all application roles."),
    }),
    outputSchema: mutationOutput,
  }),
  defineProviderAction("mingdao", {
    name: "create_optionset",
    operationType: "write",
    requiredScopes: [],
    description: "Create an application option set with ordered values, colors and scores.",
    inputSchema: s.object("The option set creation request.", {
      name: s.string("The option set name."),
      options: s.array("The options to create.", s.object("An option to create.", optionFields)),
      ...optionSetFlags,
    }),
    outputSchema: s.object("The created option set response.", {
      data: s.looseObject("The created option set identity.", { optionsetId }),
    }),
  }),
  defineProviderAction("mingdao", {
    name: "update_optionset",
    operationType: "destructive",
    requiredScopes: [],
    description: "Update an option set's name, keyed options, order, colors and scores.",
    inputSchema: s.object("The option set update request.", {
      optionsetId,
      name: s.string("The option set name."),
      options: s.array(
        "The updated options.",
        s.object(
          "An option to update.",
          { key: s.string("The existing option key."), ...optionFields },
          { optional: ["score"] },
        ),
      ),
      ...optionSetFlags,
    }),
    outputSchema: mutationOutput,
  }),
  defineProviderAction("mingdao", {
    name: "disable_optionset",
    operationType: "destructive",
    requiredScopes: [],
    description: "Disable an existing application option set.",
    inputSchema: s.object("The option set disable request.", { optionsetId }),
    outputSchema: mutationOutput,
  }),
  defineProviderAction("mingdao", {
    name: "generate_record_share_link",
    operationType: "write",
    requiredScopes: [],
    description:
      "Generate a record share link with selected visible fields, optional password and expiration. Omitted or zero expiration means the link does not expire.",
    inputSchema: s.object(
      "The record share link request.",
      {
        worksheetId: s.nonEmptyString("The worksheet ID."),
        rowId: s.nonEmptyString("The record ID."),
        visibleFields: identifiers("The visible field IDs."),
        expiredIn: s.integer("The expiration in seconds; omitted or zero means no expiration.", {
          minimum: 0,
        }),
        password: s.string("The access password; an empty string means no password is required."),
      },
      { optional: ["visibleFields", "expiredIn", "password"] },
    ),
    outputSchema: s.object("The record share link response.", {
      data: s.looseObject("The record sharing result.", {
        url: s.string("The generated record share URL."),
      }),
    }),
  }),
];
