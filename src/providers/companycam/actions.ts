import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "companycam";

const projectIdSchema = s.nonEmptyString("The CompanyCam project ID.");
const userIdSchema = s.nonEmptyString("The CompanyCam user ID.");
const tagIdSchema = s.nonEmptyString("The CompanyCam tag ID.");
const rawObjectSchema = s.looseObject("The raw CompanyCam object.");
const paginationInputFields = {
  page: s.positiveInteger("The page number to return."),
  perPage: s.positiveInteger("The number of records to return per page."),
};

const imageSchema = s.object(
  "A CompanyCam image URI variant.",
  {
    type: s.nullableString("The image variant type."),
    uri: s.nullableString("The image URI."),
    url: s.nullableString("The image URL."),
  },
  { optional: ["type", "uri", "url"] },
);

const addressSchema = s.object(
  "A CompanyCam address.",
  {
    streetAddress1: s.nullableString("The first street address line."),
    streetAddress2: s.nullableString("The second street address line."),
    city: s.nullableString("The city name."),
    state: s.nullableString("The state or region name."),
    postalCode: s.nullableString("The postal or ZIP code."),
    country: s.nullableString("The country code or name."),
  },
  { optional: ["streetAddress1", "streetAddress2", "city", "state", "postalCode", "country"] },
);

const addressInputSchema = s.object(
  "The address fields to send to CompanyCam.",
  {
    streetAddress1: s.string("The first street address line."),
    streetAddress2: s.string("The second street address line."),
    city: s.string("The city name."),
    state: s.string("The state or region name."),
    postalCode: s.string("The postal or ZIP code."),
    country: s.string("The country code or name."),
  },
  { optional: ["streetAddress1", "streetAddress2", "city", "state", "postalCode", "country"] },
);

const coordinateSchema = s.object("A latitude and longitude coordinate.", {
  lat: s.number("The latitude value."),
  lon: s.number("The longitude value."),
});

const projectContactInputSchema = s.object(
  "The primary contact fields to send to CompanyCam.",
  {
    name: s.string("The primary contact name."),
    email: s.email("The primary contact email address."),
    phoneNumber: s.string("The primary contact phone number."),
  },
  { optional: ["name", "email", "phoneNumber"] },
);

const projectSchema = s.object("A CompanyCam project.", {
  id: s.nullableString("The CompanyCam project ID."),
  companyId: s.nullableString("The CompanyCam company ID."),
  creatorId: s.nullableString("The ID of the entity that created the project."),
  creatorType: s.nullableString("The type of entity that created the project."),
  creatorName: s.nullableString("The display name of the entity that created the project."),
  status: s.nullableString("The project status returned by CompanyCam."),
  archived: s.nullableBoolean("Whether the project is archived."),
  name: s.nullableString("The project name."),
  address: s.nullable(addressSchema),
  coordinates: s.nullable(coordinateSchema),
  featuredImage: s.array("The project feature image variants.", imageSchema),
  projectUrl: s.nullableString("The project URL in the CompanyCam web app."),
  embeddedProjectUrl: s.nullableString("The embeddable project URL."),
  slug: s.nullableString("The public slug used in some CompanyCam URLs."),
  public: s.nullableBoolean("Whether the project timeline and public features are enabled."),
  geofence: s.array("The project geofence coordinates.", coordinateSchema),
  notepad: s.nullableString("The project notepad text."),
  createdAt: s.nullableInteger("The Unix timestamp when the project was created."),
  updatedAt: s.nullableInteger("The Unix timestamp when the project was updated."),
  raw: rawObjectSchema,
});

const companySchema = s.object("A CompanyCam company.", {
  id: s.nullableString("The CompanyCam company ID."),
  name: s.nullableString("The company name."),
  status: s.nullableString("The company status returned by CompanyCam."),
  address: s.nullable(addressSchema),
  logo: s.array("The company logo variants.", imageSchema),
  raw: rawObjectSchema,
});

const userSchema = s.object("A CompanyCam user.", {
  id: s.nullableString("The CompanyCam user ID."),
  companyId: s.nullableString("The CompanyCam company ID."),
  emailAddress: s.nullableString("The user's email address."),
  status: s.nullableString("The user status returned by CompanyCam."),
  firstName: s.nullableString("The user's first name."),
  lastName: s.nullableString("The user's last name."),
  profileImage: s.array("The user's profile image variants.", imageSchema),
  phoneNumber: s.nullableString("The user's phone number."),
  createdAt: s.nullableInteger("The Unix timestamp when the user was created."),
  updatedAt: s.nullableInteger("The Unix timestamp when the user was updated."),
  userUrl: s.nullableString("The user URL in the CompanyCam web app."),
  raw: rawObjectSchema,
});

const tagSchema = s.object("A CompanyCam tag.", {
  id: s.nullableString("The CompanyCam tag ID."),
  companyId: s.nullableString("The CompanyCam company ID."),
  displayValue: s.nullableString("The user-facing tag label."),
  value: s.nullableString("The normalized tag value used for searching and sorting."),
  createdAt: s.nullableInteger("The Unix timestamp when the tag was created."),
  updatedAt: s.nullableInteger("The Unix timestamp when the tag was updated."),
  raw: rawObjectSchema,
});

