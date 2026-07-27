import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "upstash_redis";

const keySchema = s.nonEmptyString("The Redis key.");
const valueSchema = s.nonEmptyString("The string value stored for the Redis key.");
const expirationSecondsSchema = s.positiveInteger("Expiration time in seconds.");

export const upstashRedisActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get",
    description: "Get the string value stored for one Redis key.",
    inputSchema: s.actionInput({ key: keySchema }, ["key"], "The Redis key to retrieve."),
    outputSchema: s.actionOutput(
      {
        value: s.nullableString(
          "The stored string value, or null when the key does not exist. Upstash replaces bytes that are not valid UTF-8 with U+FFFD, so only text values round-trip exactly.",
        ),
      },
      "The value returned for the Redis key.",
    ),
    followUpActions: ["upstash_redis.set", "upstash_redis.delete", "upstash_redis.expire", "upstash_redis.ttl"],
  }),
  defineProviderAction(service, {
    name: "set",
    description: "Store a string value for one Redis key, optionally with an expiration or conditional write.",
    inputSchema: s.object(
      "The Redis string value to store.",
      {
        key: keySchema,
        value: valueSchema,
        expirationSeconds: expirationSecondsSchema,
        condition: s.stringEnum(["NX", "XX"], {
          description: "Optional Redis write condition: NX stores only a new key; XX stores only an existing key.",
        }),
      },
      { required: ["key", "value"], optional: ["expirationSeconds", "condition"] },
    ),
    outputSchema: s.actionOutput(
      { stored: s.boolean("Whether Redis stored the value. False means the requested condition was not met.") },
      "The result of the Redis SET command.",
    ),
    followUpActions: ["upstash_redis.get", "upstash_redis.ttl"],
  }),
  defineProviderAction(service, {
    name: "delete",
    description: "Delete one Redis key.",
    inputSchema: s.actionInput({ key: keySchema }, ["key"], "The Redis key to delete."),
    outputSchema: s.actionOutput(
      { deleted: s.boolean("Whether Redis deleted an existing key.") },
      "The result of the Redis DEL command.",
    ),
  }),
  defineProviderAction(service, {
    name: "exists",
    description: "Check whether one Redis key exists.",
    inputSchema: s.actionInput({ key: keySchema }, ["key"], "The Redis key to check."),
    outputSchema: s.actionOutput(
      { exists: s.boolean("Whether the Redis key exists.") },
      "The result of the Redis EXISTS command.",
    ),
    followUpActions: ["upstash_redis.get", "upstash_redis.ttl"],
  }),
  defineProviderAction(service, {
    name: "expire",
    description: "Set or replace the expiration time for one Redis key.",
    inputSchema: s.actionInput(
      { key: keySchema, expirationSeconds: expirationSecondsSchema },
      ["key", "expirationSeconds"],
      "The Redis key and its new expiration time.",
    ),
    outputSchema: s.actionOutput(
      { updated: s.boolean("Whether Redis updated the expiration for an existing key.") },
      "The result of the Redis EXPIRE command.",
    ),
    followUpActions: ["upstash_redis.ttl"],
  }),
  defineProviderAction(service, {
    name: "ttl",
    description: "Get the remaining expiration time for one Redis key.",
    inputSchema: s.actionInput({ key: keySchema }, ["key"], "The Redis key whose expiration to retrieve."),
    outputSchema: s.actionOutput(
      {
        ttlSeconds: s.integer(
          "Remaining expiration in seconds. -2 means the key does not exist; -1 means the key has no expiration.",
        ),
      },
      "The result of the Redis TTL command.",
    ),
  }),
  defineProviderAction(service, {
    name: "scan",
    description: "Scan one page of Redis keys without reading the full keyspace.",
    inputSchema: s.object(
      "Cursor pagination and optional filters for Redis SCAN.",
      {
        cursor: s.nonEmptyString("The cursor returned by a previous scan. Omit it to start at cursor 0."),
        match: s.nonEmptyString("Optional Redis glob pattern used to filter keys."),
        count: s.integer("Optional scan work hint from 1 to 1000.", { minimum: 1, maximum: 1000 }),
      },
      { optional: ["cursor", "match", "count"] },
    ),
    outputSchema: s.actionOutput(
      {
        nextCursor: s.nonEmptyString(
          "Cursor to pass to the next scan request. A value of 0 means scanning is complete.",
        ),
        keys: s.stringArray("Keys returned in this scan page."),
        complete: s.boolean("Whether this scan reached cursor 0."),
      },
      "One page returned by Redis SCAN.",
    ),
  }),
];
