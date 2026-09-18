import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "lightspeed_vt" as const;

const positiveId = (description: string) => s.integer(description, { minimum: 1 });
const page = s.integer("The one-based result page to return.", { minimum: 1 });
const itemsPerPage = s.integer("The number of records to return per page, up to 200.", {
  minimum: 1,
  maximum: 200,
});

const userSchema = s.looseObject("A LightSpeed VT user record. Additional documented profile fields may be returned.", {
  userId: positiveId("The LightSpeed VT user identifier."),
  username: s.string("The globally unique LightSpeed VT username."),
  firstName: s.string("The user's first name."),
  lastName: s.string("The user's last name."),
  email: s.string("The user's email address."),
  locationId: positiveId("The identifier of the user's location."),
  locationName: s.string("The name of the user's location."),
  systemId: positiveId("The identifier of the user's LightSpeed VT system."),
  isActive: s.boolean("Whether the user is active."),
});

const courseSchema = s.looseObject("A LightSpeed VT course summary. Additional course fields may be returned.", {
  courseId: positiveId("The LightSpeed VT course identifier."),
  courseName: s.string("The course name."),
  categoryId: positiveId("The course category identifier."),
  categoryName: s.string("The course category name."),
});

const locationSchema = s.looseObject(
  "A LightSpeed VT location record. Detail responses may contain additional contact and theme fields.",
  {
    systemId: positiveId("The identifier of the LightSpeed VT system containing the location."),
    locationId: positiveId("The LightSpeed VT location identifier."),
    name: s.string("The location name."),
    isActive: s.boolean("Whether the location is active."),
    vendorId: s.string("The external vendor reference associated with the location."),
  },
);

export const lightspeedVtActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_users",
    operationType: "read",
    description: "List or find users available to the connected LightSpeed VT API account.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters and pagination for listing LightSpeed VT users.",
      {
        username: s.string("Return the user matching this globally unique username."),
        email: s.string("Return users matching this email address.", { format: "email" }),
        systemId: positiveId("Return users from this LightSpeed VT system."),
        locationId: positiveId("Return users from this location."),
        isActive: s.boolean("Return only active or inactive users."),
        accessLevel: s.integer("Return users with this access-level value."),
        vendorId: s.string("Return users with this external vendor reference."),
        itemsPerPage,
        page,
      },
      {
        optional: [
          "username",
          "email",
          "systemId",
          "locationId",
          "isActive",
          "accessLevel",
          "vendorId",
          "itemsPerPage",
          "page",
        ],
      },
    ),
    outputSchema: s.object("The users returned by LightSpeed VT.", {
      users: s.array("The matching user records.", userSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_user",
    operationType: "read",
    description: "Retrieve one LightSpeed VT user by user identifier.",
    requiredScopes: [],
    inputSchema: s.object("The user to retrieve.", {
      userId: positiveId("The LightSpeed VT user identifier."),
    }),
    outputSchema: s.object("The requested LightSpeed VT user.", {
      user: userSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_courses",
    operationType: "read",
    description: "List active courses available to the connected LightSpeed VT API account.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters and pagination for listing LightSpeed VT courses.",
      {
        systemId: positiveId("Return courses from this LightSpeed VT system."),
        categoryId: positiveId("Return courses from this category."),
        isInteractive: s.boolean("Return courses that do or do not contain interactive chapters."),
        itemsPerPage,
        page,
      },
      { optional: ["systemId", "categoryId", "isInteractive", "itemsPerPage", "page"] },
    ),
    outputSchema: s.object("The courses returned by LightSpeed VT.", {
      courses: s.array("The matching course summaries.", courseSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_course",
    operationType: "read",
    description: "Retrieve one LightSpeed VT course by course identifier.",
    requiredScopes: [],
    inputSchema: s.object("The course to retrieve.", {
      courseId: positiveId("The LightSpeed VT course identifier."),
    }),
    outputSchema: s.object("The requested LightSpeed VT course.", {
      course: courseSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_locations",
    operationType: "read",
    description: "List locations available to the connected LightSpeed VT API account.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters and pagination for listing LightSpeed VT locations.",
      {
        systemId: positiveId("Return locations from this LightSpeed VT system."),
        locationIds: s.array(
          "Return only these location identifiers.",
          positiveId("One LightSpeed VT location identifier."),
          { minItems: 1 },
        ),
        name: s.string("Return locations matching this name."),
        isActive: s.boolean("Return only active or inactive locations."),
        vendorId: s.string("Return locations with this external vendor reference."),
        superUserId: positiveId("Return locations assigned to this superuser."),
        itemsPerPage,
        page,
      },
      {
        optional: ["systemId", "locationIds", "name", "isActive", "vendorId", "superUserId", "itemsPerPage", "page"],
      },
    ),
    outputSchema: s.object("The locations returned by LightSpeed VT.", {
      locations: s.array("The matching location records.", locationSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_location",
    operationType: "read",
    description: "Retrieve one LightSpeed VT location by location identifier.",
    requiredScopes: [],
    inputSchema: s.object("The location to retrieve.", {
      locationId: positiveId("The LightSpeed VT location identifier."),
    }),
    outputSchema: s.object("The requested LightSpeed VT location.", {
      location: locationSchema,
    }),
  }),
];
