import type { CreateEventSource, UpdateEventSource } from "./configuration.ts";

import { z } from "zod";

const id = z.string().min(1).max(256);
const eventType = z.string().regex(/^[a-z][a-z0-9_.:]{0,127}$/);
const name = z.string().trim().min(1).max(128);
const secret = z.string().min(1).max(256);

const createFeishuEventSourceSchema = z.strictObject({
  kind: z.literal("feishu").optional(),
  version: z.literal(1),
  name,
  connectionId: id,
  teamId: id.nullable(),
  verificationToken: secret,
  encryptKey: secret,
  eventTypes: z
    .array(eventType)
    .min(1)
    .max(200)
    .refine((values) => new Set(values).size == values.length),
  manageSubscriptions: z.boolean(),
});

const createSchema = z.union([
  createFeishuEventSourceSchema,
  z.strictObject({
    kind: z.literal("jira"),
    version: z.literal(1),
    name,
    connectionId: id,
    teamId: id.nullable(),
    project: id,
    eventTypes: z
      .array(z.enum(["jira:issue_created", "jira:issue_updated", "comment_created"]))
      .min(1)
      .max(3)
      .refine((values) => new Set(values).size === values.length),
  }),
  z.strictObject({
    kind: z.literal("fireflies"),
    version: z.literal(1),
    name,
    connectionId: id,
    teamId: id.nullable(),
    signingSecret: secret,
    eventTypes: z
      .array(z.enum(["meeting.transcribed", "meeting.summarized"]))
      .min(1)
      .max(2)
      .refine((values) => new Set(values).size === values.length),
  }),
  z.strictObject({
    kind: z.literal("zoom"),
    version: z.literal(1),
    name,
    connectionId: id,
    teamId: id.nullable(),
    appId: id,
    signingSecret: secret,
    eventTypes: z.array(z.literal("recording.completed")).length(1),
  }),
  z.strictObject({
    kind: z.literal("sentry"),
    version: z.literal(1),
    name,
    connectionId: id,
    teamId: id.nullable(),
    appId: id,
    installationId: id,
    organizationId: id,
    signingSecret: secret,
    eventTypes: z.array(z.literal("issue.alert")).length(1),
  }),
  z.strictObject({
    kind: z.literal("intercom"),
    version: z.literal(1),
    name,
    connectionId: id,
    teamId: id.nullable(),
    appId: id,
    signingSecret: secret,
    eventTypes: z
      .array(z.enum(["conversation.user.created", "conversation.user.replied", "ticket.created"]))
      .min(1)
      .max(3)
      .refine((values) => new Set(values).size === values.length),
  }),
  z.strictObject({
    kind: z.literal("slack"),
    version: z.literal(1),
    name,
    connectionId: id,
    teamId: id.nullable(),
    appId: z.string().regex(/^A[A-Z0-9]+$/),
    workspaceId: z.string().regex(/^T[A-Z0-9]+$/),
    signingSecret: secret,
    eventTypes: z
      .array(z.enum(["app_mention", "message.im"]))
      .min(1)
      .max(2)
      .refine((values) => new Set(values).size === values.length),
  }),
]);

export const updateEventSourceSchema: z.ZodType<UpdateEventSource> = z.strictObject({
  version: z.literal(1),
  expectedRevision: z.int().positive(),
  name,
  enabled: z.boolean(),
  eventTypes: z
    .array(eventType)
    .min(1)
    .max(200)
    .refine((values) => new Set(values).size == values.length),
  verificationToken: secret.optional(),
  signingSecret: secret.optional(),
  encryptKey: secret.optional(),
});

export const createEventSourceSchema: z.ZodType<CreateEventSource> = createSchema;
export function sourceCreateSchema(kind: string): z.ZodType<CreateEventSource> {
  return createSchema.options.find((schema) => schema.shape.kind.safeParse(kind).success)!;
}
