import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

export const mingdaoBuildActions: readonly ProviderActionDefinition[] = [
  defineProviderAction("mingdao", {
    name: "create_app_sections",
    operationType: "write",
    requiredScopes: [],
    description: "Create navigation sections in the connected Mingdao application.",
    inputSchema: s.object(
      "The create app sections request.",
      {
        parentId: s.string("The parent section ID; omit or pass an empty string for the root."),
        sections: s.array("The navigation sections to create.", {
          ...s.looseObject("An item in sections.", {
            icon: s.string("The Mingdao icon name."),
            name: s.string("The display name."),
          }),
          required: ["name"],
        }),
      },
      { required: ["sections"] },
    ),
    outputSchema: s.object(
      "The create app sections response.",
      {
        data: s.looseObject("The operation result.", {
          sectionIds: s.array("The created section IDs.", s.string("An item in sectionIds.")),
        }),
      },
      { required: ["data"] },
    ),
  }),
  defineProviderAction("mingdao", {
    name: "create_app_items",
    operationType: "write",
    requiredScopes: [],
    description: "Create blank worksheet or custom-page application items.",
    inputSchema: s.object(
      "The create app items request.",
      {
        items: s.array("The blank application items to create.", {
          ...s.looseObject("An item in items.", {
            type: s.stringEnum("The type in the documented Mingdao format.", ["worksheet", "customPage"]),
            icon: s.string("The Mingdao icon name."),
            name: s.string("The display name."),
            sectionId: s.string(
              "The navigation section ID; omitted application items use the first available section.",
            ),
          }),
          required: ["type", "name"],
        }),
      },
      { required: ["items"] },
    ),
    outputSchema: s.object(
      "The create app items response.",
      {
        data: s.array(
          "The operation result.",
          s.looseObject("An item in data.", {
            id: s.string("The upstream item ID or field alias."),
            type: s.string("The returned item type."),
            name: s.string("The display name."),
            sectionId: s.string(
              "The navigation section ID; omitted application items use the first available section.",
            ),
          }),
        ),
      },
      { required: ["data"] },
    ),
  }),
  defineProviderAction("mingdao", {
    name: "create_chatbot",
    operationType: "write",
    requiredScopes: [],
    description: "Create a chatbot with a system prompt, welcome message and up to five preset questions.",
    inputSchema: s.object(
      "The create chatbot request.",
      {
        appId: s.string("The application ID."),
        name: s.string("The display name."),
        sectionId: s.string("The navigation section ID; omitted application items use the first available section."),
        description: s.string("The purpose of the assistant."),
        icon: s.string("The Mingdao icon name."),
        prompt: s.string("The chatbot system prompt."),
        welcomeMessage: s.string("The chatbot welcome message."),
        presetQuestions: s.array(
          "The preset questions; at most five are allowed.",
          s.string("An item in presetQuestions."),
          { maxItems: 5 },
        ),
      },
      { required: ["appId", "name", "welcomeMessage", "presetQuestions", "prompt"] },
    ),
    outputSchema: s.object(
      "The create chatbot response.",
      {
        data: s.unknown(
          "The chatbot creation result. Official response definitions conflict between a string and an object; preserve the actual returned data.",
        ),
      },
      { required: ["data"] },
    ),
  }),
  defineProviderAction("mingdao", {
    name: "create_worksheet",
    operationType: "write",
    requiredScopes: [],
    description: "Create a worksheet and its fields, including links to already-created worksheets.",
    inputSchema: s.object(
      "The create worksheet request.",
      {
        name: s.string("The display name."),
        alias: s.string("The worksheet or field alias."),
        remark: s.string("The description displayed to users."),
        sectionId: s.string("The navigation section ID; omitted application items use the first available section."),
        fields: s.array(
          "The worksheet fields to create. Create referenced worksheets before Relation fields; supply dataSource and relation.bidirectional for links.",
          {
            ...s.looseObject("An item in fields.", {
              name: s.string("The display name."),
              alias: s.string("The worksheet or field alias."),
              remark: s.string("The description displayed to users."),
              type: s.string(
                "The field type: creation uses a string (named type such as Text/Relation or documented numeric string codes such as 2/6/11); worksheet updates use integer codes.",
              ),
              isTitle: s.boolean("Whether this field is the record title."),
              required: s.boolean("Whether the field is required."),
              isHidden: s.boolean("Whether to hide the field."),
              isReadOnly: s.boolean("Whether the field is read-only."),
              isHiddenOnCreate: s.boolean("Whether to hide the field when creating a record."),
              isUnique: s.boolean("Whether the field value must be unique."),
              precision: s.integer("The decimal precision for Number fields, from 0 to 14."),
              subType: s.string(
                "Field subtype: Collaborator 0 single or 1 multiple; Relation 1 single or 2 multiple; Time 1 hours/minutes or 6 hours/minutes/seconds; Date/DateTime 5 year, 4 month, 3 day, 2 hour, 1 minute, 6 second precision.",
              ),
              options: s.array("Selection options for SingleSelect or MultipleSelect fields.", {
                ...s.looseObject("An item in options.", {
                  value: s.string("The configured value."),
                  index: s.integer("The option order."),
                }),
                required: ["value", "index"],
              }),
              max: s.integer("The maximum rating from 0 to 10 for Rating fields."),
              dataSource: s.string("The already-created related worksheet ID for Relation fields."),
              relation: s.looseObject(
                "Relation settings; showFields selects displayed fields and bidirectional enables two-way links.",
                {
                  showFields: s.array("The related worksheet fields to display.", s.string("An item in showFields.")),
                  bidirectional: s.boolean("Whether the relation is bidirectional."),
                },
              ),
            }),
            required: ["name", "type", "required"],
          },
        ),
      },
      { required: ["name", "fields"] },
    ),
    outputSchema: s.object(
      "The create worksheet response.",
      {
        data: s.looseObject("The operation result.", {
          worksheetId: s.string("The created worksheet ID."),
        }),
      },
      { required: ["data"] },
    ),
  }),
  defineProviderAction("mingdao", {
    name: "update_worksheet",
    operationType: "destructive",
    requiredScopes: [],
    description: "Update worksheet metadata and add, edit or delete fields.",
    inputSchema: s.object(
      "The update worksheet request.",
      {
        worksheetId: s.string("The worksheet ID or alias."),
        name: s.string("The display name."),
        alias: s.string("The worksheet or field alias."),
        remark: s.string("The description displayed to users."),
        sectionId: s.string("The navigation section ID; omitted application items use the first available section."),
        addFields: s.array("The fields to add; type is an integer code for updates.", {
          ...s.looseObject("An item in addFields.", {
            name: s.string("The display name."),
            type: s.integer(
              "The field type: creation uses a string (named type such as Text/Relation or documented numeric string codes such as 2/6/11); worksheet updates use integer codes.",
            ),
            alias: s.string("The worksheet or field alias."),
            remark: s.string("The description displayed to users."),
            desc: s.string("The field explanation."),
            required: s.boolean("Whether the field is required."),
            isTitle: s.boolean("Whether this field is the record title."),
            isHidden: s.boolean("Whether to hide the field."),
            isReadOnly: s.boolean("Whether the field is read-only."),
            isHiddenOnCreate: s.boolean("Whether to hide the field when creating a record."),
            isUnique: s.boolean("Whether the field value must be unique."),
            precision: s.integer("The decimal precision for Number fields, from 0 to 14.", {
              minimum: 0,
              maximum: 14,
            }),
            subType: s.string(
              "Field subtype: Collaborator 0 single or 1 multiple; Relation 1 single or 2 multiple; Time 1 hours/minutes or 6 hours/minutes/seconds; Date/DateTime 5 year, 4 month, 3 day, 2 hour, 1 minute, 6 second precision.",
            ),
            options: s.array("Selection options for SingleSelect or MultipleSelect fields.", {
              ...s.looseObject("An item in options.", {
                value: s.string("The configured value."),
                index: s.integer("The option order."),
              }),
              required: ["value", "index"],
            }),
            relation: s.looseObject(
              "Relation settings; showFields selects displayed fields and bidirectional enables two-way links.",
              {
                showFields: s.array("The related worksheet fields to display.", s.string("An item in showFields.")),
                bidirectional: s.boolean("Whether the relation is bidirectional."),
              },
            ),
            max: s.integer("The maximum rating from 0 to 10 for Rating fields.", {
              minimum: 0,
              maximum: 10,
            }),
            dataSource: s.string("The already-created related worksheet ID for Relation fields."),
            sourceField: s.string(
              "An existing one-way relation field ID in dataSource to link bidirectionally; omit when creating a new relation.",
            ),
          }),
          required: ["name", "type"],
        }),
        editFields: s.array("The fields to edit, identified by required id; all other field properties are optional.", {
          ...s.looseObject("An item in editFields.", {
            id: s.string("The upstream item ID or field alias."),
            name: s.string("The display name."),
            type: s.integer(
              "The field type: creation uses a string (named type such as Text/Relation or documented numeric string codes such as 2/6/11); worksheet updates use integer codes.",
            ),
            alias: s.string("The worksheet or field alias."),
            remark: s.string("The description displayed to users."),
            desc: s.string("The field explanation."),
            required: s.boolean("Whether the field is required."),
            isTitle: s.boolean("Whether this field is the record title."),
            isHidden: s.boolean("Whether to hide the field."),
            isReadOnly: s.boolean("Whether the field is read-only."),
            isHiddenOnCreate: s.boolean("Whether to hide the field when creating a record."),
            isUnique: s.boolean("Whether the field value must be unique."),
            precision: s.integer("The decimal precision for Number fields, from 0 to 14.", {
              minimum: 0,
              maximum: 14,
            }),
            subType: s.string(
              "Field subtype: Collaborator 0 single or 1 multiple; Relation 1 single or 2 multiple; Time 1 hours/minutes or 6 hours/minutes/seconds; Date/DateTime 5 year, 4 month, 3 day, 2 hour, 1 minute, 6 second precision.",
            ),
            options: s.array("Selection options for SingleSelect or MultipleSelect fields.", {
              ...s.looseObject("An item in options.", {
                value: s.string("The configured value."),
                index: s.integer("The option order."),
              }),
              required: ["value", "index"],
            }),
            relation: s.looseObject(
              "Relation settings; showFields selects displayed fields and bidirectional enables two-way links.",
              {
                showFields: s.array("The related worksheet fields to display.", s.string("An item in showFields.")),
              },
            ),
            max: s.integer("The maximum rating from 0 to 10 for Rating fields.", {
              minimum: 0,
              maximum: 10,
            }),
            dataSource: s.string("The already-created related worksheet ID for Relation fields."),
            sourceField: s.string(
              "An existing one-way relation field ID in dataSource to link bidirectionally; omit when creating a new relation.",
            ),
          }),
          required: ["id"],
        }),
        removeFields: s.array("The field IDs to delete.", s.string("An item in removeFields.")),
      },
      { required: ["worksheetId"] },
    ),
    outputSchema: s.object(
      "The update worksheet response.",
      {
        data: s.looseObject("The operation result.", {}),
      },
      { required: ["data"] },
    ),
  }),
  defineProviderAction("mingdao", {
    name: "delete_worksheet",
    operationType: "destructive",
    requiredScopes: [],
    description: "Delete a worksheet from the connected application.",
    inputSchema: s.object(
      "The delete worksheet request.",
      {
        worksheetId: s.string("The worksheet ID or alias."),
      },
      { required: ["worksheetId"] },
    ),
    outputSchema: s.object(
      "The delete worksheet response.",
      {
        data: s.looseObject("The operation result.", {}),
      },
      { required: ["data"] },
    ),
  }),
  defineProviderAction("mingdao", {
    name: "batch_create_custom_actions",
    operationType: "write",
    requiredScopes: [],
    description: "Create workflow, record-update or related-record custom action buttons.",
    inputSchema: s.object(
      "The batch create custom actions request.",
      {
        worksheetId: s.string("The worksheet ID or alias."),
        actions: s.array("Custom action configuration.", {
          ...s.looseObject("An item in actions.", {
            name: s.string("The display name."),
            remark: s.string("The description displayed to users."),
            type: s.string("The custom action type: triggerWorkflow, updateCurrentRecord or createRelatedRecord."),
            updateFields: s.array(
              "The field IDs or aliases to fill for updateCurrentRecord.",
              s.string("An item in updateFields."),
            ),
            relationField: s.string(
              "The relation field ID or alias; required for createRelatedRecord custom actions or hierarchy views.",
            ),
            runWorkflowAfterSubmit: s.boolean(
              "Whether to run the workflow after submission; required for updateCurrentRecord and createRelatedRecord.",
            ),
            enableWhen: {
              ...s.looseObject(
                "The recursive condition/group filter controlling whether the custom action is enabled.",
                {
                  type: s.stringEnum("The filter node kind.", ["group", "condition"]),
                  logic: s.stringEnum("The group logic AND or OR.", ["AND", "OR"]),
                  field: s.string(
                    "The field ID or alias; filters require a real field ID without an isTitle annotation.",
                  ),
                  operator: s.string("The field-type-specific filter operator."),
                  value: s.unknown("The configured value."),
                  children: s.array(
                    "The nested filter nodes; preserve the recursive condition/group format.",
                    s.looseObject("An item in children.", {}),
                  ),
                },
              ),
              required: ["type"],
            },
          }),
          required: ["name", "type"],
        }),
      },
      { required: ["worksheetId", "actions"] },
    ),
    outputSchema: s.object(
      "The batch create custom actions response.",
      {
        data: s.looseObject("The operation result.", {
          actions: s.array(
            "The created custom action buttons.",
            s.looseObject("An item in actions.", {
              id: s.string("The upstream item ID or field alias."),
              name: s.string("The display name."),
            }),
          ),
        }),
      },
      { required: ["data"] },
    ),
  }),
  defineProviderAction("mingdao", {
    name: "update_custom_page",
    operationType: "destructive",
    requiredScopes: [],
    description:
      "Replace the complete custom-page component layout, including inline charts, views, tabs, containers and filter groups.",
    inputSchema: s.object(
      "The update custom page request.",
      {
        pageId: s.string("The custom page ID."),
        components: s.array(
          "The complete replacement component list on a 48-column grid. Components sharing y must have the same height; x+w cannot exceed 48. Attachment and iframe content use accessible URLs, not local files or base64.",
          {
            ...s.looseObject("An item in components.", {
              componentType: s.stringEnum(
                "The page component type. Charts are created inline; existing chart IDs cannot be mounted.",
                ["chart", "section", "text", "html", "view", "carousel", "button", "tab", "container", "filtersGroup"],
              ),
              name: s.string(
                "Required title for section and chart components only; other component types use config fields.",
              ),
              componentId: s.string(
                "A unique caller-generated UUID for tab or container only; omit for every other component type, including chart.",
              ),
              parentSectionId: s.string(
                "The parent container componentId for container children only; mutually exclusive with parentTabId.",
              ),
              parentTabId: s.string(
                "The target config.tabs[].tabId for tab children only; mutually exclusive with parentSectionId.",
              ),
              position: {
                ...s.looseObject("The component position and dimensions on the 48-column grid.", {
                  x: s.integer("The zero-based starting column; x+w must not exceed 48."),
                  y: s.integer("The zero-based starting row."),
                  w: s.integer("The width in columns; full width is 48."),
                  h: s.integer("The height in rows; components at the same y must have the same height."),
                }),
                required: ["x", "y", "w", "h"],
              },
              config: s.looseObject(
                "Type-specific component configuration: chart creates inline charts; text requires content; html url; view worksheetId/viewId/objectId; carousel worksheetId/viewId/image/count; button count/mobileCount/buttons; tab tabs and a top-level componentId; container top-level componentId; filtersGroup filters and objectControls mappings.",
                {
                  title: s.string("The component title, or the carousel title field ID."),
                  content: s.string("Required rich-text HTML for text components."),
                  url: s.string(
                    "The HTTP(S) iframe URL for html components, or the link field ID for carousel action=2.",
                  ),
                  worksheetId: s.string("The worksheet ID or alias."),
                  viewId: s.string("The view ID."),
                  objectId: s.string(
                    "A unique caller-generated UUID for chart/view components, matching filtersGroup objectControls references; do not use a chart ID or view ID.",
                  ),
                  chartType: s.string(
                    "The chart type: columnChart, barChart, lineChart, pieChart, radarChart, funnelChart, dualAxisChart, pivotTable, regionMap, numberChart, symmetricBarChart, scatterChart, wordCloud, gaugeChart, progressChart, rankingChart or worldMap. Trends use time dimensions; maps require geographic fields. Dual/symmetric charts need one values and one rightValues metric; pivotTable needs rows, columns and values; progressChart needs matching targetValues; gaugeChart needs gaugeMin/gaugeMax.",
                  ),
                  dataScope: s.string("The data permission scope: permission for visible data or all for all data."),
                  timeFieldId: s.string("The time filter field ID; inline page charts default to ctime."),
                  timeRange: s.string(
                    "The time range: all, today, yesterday, tomorrow, currentWeek, lastWeek, nextWeek, currentMonth, lastMonth, nextMonth, currentQuarter, lastQuarter, nextQuarter, currentYear, lastYear, nextYear, firstHalfYear, secondHalfYear, last7Days, last30Days, last365Days, next7Days, next30Days, next365Days, customDynamicRange or customRange. Inline page charts default to currentMonth.",
                  ),
                  customDynamicRange: s.looseObject(
                    "The dynamic date range for timeRange=customDynamicRange. from/to use type today, currentMonth, currentYear, past or future; past/future require value and unit day/week/month/year.",
                    {},
                  ),
                  customRange: s.looseObject("The explicit date range for timeRange=customRange.", {}),
                  dimension: s.array(
                    "Non-pivot dimensions: category/time/geographic fields, first for X-axis and second for series. Maps require genuine geographic fields.",
                    s.looseObject("An item in dimension.", {}),
                  ),
                  rows: s.array("The pivotTable row dimensions.", s.looseObject("An item in rows.", {})),
                  columns: s.array("The pivotTable column dimensions.", s.looseObject("An item in columns.", {})),
                  values: s.array(
                    "The numeric or rowid metrics to aggregate; rowid represents record count.",
                    s.looseObject("An item in values.", {}),
                  ),
                  rightValues: s.array(
                    "The secondary metrics; dualAxisChart and symmetricBarChart require exactly one secondary and one primary metric.",
                    s.looseObject("An item in rightValues.", {}),
                  ),
                  targetValues: s.array(
                    "The target metrics for progressChart, matching values in count and order.",
                    s.looseObject("An item in targetValues.", {}),
                  ),
                  gaugeMin: s.string("The gaugeChart minimum as a string; required for gauges."),
                  gaugeMax: s.string("The gaugeChart maximum as a string; required for gauges."),
                  mapScope: s.stringEnum("The regionMap scope: country, province or city.", [
                    "country",
                    "province",
                    "city",
                  ]),
                  mapRegionCode: s.string(
                    "The 6-digit region code for regionMap. Province codes end in 0000; city codes end in 00. Omit for country; municipalities and special administrative regions use city-level scope even under province.",
                  ),
                  filtersGroupId: s.string("The filter-group ID; use an empty string for a new group."),
                  name: s.string(
                    "Required title for section and chart components only; other component types use config fields.",
                  ),
                  enableBtn: s.boolean("Whether to enable the filter button."),
                  filters: s.array(
                    "The filter-group definitions, including objectControls mappings to chart/view objectId values.",
                    s.looseObject("An item in filters.", {}),
                  ),
                  appId: s.string("The application ID."),
                  customPageId: s.string("The custom page ID."),
                  filter: s.looseObject(
                    "The recursive filter whose root must be a group with logic AND/OR. At most group->group->condition nesting; siblings must all be groups or all conditions. Use option keys and related/member/department/role IDs, not names. isempty/isnotempty omit value.",
                    {},
                  ),
                  sorts: s.array("The chart sorting rules.", s.looseObject("An item in sorts.", {})),
                  limit: s.integer("The maximum result count; recommended for ranking and word-cloud charts."),
                  image: s.string("The attachment field ID used for carousel images."),
                  subTitle: s.string("The carousel subtitle field ID."),
                  count: s.integer(
                    "Required for carousel (record count, default 5) and button (desktop buttons per row, default 6).",
                  ),
                  action: s.integer(
                    "The configured action code: carousel 1 opens record, 2 opens link, 3 previews image; button entries support simple navigation 1 through 4 only.",
                  ),
                  openMode: s.integer("Carousel link opening: 1 current page, 2 new page, 3 dialog."),
                  explain: s.string("The explanation above a button group."),
                  style: s.integer("Button style: 1 filled rectangle, 2 rounded rectangle, 3 dashed."),
                  width: s.integer("Button width: 1 fit text, 2 split the row evenly."),
                  mobileCount: s.integer("Required mobile buttons per row for button components; default 2."),
                  buttons: s.array(
                    "The button definitions; at least one, supporting action codes 1 through 4 only.",
                    s.looseObject("An item in buttons.", {}),
                  ),
                  tabs: s.array(
                    "The tab definitions; at least one, each with a globally unique caller-generated tabId UUID.",
                    s.looseObject("An item in tabs.", {}),
                  ),
                  showName: s.boolean("Whether to display the tab or container title."),
                  showType: s.integer("Tab/container display: 1 transparent or 2 card."),
                  showBorder: s.boolean("Whether to display the component border."),
                  heightType: s.integer("Tab/container height: 1 adaptive or 2 fixed."),
                },
              ),
            }),
            required: ["componentType", "position"],
          },
        ),
      },
      { required: ["pageId", "components"] },
    ),
    outputSchema: s.object(
      "The update custom page response.",
      {
        data: s.looseObject("The operation result.", {
          page_id: s.string("The upstream page ID."),
          components: s.array(
            "The saved page components.",
            s.looseObject("An item in components.", {
              componentId: s.string("The returned component ID."),
            }),
          ),
        }),
      },
      { required: ["data"] },
    ),
  }),
  defineProviderAction("mingdao", {
    name: "batch_create_views",
    operationType: "write",
    requiredScopes: [],
    description:
      "Create table, kanban, gallery, calendar, hierarchy, gantt, resource, detail or map views with their configuration.",
    inputSchema: s.object(
      "The batch create views request.",
      {
        worksheetId: s.string("The worksheet ID or alias."),
        views: s.array("The views to create.", {
          ...s.looseObject("An item in views.", {
            name: s.string("The display name."),
            type: s.stringEnum("The type in the documented Mingdao format.", [
              "table",
              "kanban",
              "gallery",
              "calendar",
              "hierarchy",
              "gantt",
              "resource",
              "detail",
              "map",
            ]),
            config: s.looseObject(
              "View configuration: kanban requires groupField; map locationField; hierarchy relationField; calendar dates; gantt/resource startField and endField (resource also resourceField); detail mode all or first.",
              {
                groupField: s.string("The grouping field ID or alias; required for kanban config."),
                locationField: s.string("The location field ID or alias required for map views."),
                relationField: s.string(
                  "The relation field ID or alias; required for createRelatedRecord custom actions or hierarchy views.",
                ),
                dates: s.array("Calendar start/end field mappings.", s.looseObject("An item in dates.", {})),
                startField: s.string("The start time field ID or alias."),
                endField: s.string("The end time field ID or alias."),
                resourceField: s.string("The resource assignee field ID or alias."),
                mode: s.stringEnum(
                  "Detail view mode: all shows the record list; first displays only the first record.",
                  ["all", "first"],
                ),
              },
            ),
            filter: s.looseObject(
              "The recursive filter whose root must be a group with logic AND/OR. At most group->group->condition nesting; siblings must all be groups or all conditions. Use option keys and related/member/department/role IDs, not names. isempty/isnotempty omit value.",
              {
                type: s.stringEnum("The type in the documented Mingdao format.", ["group", "condition"]),
                logic: s.stringEnum("The group logic AND or OR.", ["AND", "OR"]),
                children: s.array(
                  "The nested filter nodes; preserve the recursive condition/group format.",
                  s.looseObject("An item in children.", {}),
                ),
                field: s.string(
                  "The field ID or alias; filters require a real field ID without an isTitle annotation.",
                ),
                operator: s.stringEnum("The field-type-specific filter operator.", [
                  "eq",
                  "ne",
                  "gt",
                  "ge",
                  "lt",
                  "le",
                  "in",
                  "notin",
                  "contains",
                  "notcontains",
                  "concurrent",
                  "belongsto",
                  "notbelongsto",
                  "startswith",
                  "notstartswith",
                  "endswith",
                  "notendswith",
                  "between",
                  "notbetween",
                  "isempty",
                  "isnotempty",
                ]),
                value: s.unknown("The configured value."),
              },
            ),
            sort: s.array("The view sorting rules in priority order.", {
              ...s.looseObject("An item in sort.", {
                fieldId: s.string("The field ID or alias."),
                sortType: {
                  ...s.integer("The view sort direction: 1 ascending or 2 descending."),
                  enum: [1, 2],
                },
              }),
              required: ["fieldId", "sortType"],
            }),
            color: s.looseObject(
              "The record color field configuration, using an enabled single-select color field (type 9 or 11).",
              {
                fieldId: s.string("The field ID or alias."),
              },
            ),
            quickFilters: s.array(
              "The quick-filter fields in display order. Supports fieldType 2,4,7,32,33,6,8,31,9,10,11,26,27,28,29,35,36,15,16; only selection fields 9/10/11 support selectionType and displayType.",
              {
                ...s.looseObject("An item in quickFilters.", {
                  fieldId: s.string("The field ID or alias."),
                  selectionType: s.stringEnum("The option-filter selection mode.", ["single", "multiple"]),
                  displayType: s.stringEnum("The option-filter display mode.", ["dropdown", "tile"]),
                }),
                required: ["fieldId"],
              },
            ),
            hiddenFields: s.array(
              "The fields hidden in record details for this view.",
              s.string("An item in hiddenFields."),
            ),
            tableFields: s.array(
              "The fields shown in table/gantt layouts; omit for all fields.",
              s.string("An item in tableFields."),
            ),
            filterList: s.looseObject("The sidebar field filter configuration.", {
              filterField: s.string("The sidebar filtering field ID or alias, not its name."),
            }),
            card: s.looseObject("The card title, summary, cover and display fields; use aliases or IDs, not names.", {
              titleField: s.string("The card title text field."),
              summaryField: s.string("The Text or RichText summary field."),
              coverField: s.string("The attachment cover field."),
              coverDirection: s.stringEnum("The cover position: top, left or right.", ["top", "left", "right"]),
              coverDisplayMode: s.stringEnum("The cover presentation: full, square or circle.", [
                "full",
                "square",
                "circle",
              ]),
              displayFields: s.array("Additional fields displayed on the card.", s.string("An item in displayFields.")),
            }),
            actions: s.looseObject("Custom action configuration.", {
              detailActions: s.array(
                "Custom action IDs shown in record details; create the custom actions first.",
                s.string("An item in detailActions."),
              ),
              quickActions: s.array("The quick action buttons shown on rows/cards.", {
                ...s.looseObject("A system or custom quick action.", {
                  type: s.string(
                    "The action kind: copy, print, delete or share for system actions; action for custom actions.",
                  ),
                  id: s.string("The custom action ID when type is action; omit for system actions."),
                }),
                required: ["type"],
              }),
            }),
            group: s.looseObject("The table/gallery/kanban grouping configuration.", {
              groupField: s.string("The grouping field ID or alias; required for kanban config."),
            }),
          }),
          required: ["name", "type"],
        }),
      },
      { required: ["worksheetId", "views"] },
    ),
    outputSchema: s.object(
      "The batch create views response.",
      {
        data: s.looseObject("The operation result.", {
          views: s.array(
            "The created views.",
            s.looseObject("An item in views.", {
              viewId: s.string("The view ID."),
              name: s.string("The display name."),
              type: s.string("The returned item type."),
            }),
          ),
        }),
      },
      { required: ["data"] },
    ),
  }),
  defineProviderAction("mingdao", {
    name: "create_chart",
    operationType: "write",
    requiredScopes: [],
    description: "Create a worksheet chart with dimensions, metrics, date ranges and filters.",
    inputSchema: s.object(
      "The create chart request.",
      {
        worksheetId: s.string("The worksheet ID or alias."),
        chartName: s.string("The chart name."),
        viewId: s.string("The view ID."),
        chartType: s.string(
          "The chart type: columnChart, barChart, lineChart, pieChart, radarChart, funnelChart, dualAxisChart, pivotTable, regionMap, numberChart, symmetricBarChart, scatterChart, wordCloud, gaugeChart, progressChart, rankingChart or worldMap. Trends use time dimensions; maps require geographic fields. Dual/symmetric charts need one values and one rightValues metric; pivotTable needs rows, columns and values; progressChart needs matching targetValues; gaugeChart needs gaugeMin/gaugeMax.",
        ),
        dataScope: s.string("The data permission scope: permission for visible data or all for all data."),
        timeFieldId: s.string("The time filter field ID; inline page charts default to ctime."),
        timeRange: s.string(
          "The time range: all, today, yesterday, tomorrow, currentWeek, lastWeek, nextWeek, currentMonth, lastMonth, nextMonth, currentQuarter, lastQuarter, nextQuarter, currentYear, lastYear, nextYear, firstHalfYear, secondHalfYear, last7Days, last30Days, last365Days, next7Days, next30Days, next365Days, customDynamicRange or customRange. Inline page charts default to currentMonth.",
        ),
        customDynamicRange: s.looseObject(
          "The dynamic date range for timeRange=customDynamicRange. from/to use type today, currentMonth, currentYear, past or future; past/future require value and unit day/week/month/year.",
          {
            from: {
              ...s.looseObject("The start time point; type past/future requires value and unit.", {
                type: s.string("The type in the documented Mingdao format."),
                value: s.integer("The configured value."),
                unit: s.string("The offset unit: day, week, month or year."),
              }),
              required: ["type"],
            },
            to: {
              ...s.looseObject("The end time point with the same structure as from.", {
                type: s.string("The type in the documented Mingdao format."),
                value: s.integer("The configured value."),
                unit: s.string("The offset unit: day, week, month or year."),
              }),
              required: ["type"],
            },
          },
        ),
        customRange: {
          ...s.looseObject("The explicit date range for timeRange=customRange.", {
            startDate: s.string("The start date in yyyy/MM/dd format."),
            endDate: s.string("The end date in yyyy/MM/dd format."),
          }),
          required: ["startDate", "endDate"],
        },
        dimension: s.array(
          "Non-pivot dimensions: category/time/geographic fields, first for X-axis and second for series. Maps require genuine geographic fields.",
          {
            ...s.looseObject("An item in dimension.", {
              field: s.string("The field ID or alias; filters require a real field ID without an isTitle annotation."),
              displayName: s.string("An optional display-name override."),
              granularity: s.integer(
                "Grouping granularity: dates 1 day, 2 week, 3 month, 4 quarter, 5 year; regions 1 province, 2 city, 3 district.",
              ),
              includeEmpty: s.boolean("Whether to include empty values; defaults to false."),
            }),
            required: ["field"],
          },
        ),
        rows: s.array("The pivotTable row dimensions.", {
          ...s.looseObject("An item in rows.", {
            field: s.string("The field ID or alias; filters require a real field ID without an isTitle annotation."),
            displayName: s.string("An optional display-name override."),
            granularity: s.integer(
              "Grouping granularity: dates 1 day, 2 week, 3 month, 4 quarter, 5 year; regions 1 province, 2 city, 3 district.",
            ),
            includeEmpty: s.boolean("Whether to include empty values; defaults to false."),
          }),
          required: ["field"],
        }),
        columns: s.array("The pivotTable column dimensions.", {
          ...s.looseObject("An item in columns.", {
            field: s.string("The field ID or alias; filters require a real field ID without an isTitle annotation."),
            displayName: s.string("An optional display-name override."),
            granularity: s.integer(
              "Grouping granularity: dates 1 day, 2 week, 3 month, 4 quarter, 5 year; regions 1 province, 2 city, 3 district.",
            ),
            includeEmpty: s.boolean("Whether to include empty values; defaults to false."),
          }),
          required: ["field"],
        }),
        values: s.array("The numeric or rowid metrics to aggregate; rowid represents record count.", {
          ...s.looseObject("An item in values.", {
            field: s.string("The field ID or alias; filters require a real field ID without an isTitle annotation."),
            aggregation: s.string("The case-insensitive aggregation: COUNT, DISTINCTCOUNT, SUM, MIN, MAX or AVG."),
            displayName: s.string("An optional display-name override."),
          }),
          required: ["field", "aggregation"],
        }),
        rightValues: s.array(
          "The secondary metrics; dualAxisChart and symmetricBarChart require exactly one secondary and one primary metric.",
          {
            ...s.looseObject("An item in rightValues.", {
              field: s.string("The field ID or alias; filters require a real field ID without an isTitle annotation."),
              aggregation: s.string("The case-insensitive aggregation: COUNT, DISTINCTCOUNT, SUM, MIN, MAX or AVG."),
              displayName: s.string("An optional display-name override."),
            }),
            required: ["field", "aggregation"],
          },
        ),
        targetValues: s.array("The target metrics for progressChart, matching values in count and order.", {
          ...s.looseObject("An item in targetValues.", {
            field: s.string("The field ID or alias; filters require a real field ID without an isTitle annotation."),
            aggregation: s.string("The case-insensitive aggregation: COUNT, DISTINCTCOUNT, SUM, MIN, MAX or AVG."),
            displayName: s.string("An optional display-name override."),
          }),
          required: ["field", "aggregation"],
        }),
        gaugeMin: s.string("The gaugeChart minimum as a string; required for gauges."),
        gaugeMax: s.string("The gaugeChart maximum as a string; required for gauges."),
        mapScope: s.stringEnum("The regionMap scope: country, province or city.", ["country", "province", "city"]),
        mapRegionCode: s.string(
          "The 6-digit region code for regionMap. Province codes end in 0000; city codes end in 00. Omit for country; municipalities and special administrative regions use city-level scope even under province.",
        ),
        filter: s.looseObject(
          "The recursive filter whose root must be a group with logic AND/OR. At most group->group->condition nesting; siblings must all be groups or all conditions. Use option keys and related/member/department/role IDs, not names. isempty/isnotempty omit value.",
          {
            type: s.stringEnum("The type in the documented Mingdao format.", ["group", "condition"]),
            logic: s.stringEnum("The group logic AND or OR.", ["AND", "OR"]),
            children: s.array(
              "The nested filter nodes; preserve the recursive condition/group format.",
              s.looseObject("An item in children.", {}),
            ),
            field: s.string("The field ID or alias; filters require a real field ID without an isTitle annotation."),
            operator: s.stringEnum("The field-type-specific filter operator.", [
              "eq",
              "ne",
              "gt",
              "ge",
              "lt",
              "le",
              "in",
              "notin",
              "contains",
              "notcontains",
              "concurrent",
              "belongsto",
              "notbelongsto",
              "startswith",
              "notstartswith",
              "endswith",
              "notendswith",
              "between",
              "notbetween",
              "isempty",
              "isnotempty",
            ]),
            value: s.unknown("The configured value."),
          },
        ),
        sorts: s.array("The chart sorting rules.", {
          ...s.looseObject("An item in sorts.", {
            field: s.string("The field ID or alias; filters require a real field ID without an isTitle annotation."),
            isAsc: s.boolean("Whether to sort ascending; defaults to false."),
          }),
          required: ["field"],
        }),
        limit: s.integer("The maximum result count; recommended for ranking and word-cloud charts."),
      },
      {
        required: ["worksheetId", "chartName", "viewId", "chartType", "dataScope", "timeFieldId", "timeRange"],
      },
    ),
    outputSchema: s.object(
      "The create chart response.",
      {
        data: s.looseObject("The operation result.", {
          chartId: s.string("The created chart ID."),
          view_id: s.string("The upstream view ID."),
          worksheet_id: s.string("The upstream worksheet ID."),
          chartName: s.string("The chart name."),
          chartType: s.string("The returned chart type."),
          timeFieldId: s.string("The returned time field ID."),
          timeRange: s.string("The returned time range."),
        }),
      },
      { required: ["data"] },
    ),
  }),
];
