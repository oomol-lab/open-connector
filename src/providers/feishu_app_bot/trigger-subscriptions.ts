import type { ResourceSubscription } from "../../triggers/common/integration.ts";
import type { ConnectorProxyResult } from "../../triggers/common/proxy.ts";
import type { JsonValue } from "../../triggers/common/types.ts";

import {
  IntegrationConnectionError,
  PermanentIntegrationError,
  TransientIntegrationError,
} from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { feishuResourceKind } from "./trigger-config.ts";

export function feishuSubscriptions(
  config: Readonly<Record<string, JsonValue>>,
  provider: string,
): readonly ResourceSubscription[] {
  if (config.resource == null) return [];
  if (!isJsonObject(config.resource)) throw new PermanentIntegrationError("Invalid Feishu resource.");
  const { kind, id, documentType } = config.resource;
  if (typeof id != "string" || id.length == 0) throw new PermanentIntegrationError("A Feishu resource ID is required.");
  if (kind != feishuResourceKind(config.eventTypes as string[]))
    throw new PermanentIntegrationError("The selected events do not support this resource subscription.");
  const resource = encodeURIComponent(id);
  if (kind == "document") {
    if (
      typeof documentType != "string" ||
      !["doc", "docx", "sheet", "bitable", "file", "folder", "slides"].includes(documentType)
    ) {
      throw new PermanentIntegrationError("A supported document type is required.");
    }
    return (config.eventTypes as string[]).map((eventType) => {
      const query = { file_type: documentType, event_type: eventType };
      const prefix = `/drive/v1/files/${resource}`;
      return {
        key: JSON.stringify(["document", documentType, id, eventType]),
        subscribe: { endpoint: `${prefix}/subscribe`, method: "POST", query },
        unsubscribe: { endpoint: `${prefix}/delete_subscribe`, method: "DELETE", query },
        inspect: { endpoint: `${prefix}/get_subscribe`, method: "GET", query },
      };
    });
  }
  if (kind == "calendar") {
    const prefix = `/calendar/v4/calendars/${resource}/events`;
    return [
      {
        key: JSON.stringify(["calendar", id]),
        subscribe: { endpoint: `${prefix}/subscription`, method: "POST" },
        unsubscribe: { endpoint: `${prefix}/unsubscription`, method: "POST" },
      },
    ];
  }
  if (kind == "approval") {
    if (provider != "feishu_app_bot")
      throw new PermanentIntegrationError("Approval definition subscriptions require an application Connection.");
    const prefix = `/approval/v4/approvals/${resource}`;
    return [
      {
        key: JSON.stringify(["approval", id]),
        subscribe: { endpoint: `${prefix}/subscribe`, method: "POST" },
        unsubscribe: { endpoint: `${prefix}/unsubscribe`, method: "POST" },
      },
    ];
  }
  throw new PermanentIntegrationError("Unsupported Feishu resource subscription.");
}

export function feishuResponse(result: ConnectorProxyResult): Readonly<Record<string, JsonValue>> {
  if (!isJsonObject(result.data)) throw new TransientIntegrationError("Feishu returned an invalid response.");
  const code = result.data.code;
  if (result.status >= 200 && result.status < 300 && code === 0)
    return isJsonObject(result.data.data) ? result.data.data : {};
  const details = `HTTP ${result.status}${typeof code == "number" && Number.isSafeInteger(code) ? `, Feishu code ${code}` : ""}`;
  if (
    result.status == 401 ||
    result.status == 403 ||
    [99991661, 99991663, 99991668, 99991671, 99991677].includes(Number(code))
  ) {
    throw new IntegrationConnectionError(`Feishu rejected the Connection (${details}).`);
  }
  if (result.status == 429 || result.status >= 500 || code === 99991400)
    throw new TransientIntegrationError(`Feishu is temporarily unavailable (${details}).`);
  throw new PermanentIntegrationError(
    `Feishu rejected the request (${details}). Check the application's API permissions and request parameters.`,
  );
}
