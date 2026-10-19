import { Buffer } from "node:buffer";
import { optionalRecord, optionalRawString } from "../../core/cast.ts";
import { readBoundedResponseBytes } from "../../core/request.ts";
import { providerInputError, requiredInputString, runProviderRequest } from "../provider-runtime.ts";
import { employeeAttachmentFields } from "./employee-schema.ts";

async function attachmentPayload(value: unknown, fieldName: string, fetcher: typeof fetch, signal?: AbortSignal) {
  if (value === null || value === undefined) return value;
  const attachment = optionalRecord(value);
  const fileName = requiredInputString(attachment?.fileName, `${fieldName}.fileName`);
  const fileUrl = requiredInputString(attachment?.fileUrl, `${fieldName}.fileUrl`);
  const bytes = await runProviderRequest(
    { label: "SmartHR attachment", timeoutMs: 15_000, signal },
    async (requestSignal) => {
      const response = await fetcher(fileUrl, { signal: requestSignal });
      if (!response.ok) {
        await response.body?.cancel();
        throw providerInputError(`${fieldName}.fileUrl download failed with HTTP ${response.status}`);
      }
      return readBoundedResponseBytes(response, {
        maxBytes: 10 * 1024 * 1024,
        fieldName: `${fieldName}.fileUrl`,
        createError: providerInputError,
        signal: requestSignal,
      });
    },
  );
  return { file_name: fileName, content: Buffer.from(bytes).toString("base64") };
}

export async function prepareEmployeeWrite(
  value: unknown,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const employee = optionalRecord(value);
  if (!employee) throw providerInputError("employee must be an object");
  const body = structuredClone(employee);
  if (Array.isArray(body.bank_accounts)) {
    const withSetting = body.bank_accounts.filter(
      (entry) => optionalRawString(optionalRecord(entry)?.bank_account_setting_id) !== undefined,
    ).length;
    if (withSetting !== 0 && withSetting !== body.bank_accounts.length) {
      throw providerInputError("All bank_accounts must either supply bank_account_setting_id or omit it");
    }
  }
  for (const key of employeeAttachmentFields) {
    if (body[key] !== undefined) body[key] = await attachmentPayload(body[key], `employee.${key}`, fetcher, signal);
  }
  if (Array.isArray(body.bank_accounts)) {
    for (const entry of body.bank_accounts) {
      const account = optionalRecord(entry);
      if (account?.bankbook_image !== undefined)
        account.bankbook_image = await attachmentPayload(
          account.bankbook_image,
          "employee.bank_accounts.bankbook_image",
          fetcher,
          signal,
        );
    }
  }
  if (Array.isArray(body.custom_fields)) {
    for (const entry of body.custom_fields) {
      const field = optionalRecord(entry);
      if (field?.file !== undefined) {
        const attachment = await attachmentPayload(field.file, "employee.custom_fields.file", fetcher, signal);
        if (attachment) {
          field.value = attachment.content;
          field.file_name = attachment.file_name;
        }
        delete field.file;
      }
    }
  }
  return body;
}