export const companycamActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_company",
    description: "Retrieve the CompanyCam company associated with the API token.",
    inputSchema: s.object("The input payload for retrieving the CompanyCam company.", {}),
    outputSchema: s.object("The response returned when retrieving the CompanyCam company.", {
      company: companySchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Retrieve the current CompanyCam user associated with the API token.",
    inputSchema: s.object("The input payload for retrieving the current CompanyCam user.", {}),
    outputSchema: s.object("The response returned when retrieving the current CompanyCam user.", {
      user: userSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_projects",
    description: "List CompanyCam projects with optional name, address, and modified-since filters.",
    inputSchema: s.object(
      "The input payload for listing CompanyCam projects.",
      {
        ...paginationInputFields,
        query: s.string("Filter projects by name or the first address line."),
        modifiedSince: s.dateTime("Return projects modified on or after this timestamp."),
      },
      { optional: ["page", "perPage", "query", "modifiedSince"] },
    ),
    outputSchema: s.object("The response returned when listing CompanyCam projects.", {
      projects: s.array("The CompanyCam projects returned by the API.", projectSchema),
      raw: s.array("The raw CompanyCam project array.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_project",
    description: "Retrieve one CompanyCam project by ID.",
    inputSchema: s.object("The input payload for retrieving one CompanyCam project.", { projectId: projectIdSchema }),
    outputSchema: s.object("The response returned when retrieving one CompanyCam project.", {
      project: projectSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_project",
    description: "Create a CompanyCam project with optional address, coordinates, and contact data.",
    inputSchema: s.object(
      "The input payload for creating a CompanyCam project.",
      {
        name: s.nonEmptyString("The project name."),
        address: addressInputSchema,
        coordinates: coordinateSchema,
        geofence: s.array("The project geofence coordinates.", coordinateSchema, { minItems: 1 }),
        primaryContact: projectContactInputSchema,
        currentUserEmail: s.email("The CompanyCam user email to send in the X-CompanyCam-User header."),
      },
      { optional: ["address", "coordinates", "geofence", "primaryContact", "currentUserEmail"] },
    ),
    outputSchema: s.object("The response returned when creating a CompanyCam project.", {
      project: projectSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_project",
    description: "Update a CompanyCam project's name, address, coordinates, or geofence.",
    inputSchema: s.object(
      "The input payload for updating a CompanyCam project.",
      {
        projectId: projectIdSchema,
        name: s.string("The updated project name."),
        address: addressInputSchema,
        coordinates: coordinateSchema,
        geofence: s.array("The updated project geofence coordinates.", coordinateSchema, { minItems: 1 }),
      },
      { optional: ["name", "address", "coordinates", "geofence"] },
    ),
    outputSchema: s.object("The response returned when updating a CompanyCam project.", {
      project: projectSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "archive_project",
    description: "Archive a CompanyCam project by ID.",
    inputSchema: s.object("The input payload for archiving a CompanyCam project.", { projectId: projectIdSchema }),
    outputSchema: s.object("The response returned when archiving a CompanyCam project.", {
      project: projectSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "restore_project",
    description: "Restore an archived CompanyCam project by ID.",
    inputSchema: s.object("The input payload for restoring a CompanyCam project.", { projectId: projectIdSchema }),
    outputSchema: s.object("The response returned when restoring a CompanyCam project.", {
      project: projectSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_users",
    description: "List CompanyCam users visible to the API token.",
    inputSchema: s.object("The input payload for listing CompanyCam users.", paginationInputFields, {
      optional: ["page", "perPage"],
    }),
    outputSchema: s.object("The response returned when listing CompanyCam users.", {
      users: s.array("The CompanyCam users returned by the API.", userSchema),
      raw: s.array("The raw CompanyCam user array.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_user",
    description: "Retrieve one CompanyCam user by ID.",
    inputSchema: s.object("The input payload for retrieving one CompanyCam user.", { userId: userIdSchema }),
    outputSchema: s.object("The response returned when retrieving one CompanyCam user.", {
      user: userSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_tags",
    description: "List CompanyCam tags visible to the API token.",
    inputSchema: s.object("The input payload for listing CompanyCam tags.", paginationInputFields, {
      optional: ["page", "perPage"],
    }),
    outputSchema: s.object("The response returned when listing CompanyCam tags.", {
      tags: s.array("The CompanyCam tags returned by the API.", tagSchema),
      raw: s.array("The raw CompanyCam tag array.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_tag",
    description: "Retrieve one CompanyCam tag by ID.",
    inputSchema: s.object("The input payload for retrieving one CompanyCam tag.", { tagId: tagIdSchema }),
    outputSchema: s.object("The response returned when retrieving one CompanyCam tag.", {
      tag: tagSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_tag",
    description: "Create a CompanyCam tag.",
    inputSchema: s.object("The input payload for creating a CompanyCam tag.", {
      displayValue: s.nonEmptyString("The user-facing tag label."),
    }),
    outputSchema: s.object("The response returned when creating a CompanyCam tag.", {
      tag: tagSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_tag",
    description: "Update a CompanyCam tag label.",
    inputSchema: s.object("The input payload for updating a CompanyCam tag.", {
      tagId: tagIdSchema,
      displayValue: s.nonEmptyString("The updated user-facing tag label."),
    }),
    outputSchema: s.object("The response returned when updating a CompanyCam tag.", {
      tag: tagSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_tag",
    description: "Delete a CompanyCam tag by ID.",
    inputSchema: s.object("The input payload for deleting a CompanyCam tag.", { tagId: tagIdSchema }),
    outputSchema: s.object("The response returned when deleting a CompanyCam tag.", {
      deleted: s.boolean("Whether the delete request completed successfully."),
      raw: rawObjectSchema,
    }),
  }),
];
