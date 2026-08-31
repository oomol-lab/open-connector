import type { FeishuJsonRequest } from "./client.ts";

import { optionalRecord } from "../../../core/cast.ts";
import { providerInputError, ProviderRequestError } from "../../provider-runtime.ts";

interface FeishuApplicationActionHandler {
  (input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

const slashCommandBasePath = "/application/v7/app_slash_commands";

export function createFeishuApplicationActionHandlers(
  request: FeishuJsonRequest,
): Record<string, FeishuApplicationActionHandler> {
  return {
    list_app_slash_commands() {
      return listSlashCommands(request);
    },
    create_app_slash_command(input) {
      return createSlashCommand(input, request);
    },
    update_app_slash_command(input) {
      return updateSlashCommand(input, request);
    },
    delete_app_slash_command(input) {
      return deleteSlashCommand(input, request);
    },
  };
}

async function listSlashCommands(request: FeishuJsonRequest) {
  const data = await request({ path: slashCommandBasePath });
  const items = recordArray(data.items);
  return { items, count: items.length };
}

async function createSlashCommand(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const command = commandName(input.command, "command");
  const body = buildCommandBody({
    command,
    description: requiredString(input.description, "description"),
    descriptionI18n: optionalStringRecord(input.descriptionI18n, "descriptionI18n"),
    iconKey: optionalString(input.iconKey),
  });

  try {
    const data = await request({
      method: "POST",
      path: slashCommandBasePath,
      body,
    });
    return { action: "created", item: data };
  } catch (error) {
    if (!isCommandExists(error) || input.force !== true) {
      throw error;
    }

    const commandId = await resolveCommandId(command, request);
    const data = await request({
      method: "PATCH",
      path: `${slashCommandBasePath}/${encodeURIComponent(commandId)}`,
      body: buildCommandBody({
        description: requiredString(input.description, "description"),
        descriptionI18n: optionalStringRecord(input.descriptionI18n, "descriptionI18n"),
        iconKey: optionalString(input.iconKey),
      }),
    });
    return { action: "updated", item: data };
  }
}

async function updateSlashCommand(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const commandId = await resolveTargetCommandId(input, request);
  const description = optionalString(input.description);
  const descriptionI18n = optionalStringRecord(input.descriptionI18n, "descriptionI18n");
  if (descriptionI18n !== undefined && description === undefined) {
    throw providerInputError(
      "descriptionI18n requires description because Feishu replaces the complete description object",
    );
  }
  const body = buildCommandBody({
    description,
    descriptionI18n,
    iconKey: optionalString(input.iconKey),
  });
  if (Object.keys(body).length === 0) {
    throw providerInputError("provide at least one field to update");
  }

  const data = await request({
    method: "PATCH",
    path: `${slashCommandBasePath}/${encodeURIComponent(commandId)}`,
    body,
  });
  return { action: "updated", item: data };
}

async function deleteSlashCommand(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const command = optionalString(input.command);
  const commandId = await resolveTargetCommandId(input, request);
  await request({
    method: "DELETE",
    path: `${slashCommandBasePath}/${encodeURIComponent(commandId)}`,
  });
  return {
    deleted: true,
    commandId,
    command,
  };
}

async function resolveTargetCommandId(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const commandId = optionalString(input.commandId);
  const command = optionalString(input.command);
  if (Boolean(commandId) === Boolean(command)) {
    throw providerInputError("provide exactly one of commandId or command");
  } else if (commandId) {
    return commandId;
  } else {
    return resolveCommandId(commandName(command, "command"), request);
  }
}

async function resolveCommandId(command: string, request: FeishuJsonRequest) {
  const data = await request({ path: slashCommandBasePath });
  for (const item of recordArray(data.items)) {
    if (item.command === command) {
      const commandId = optionalString(item.command_id);
      if (commandId) {
        return commandId;
      }
    }
  }
  throw new ProviderRequestError(404, `slash command "${command}" was not found in the connected Feishu app`);
}

interface CommandBodyInput {
  readonly command?: string;
  readonly description?: string;
  readonly descriptionI18n?: Record<string, string>;
  readonly iconKey?: string;
}

function buildCommandBody(input: CommandBodyInput) {
  const body: Record<string, unknown> = {};
  if (input.command !== undefined) {
    body.command = input.command;
  }
  if (input.description !== undefined || input.descriptionI18n !== undefined) {
    body.description = {
      default_value: input.description,
      i18n: input.descriptionI18n,
    };
  }
  if (input.iconKey !== undefined) {
    body.icon = { icon_key: input.iconKey };
  }
  return body;
}

function isCommandExists(error: unknown) {
  return error instanceof ProviderRequestError && optionalRecord(error.details)?.providerCode === 40000000;
}

function commandName(value: unknown, field: string) {
  const command = requiredString(value, field);
  if (command.startsWith("/")) {
    throw providerInputError(`${field} must not start with "/"`);
  }
  return command;
}

function optionalStringRecord(value: unknown, field: string) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw providerInputError(`${field} must be an object`);
  }
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    result[requiredString(key, `${field} language`)] = requiredString(item, `${field}.${key}`);
  }
  return result;
}

function requiredString(value: unknown, field: string) {
  const result = optionalString(value);
  if (!result) {
    throw providerInputError(`${field} is required`);
  }
  return result;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function recordArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item),
      )
    : [];
}
