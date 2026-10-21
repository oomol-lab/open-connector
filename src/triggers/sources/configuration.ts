export interface CreateFeishuEventSource {
  readonly kind?: "feishu";
  readonly version: 1;
  readonly name: string;
  readonly connectionId: string;
  readonly teamId: string | null;
  readonly verificationToken: string;
  readonly encryptKey: string;
  readonly eventTypes: string[];
  readonly manageSubscriptions: boolean;
}

export interface CreateSlackEventSource {
  readonly kind: "slack";
  readonly version: 1;
  readonly name: string;
  readonly connectionId: string;
  readonly teamId: string | null;
  readonly appId: string;
  readonly workspaceId: string;
  readonly signingSecret: string;
  readonly eventTypes: string[];
}

export interface CreateIntercomEventSource {
  readonly kind: "intercom";
  readonly version: 1;
  readonly name: string;
  readonly connectionId: string;
  readonly teamId: string | null;
  readonly appId: string;
  readonly signingSecret: string;
  readonly eventTypes: string[];
}

export interface CreateSentryEventSource {
  readonly kind: "sentry";
  readonly version: 1;
  readonly name: string;
  readonly connectionId: string;
  readonly teamId: string | null;
  readonly appId: string;
  readonly installationId: string;
  readonly organizationId: string;
  readonly signingSecret: string;
  readonly eventTypes: string[];
}

export interface CreateZoomEventSource {
  readonly kind: "zoom";
  readonly version: 1;
  readonly name: string;
  readonly connectionId: string;
  readonly teamId: string | null;
  readonly appId: string;
  readonly signingSecret: string;
  readonly eventTypes: string[];
}

export interface CreateFirefliesEventSource {
  readonly kind: "fireflies";
  readonly version: 1;
  readonly name: string;
  readonly connectionId: string;
  readonly teamId: string | null;
  readonly signingSecret: string;
  readonly eventTypes: string[];
}

export interface CreateJiraEventSource {
  readonly kind: "jira";
  readonly version: 1;
  readonly name: string;
  readonly connectionId: string;
  readonly teamId: string | null;
  readonly project: string;
  readonly eventTypes: string[];
}

export type CreateEventSource =
  | CreateFeishuEventSource
  | CreateSlackEventSource
  | CreateIntercomEventSource
  | CreateSentryEventSource
  | CreateZoomEventSource
  | CreateFirefliesEventSource
  | CreateJiraEventSource;

export interface UpdateEventSource {
  readonly signingSecret?: string;
  readonly version: 1;
  readonly expectedRevision: number;
  readonly name: string;
  readonly enabled: boolean;
  readonly eventTypes: string[];
  readonly verificationToken?: string;
  readonly encryptKey?: string;
}

export interface EventSource {
  readonly version: 1;
  readonly sourceId: string;
  readonly revision: number;
  readonly name: string;
  readonly provider: "feishu" | "feishu_app_bot" | "slackbot" | "intercom" | "sentry" | "zoom" | "fireflies" | "jira";
  readonly appId: string;
  readonly workspaceId?: string;
  readonly installationId?: string;
  readonly organizationId?: string;
  readonly projectId?: string;
  readonly projectKey?: string;
  readonly subscriptionStatus?: "idle" | "pending" | "ready" | "error";
  readonly lastError?: string;
  readonly signingSecretConfigured?: boolean;
  readonly connectionId: string;
  readonly teamId: string | null;
  readonly enabled: boolean;
  readonly eventTypes: string[];
  readonly manageSubscriptions: boolean;
  readonly verificationTokenConfigured: boolean;
  readonly encryptKeyConfigured: boolean;
  readonly endpointUrl: string | null;
  readonly verifiedAt: string | null;
  readonly lastReceivedAt: string | null;
  readonly updatedAt: string;
  readonly consumers: { flowId: string; flowName: string; triggerNodeId: string }[];
}
