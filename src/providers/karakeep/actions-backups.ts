import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { backupSchema, emptyInputSchema, karakeepIdField, successResultSchema, transitFileFields } from "./schemas.ts";

const service = "karakeep";
const backupReadScopes = ["backups:read"] as const;
const backupWriteScopes = ["backups:readwrite"] as const;
const backupDownloadScopes = ["backups:read", "assets:read"] as const;

const backupIdInputSchema = (description: string) =>
  s.requiredObject("Input parameters identifying one Karakeep backup.", {
    backupId: karakeepIdField(description),
  });

export const karakeepBackupActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_backups",
    operationType: "read",
    description:
      "List every account backup recorded for the connected Karakeep user, including the ones that are still pending and the ones that failed.",
    requiredScopes: backupReadScopes,
    inputSchema: emptyInputSchema,
    outputSchema: s.looseRequiredObject("The backups recorded for the connected user.", {
      backups: s.array("The backup records, including pending and failed ones.", backupSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "create_backup",
    operationType: "write",
    description:
      "Trigger a new full account backup for the connected Karakeep user. Karakeep records the request and answers immediately with a backup whose status is pending; the archive itself is produced asynchronously by the instance backup worker, and assetId, size and bookmarkCount stay empty until it finishes. Poll get_backup until status becomes success or failure. When the backup worker is disabled on that instance the record stays pending forever, so always give the polling loop a timeout of its own. Karakeep rate limits this to five backups per hour.",
    requiredScopes: backupWriteScopes,
    asyncLifecycle: {
      startActionId: "karakeep.create_backup",
      statusActionId: "karakeep.get_backup",
    },
    inputSchema: emptyInputSchema,
    outputSchema: backupSchema,
  }),
  defineProviderAction(service, {
    name: "get_backup",
    operationType: "read",
    description:
      "Get one Karakeep backup by id, including its current status, archive size, bookmark count and failure message. This is the polling target for create_backup: keep reading it until status is success or failure, and treat a record that stays pending as a backup worker that is not running on that instance.",
    requiredScopes: backupReadScopes,
    asyncLifecycle: {
      startActionId: "karakeep.create_backup",
      statusActionId: "karakeep.get_backup",
    },
    inputSchema: backupIdInputSchema("The id of the backup to read, as returned by create_backup or list_backups."),
    outputSchema: backupSchema,
  }),
  defineProviderAction(service, {
    name: "delete_backup",
    operationType: "destructive",
    description:
      "Permanently delete a Karakeep backup record together with the archive file it produced. Karakeep answers with an empty body, so the action reports the deleted backup id instead.",
    requiredScopes: backupWriteScopes,
    inputSchema: backupIdInputSchema("The id of the backup to delete."),
    outputSchema: successResultSchema(
      "The result of deleting a Karakeep backup.",
      "Always true; Karakeep answers a successful delete with an empty body.",
      { backupId: "The id of the backup that was deleted." },
    ),
  }),
  defineProviderAction(service, {
    name: "download_backup",
    operationType: "read",
    description:
      "Download a finished Karakeep backup archive into local transit storage. The action first verifies that the backup succeeded and has an asset id, then downloads that authenticated asset directly instead of following Karakeep's relative redirect.",
    requiredScopes: backupDownloadScopes,
    inputSchema: backupIdInputSchema("The id of the backup to download."),
    outputSchema: s.looseRequiredObject("The backup archive stored in local transit storage.", {
      ...transitFileFields,
      backupId: s.string("The id of the backup the archive belongs to."),
      assetId: s.string("The id of the Karakeep asset holding the archive."),
    }),
  }),
];
