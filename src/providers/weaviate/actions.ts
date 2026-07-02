import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "weaviate";

const metaSchema = s.looseObject("Weaviate instance metadata.", {
  hostname: s.url("The URL hostname reported by the Weaviate instance."),
  version: s.nonEmptyString("The Weaviate server version."),
  modules: s.looseObject("Module-specific metadata returned by Weaviate."),
  grpcMaxMessageSize: s.integer("The maximum GRPC message size in bytes."),
});

const collectionSchema = s.looseObject("One Weaviate collection definition.", {
  class: s.nonEmptyString("The collection name."),
  description: s.string("The collection description."),
  vectorizer: s.string("The collection vectorizer setting."),
  vectorIndexType: s.string("The collection vector index type."),
  properties: s.array(
    "Collection properties returned by Weaviate.",
    s.looseObject("One collection property definition."),
  ),
});

const objectSchema = s.looseObject("One Weaviate object.", {
  class: s.string("The collection name the object belongs to."),
  id: s.uuid("The Weaviate object UUID."),
  tenant: s.string("The tenant name the object belongs to."),
  properties: s.looseObject("The object properties returned by Weaviate."),
  additional: s.looseObject("Additional metadata returned by Weaviate."),
});

export const weaviateActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_instance_metadata",
    description: "Get Weaviate instance metadata, including version, hostname, loaded modules, and GRPC message size.",
    inputSchema: s.actionInput({}, [], "Input parameters for retrieving Weaviate instance metadata."),
    outputSchema: s.actionOutput(
      {
        meta: metaSchema,
        raw: s.looseObject("The raw Weaviate meta payload."),
      },
      "Weaviate instance metadata response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_collections",
    description: "List all Weaviate collection definitions currently registered in the instance schema.",
    inputSchema: s.actionInput(
      {
        consistency: s.boolean(
          "Whether Weaviate should proxy the schema request to the cluster leader for strong consistency.",
        ),
      },
      [],
      "Input parameters for listing Weaviate collections.",
    ),
    outputSchema: s.actionOutput(
      {
        classes: s.array("The collection definitions returned by Weaviate.", collectionSchema),
        name: s.string("The schema name returned by Weaviate."),
        maintainer: s.string("The schema maintainer email returned by Weaviate."),
        raw: s.looseObject("The raw Weaviate schema payload."),
      },
      "Weaviate collection list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_collection",
    description:
      "Get one Weaviate collection definition by collection name, including properties and vectorizer settings.",
    inputSchema: s.actionInput(
      {
        className: s.nonEmptyString("The Weaviate collection name to retrieve."),
        consistency: s.boolean(
          "Whether Weaviate should proxy the schema request to the cluster leader for strong consistency.",
        ),
      },
      ["className"],
      "Input parameters for retrieving one Weaviate collection.",
    ),
    outputSchema: s.actionOutput(
      {
        collection: collectionSchema,
        raw: s.looseObject("The raw Weaviate collection payload."),
      },
      "Weaviate single collection response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_objects",
    description:
      "List objects from one Weaviate collection with optional paging, sorting, include flags, and tenant selection.",
    inputSchema: s.actionInput(
      {
        className: s.nonEmptyString("The Weaviate collection name to query."),
        tenant: s.string("The tenant name to target for a multi-tenant Weaviate collection."),
        after: s.string(
          "The threshold UUID to page after. Use an empty string only when intentionally following the official Weaviate after semantics.",
        ),
        offset: s.nonNegativeInteger("The zero-based result offset."),
        limit: s.positiveInteger("The maximum number of objects to return."),
        include: s.string("Additional fields to include, such as classification, vector, or interpretation."),
        sort: s.string("Comma-separated property names to sort by, such as city or country,city."),
        order: s.string("Comma-separated sort directions matching sort, such as asc or desc."),
      },
      ["className"],
      "Input parameters for listing Weaviate objects.",
    ),
    outputSchema: s.actionOutput(
      {
        objects: s.array("The objects returned by Weaviate.", objectSchema),
        totalResults: s.integer("The total number of matching objects."),
        raw: s.looseObject("The raw Weaviate object list payload."),
      },
      "Weaviate object list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_object",
    description:
      "Get one Weaviate object by collection name and UUID with optional include flags, consistency, node, and tenant routing.",
    inputSchema: s.actionInput(
      {
        className: s.nonEmptyString("The Weaviate collection name the object belongs to."),
        id: s.uuid("The Weaviate object UUID."),
        include: s.string("Additional fields to include, such as classification, vector, or interpretation."),
        consistencyLevel: s.string("The optional consistency level query value to forward."),
        nodeName: s.string("The optional node name query value to forward."),
        tenant: s.string("The tenant name to target for a multi-tenant Weaviate collection."),
      },
      ["className", "id"],
      "Input parameters for retrieving one Weaviate object.",
    ),
    outputSchema: s.actionOutput(
      {
        object: objectSchema,
        raw: s.looseObject("The raw Weaviate object payload."),
      },
      "Weaviate single object response.",
    ),
  }),
];

export type WeaviateActionName = (typeof weaviateActions)[number]["name"];
