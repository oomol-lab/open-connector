import type { ReactNode } from "react";

import { useTranslate } from "@embra/i18n/react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { ApiError } from "./api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface SaasFeedbackProps {
  error?: unknown;
  message?: string;
}

const errorKeys: Record<string, string> = {
  encryption_required: "encryption",
  origin_required: "origin",
  invalid_url: "blocked",
  dns: "dns",
  network: "network",
  redirect: "redirect",
  invalid_json: "json",
  too_large: "size",
  timeout: "timeout",
  oauth_source_unauthorized: "key",
  oauth_source_protocol_error: "protocol",
  oauth_source_not_found: "notFound",
  oauth_source_in_use: "inUse",
  oauth_source_mismatch: "mismatch",
  oauth_source_rate_limited: "rateLimit",
  oauth_source_origin_mismatch: "origin",
  oauth_source_configuration_error: "configuration",
  oauth_source_not_configured: "configuration",
  oauth_source_scope_missing: "scopes",
  invalid_input: "input",
};

export function SaasFeedback({ error, message }: SaasFeedbackProps): ReactNode {
  const t = useTranslate();
  if (error) {
    const key =
      error instanceof ApiError
        ? (errorKeys[error.reason ?? ""] ??
          errorKeys[error.code ?? ""] ??
          (error.status === 401 ? "session" : "unknown"))
        : error instanceof TypeError
          ? "network"
          : "unknown";
    return (
      <Alert variant="destructive" className="border-destructive/40 bg-destructive/5">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>{t("saas.errors.title")}</AlertTitle>
        <AlertDescription className="break-words">{t(`saas.errors.${key}`)}</AlertDescription>
      </Alert>
    );
  }
  return message ? (
    <Alert variant="success" role="status">
      <CircleCheck aria-hidden="true" />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  ) : null;
}
