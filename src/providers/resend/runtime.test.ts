import { describe, expect, it } from "vitest";
import { validateActionInput } from "../../core/validation.ts";
import { resendActions } from "./actions.ts";
import { resendActionHandlers, validateResendCredential } from "./runtime.ts";

describe("Resend email runtime", () => {
  it("maps batch email fields and preserves request idempotency", async () => {
    const requests: Array<{ url: string; method: string; headers: Headers; body: unknown }> = [];
    const fetcher = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      requests.push({
        url: String(input),
        method: init?.method ?? "GET",
        headers: new Headers(init?.headers),
        body: JSON.parse(String(init?.body)) as unknown,
      });
      return Response.json({ data: [{ id: "email-1" }, { id: "email-2" }] });
    };

    const output = await resendActionHandlers.send_batch_emails!(
      {
        idempotencyKey: "batch-123",
        emails: [
          {
            from: "Sender <sender@example.com>",
            to: ["first@example.com"],
            subject: "First",
            html: "<p>First</p>",
            cc: ["copy@example.com"],
            tags: [{ name: "kind", value: "welcome" }],
          },
          {
            from: "sender@example.com",
            to: ["second@example.com"],
            subject: "Second",
            template: { id: "welcome", variables: { NAME: "Ada", COUNT: 2 } },
          },
        ],
      },
      { apiKey: "re_test", fetcher },
    );

    expect(output).toEqual({ emailIds: ["email-1", "email-2"] });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("https://api.resend.com/emails/batch");
    expect(requests[0]?.method).toBe("POST");
    expect(requests[0]?.headers.get("authorization")).toBe("Bearer re_test");
    expect(requests[0]?.headers.get("idempotency-key")).toBe("batch-123");
    expect(requests[0]?.body).toEqual([
      {
        from: "Sender <sender@example.com>",
        to: ["first@example.com"],
        subject: "First",
        html: "<p>First</p>",
        cc: ["copy@example.com"],
        tags: [{ name: "kind", value: "welcome" }],
      },
      {
        from: "sender@example.com",
        to: ["second@example.com"],
        subject: "Second",
        template: { id: "welcome", variables: { NAME: "Ada", COUNT: 2 } },
      },
    ]);
  });

  it("rejects combining a batch template with message content", async () => {
    const input = {
      emails: [
        {
          from: "sender@example.com",
          to: ["recipient@example.com"],
          subject: "Welcome",
          html: "<p>Welcome</p>",
          template: { id: "welcome" },
        },
      ],
    };
    const action = resendActions.find(({ name }) => name === "send_batch_emails")!;

    expect(validateActionInput(action, input).valid).toBe(false);

    let requested = false;
    const fetcher = async (): Promise<Response> => {
      requested = true;
      return Response.json({});
    };
    await expect(resendActionHandlers.send_batch_emails!(input, { apiKey: "re_test", fetcher })).rejects.toMatchObject({
      status: 400,
      message: "template cannot be used with html or text",
    });
    expect(requested).toBe(false);
  });

  it("passes sent email cursors and normalizes provider fields", async () => {
    let requestUrl = "";
    const fetcher = async (input: string | URL | Request): Promise<Response> => {
      requestUrl = String(input);
      return Response.json({
        object: "list",
        has_more: true,
        data: [
          {
            id: "email-1",
            message_id: "message-1",
            to: ["person@example.com"],
            from: "sender@example.com",
            created_at: "2026-08-11T10:00:00.000Z",
            subject: "Status",
            bcc: null,
            cc: ["copy@example.com"],
            reply_to: null,
            last_event: "delivered",
            scheduled_at: null,
          },
        ],
      });
    };

    const output = await resendActionHandlers.list_sent_emails!(
      { limit: 25, after: "email-0" },
      { apiKey: "re_test", fetcher },
    );

    expect(requestUrl).toBe("https://api.resend.com/emails?limit=25&after=email-0");
    expect(output).toEqual({
      hasMore: true,
      emails: [
        {
          id: "email-1",
          messageId: "message-1",
          to: ["person@example.com"],
          from: "sender@example.com",
          createdAt: "2026-08-11T10:00:00.000Z",
          subject: "Status",
          bcc: null,
          cc: ["copy@example.com"],
          replyTo: null,
          lastEvent: "delivered",
          scheduledAt: null,
        },
      ],
    });
  });

  it("passes sent attachment cursors to Resend", async () => {
    let requestUrl = "";
    const fetcher = async (input: string | URL | Request): Promise<Response> => {
      requestUrl = String(input);
      return Response.json({ object: "list", has_more: false, data: [] });
    };

    const output = await resendActionHandlers.list_sent_email_attachments!(
      { emailId: "email-1", limit: 10, after: "attachment-1" },
      { apiKey: "re_test", fetcher },
    );

    expect(requestUrl).toBe("https://api.resend.com/emails/email-1/attachments?limit=10&after=attachment-1");
    expect(output).toEqual({ hasMore: false, attachments: [] });
  });

  it("rejects conflicting cursors before making a provider request", async () => {
    let requested = false;
    const fetcher = async (): Promise<Response> => {
      requested = true;
      return Response.json({});
    };

    await expect(
      resendActionHandlers.list_received_emails!(
        { after: "email-1", before: "email-2" },
        { apiKey: "re_test", fetcher },
      ),
    ).rejects.toMatchObject({ status: 400, message: "after and before cannot be used together" });
    expect(requested).toBe(false);
  });

  it("normalizes a received email list item without a subject", async () => {
    const fetcher = async (): Promise<Response> =>
      Response.json({
        object: "list",
        has_more: false,
        data: [
          {
            id: "received-1",
            message_id: "message-1",
            to: ["inbox@example.com"],
            from: "sender@example.com",
            created_at: "2026-08-11T11:00:00.000Z",
            subject: null,
            bcc: [],
            cc: [],
            reply_to: [],
            attachments: [],
          },
        ],
      });

    await expect(resendActionHandlers.list_received_emails!({}, { apiKey: "re_test", fetcher })).resolves.toMatchObject(
      { emails: [{ id: "received-1", subject: null }] },
    );
  });

  it("normalizes a received email without parsed headers", async () => {
    const fetcher = async (): Promise<Response> =>
      Response.json({
        id: "received-1",
        message_id: "message-1",
        to: ["inbox@example.com"],
        from: "sender@example.com",
        created_at: "2026-08-11T11:00:00.000Z",
        subject: "No headers",
        html: null,
        text: null,
        headers: null,
        bcc: [],
        cc: [],
        reply_to: [],
        raw: null,
        attachments: [],
      });

    await expect(
      resendActionHandlers.get_received_email!({ emailId: "received-1" }, { apiKey: "re_test", fetcher }),
    ).resolves.toMatchObject({ email: { id: "received-1", headers: null } });
  });

  it("normalizes an attachment without a filename", async () => {
    const fetcher = async (): Promise<Response> =>
      Response.json({
        object: "list",
        has_more: false,
        data: [
          {
            id: "attachment-1",
            filename: null,
            size: 4096,
            content_type: "application/octet-stream",
            content_disposition: null,
            content_id: null,
            download_url: "https://inbound-cdn.resend.com/attachment-1",
            expires_at: "2026-08-11T12:00:00.000Z",
          },
        ],
      });

    await expect(
      resendActionHandlers.list_received_email_attachments!({ emailId: "received-1" }, { apiKey: "re_test", fetcher }),
    ).resolves.toMatchObject({ attachments: [{ id: "attachment-1", filename: null }] });
  });

  it("normalizes received email content, raw download metadata, and attachments", async () => {
    const fetcher = async (input: string | URL | Request): Promise<Response> => {
      expect(String(input)).toBe("https://api.resend.com/emails/receiving/received-1");
      return Response.json({
        id: "received-1",
        message_id: "message-1",
        to: ["inbox@example.com"],
        from: "sender@example.com",
        created_at: "2026-08-11T11:00:00.000Z",
        subject: "Invoice",
        html: "<p>Attached</p>",
        text: null,
        headers: { "return-path": "sender@example.com" },
        bcc: [],
        cc: [],
        reply_to: ["reply@example.com"],
        raw: {
          download_url: "https://inbound-cdn.resend.com/raw/message-1",
          expires_at: "2026-08-11T12:00:00.000Z",
        },
        attachments: [
          {
            id: "attachment-1",
            filename: "invoice.pdf",
            size: 4096,
            content_type: "application/pdf",
            content_disposition: "attachment",
            content_id: null,
          },
        ],
      });
    };

    const output = await resendActionHandlers.get_received_email!(
      { emailId: "received-1" },
      { apiKey: "re_test", fetcher },
    );

    expect(output).toMatchObject({
      email: {
        id: "received-1",
        messageId: "message-1",
        html: "<p>Attached</p>",
        text: null,
        headers: { "return-path": "sender@example.com" },
        raw: {
          downloadUrl: "https://inbound-cdn.resend.com/raw/message-1",
          expiresAt: "2026-08-11T12:00:00.000Z",
        },
        attachments: [
          {
            id: "attachment-1",
            filename: "invoice.pdf",
            size: 4096,
            contentType: "application/pdf",
            contentDisposition: "attachment",
            contentId: null,
          },
        ],
      },
    });
  });

  it("classifies a restricted API key as sending access", async () => {
    const fetcher = async (input: string | URL | Request): Promise<Response> => {
      if (String(input).endsWith("/emails")) {
        return Response.json({ name: "validation_error", message: "from is required" }, { status: 400 });
      }
      return Response.json(
        { name: "restricted_api_key", message: "This API key is restricted to only send emails." },
        { status: 401 },
      );
    };

    await expect(validateResendCredential("re_test", fetcher)).resolves.toMatchObject({
      grantedScopes: ["sending_access"],
      metadata: { accessLevel: "sending_access" },
    });
  });

  it.each([
    [429, 429],
    [503, 502],
  ])("rejects a %i scope probe response with status %i", async (providerStatus, expectedStatus) => {
    const fetcher = async (input: string | URL | Request): Promise<Response> => {
      if (String(input).endsWith("/emails")) {
        return Response.json({ name: "validation_error", message: "from is required" }, { status: 400 });
      }
      return Response.json({ name: "provider_error", message: "probe failed" }, { status: providerStatus });
    };

    await expect(validateResendCredential("re_test", fetcher)).rejects.toMatchObject({
      status: expectedStatus,
      message: "probe failed",
    });
  });

  it.each([404, 409])("preserves provider status %i", async (status) => {
    const fetcher = async (): Promise<Response> =>
      Response.json({ name: "provider_error", message: "email operation failed" }, { status });

    await expect(
      resendActionHandlers.get_sent_email!({ emailId: "email-1" }, { apiKey: "re_test", fetcher }),
    ).rejects.toMatchObject({ status, message: "email operation failed" });
  });
});
