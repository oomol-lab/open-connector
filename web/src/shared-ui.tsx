import type { ProviderDefinition } from "./model";
import type { ReactNode } from "react";

import { CircleAlert, Inbox } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge as UiBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export function Metric(props: { label: string; value: number }): ReactNode {
  return (
    <Card className="metric">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </Card>
  );
}

export function InfoBlock(props: { icon: ReactNode; label: string; value: string }): ReactNode {
  return (
    <div className="info-block">
      {props.icon}
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

export function Badge(props: { children: ReactNode; tone?: "success" | "warning" | "error" }): ReactNode {
  return (
    <UiBadge
      variant={props.tone === "error" ? "destructive" : "outline"}
      className={props.tone ? `badge ${props.tone}` : "badge"}
    >
      {props.children}
    </UiBadge>
  );
}

export function TagList(props: { values: string[]; empty: string }): ReactNode {
  const values = props.values.filter(Boolean);
  if (values.length === 0) return <p className="muted-copy">{props.empty}</p>;
  return (
    <div className="tag-list">
      {values.map((value) => (
        <span key={value} className="tag">
          {value}
        </span>
      ))}
    </div>
  );
}

export function ProviderIcon(props: { provider: ProviderDefinition; large?: boolean }): ReactNode {
  const letters = providerInitials(props.provider.displayName);
  const iconUrl = providerIconUrl(props.provider);
  const [failedIconUrl, setFailedIconUrl] = useState<string | null>(null);
  const className = props.large ? "provider-icon large" : "provider-icon";

  if (!iconUrl || failedIconUrl === iconUrl) {
    return <span className={className}>{letters}</span>;
  }

  return (
    <span className={className}>
      <img
        alt=""
        className="provider-icon-image"
        loading="lazy"
        referrerPolicy="no-referrer"
        src={iconUrl}
        onError={() => setFailedIconUrl(iconUrl)}
      />
    </span>
  );
}

export function providerInitials(displayName: string): string {
  return (
    displayName
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

export function providerIconUrl(provider: ProviderDefinition): string | undefined {
  const iconUrl = provider.iconUrl?.trim();
  if (iconUrl) {
    return iconUrl;
  }

  if (import.meta.env.VITE_PROVIDER_ICON_FAVICON_FALLBACK === "false") {
    return undefined;
  }

  const hostname = providerHomepageHostname(provider.homepageUrl);
  if (!hostname) {
    return undefined;
  }

  return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(hostname)}`;
}

function providerHomepageHostname(homepageUrl: string | undefined): string | undefined {
  if (!homepageUrl) {
    return undefined;
  }

  try {
    return new URL(homepageUrl).hostname;
  } catch {
    return undefined;
  }
}

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: ReactNode | null;
  density?: "regular" | "compact";
  tone?: "neutral" | "success";
}

export function EmptyState(props: EmptyStateProps): ReactNode {
  const icon = props.icon === undefined ? <Inbox size={20} /> : props.icon;
  const className = [
    "empty-state",
    props.density === "compact" ? "compact" : undefined,
    props.tone === "success" ? "success" : undefined,
    icon == null ? "no-icon" : undefined,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className}>
      {icon}
      <strong>{props.title}</strong>
      <p>{props.description}</p>
    </div>
  );
}

export function InlineError(props: { message: string }): ReactNode {
  return (
    <Alert variant="destructive" className="inline-error">
      <CircleAlert size={16} />
      <AlertDescription>{props.message}</AlertDescription>
    </Alert>
  );
}

export function FormStatus(props: { message: string }): ReactNode {
  return (
    <Alert className="status-alert" role="status">
      <AlertDescription>{props.message}</AlertDescription>
    </Alert>
  );
}

export function StatusDot(props: { ok: boolean }): ReactNode {
  return <span className={props.ok ? "status-dot ok" : "status-dot error"} />;
}
