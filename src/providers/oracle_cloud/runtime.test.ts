import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { oracleCloudActions } from "./actions.ts";
import {
  buildOracleApiBaseUrl,
  createOracleCloudContext,
  oracleCloudActionHandlers,
  validateOracleCloudCredential,
} from "./runtime.ts";

const privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 })
  .privateKey.export({ type: "pkcs8", format: "pem" })
  .toString();
const values = {
  tenancyId: "ocid1.tenancy.oc1..tenancy",
  userId: "ocid1.user.oc1..user",
  fingerprint: "00:11:22:33:44:55:66:77:88:99:aa:bb:cc:dd:ee:ff",
  privateKey,
  region: "us-ashburn-1",
  realm: "oc1",
  defaultCompartmentId: "ocid1.compartment.oc1..default",
};

describe("Oracle Cloud provider contract", () => {
  it("defines one runtime handler for every catalog action", () => {
    expect(oracleCloudActions).toHaveLength(34);
    expect(oracleCloudActions.map((action) => action.name).sort()).toEqual(
      [
        "create_subnet",
        "create_vcn",
        "delete_vcn",
        "get_compartment_by_name",
        "get_current_tenancy",
        "get_current_user",
        "get_image",
        "get_instance",
        "get_metrics_data",
        "get_network_security_group",
        "get_security_list",
        "get_subnet",
        "get_tenancy",
        "get_vcn",
        "get_vnic",
        "get_vnic_attachment",
        "instance_action",
        "launch_instance",
        "list_alarms",
        "list_availability_domains",
        "list_compartments",
        "list_images",
        "list_instance_agent_command_executions",
        "list_instances",
        "list_metric_definitions",
        "list_network_security_groups",
        "list_security_lists",
        "list_subnets",
        "list_subscribed_regions",
        "list_vcns",
        "list_vnic_attachments",
        "run_instance_agent_command",
        "terminate_instance",
        "update_instance",
      ].sort(),
    );
    expect(Object.keys(oracleCloudActionHandlers).sort()).toEqual(
      oracleCloudActions.map((action) => action.name).sort(),
    );
  });

  it("validates credentials with a signed instance-list request", async () => {
    const fetchMock = vi.fn(async (input: URL | RequestInfo, _init?: RequestInit) => {
      const url = new URL(input.toString());
      expect(url.origin).toBe("https://iaas.us-ashburn-1.oraclecloud.com");
      expect(url.pathname).toBe("/20160918/instances");
      expect(url.searchParams.get("compartmentId")).toBe(values.defaultCompartmentId);
      expect(url.searchParams.get("limit")).toBe("1");
      return jsonResponse([], { "opc-request-id": "request-1" });
    });
    const fetcher = fetchMock as unknown as typeof fetch;

    await expect(validateOracleCloudCredential(values, fetcher)).resolves.toMatchObject({
      profile: { accountId: values.userId, displayName: "OCI us-ashburn-1" },
      metadata: {
        region: "us-ashburn-1",
        realm: "oc1",
        defaultCompartmentId: values.defaultCompartmentId,
      },
    });
    expect(fetcher).toHaveBeenCalledOnce();
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get("authorization")).toMatch(/^Signature version="1"/u);
  });

  it("lists instances with filters and preserves OCI pagination metadata", async () => {
    const fetcher = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(input.toString());
      expect(url.searchParams.get("compartmentId")).toBe(values.defaultCompartmentId);
      expect(url.searchParams.get("lifecycleState")).toBe("RUNNING");
      expect(url.searchParams.get("limit")).toBe("25");
      return jsonResponse([{ id: "ocid1.instance.oc1..instance", compartmentId: values.defaultCompartmentId }], {
        "opc-next-page": "next-token",
        "opc-request-id": "request-2",
      });
    }) as unknown as typeof fetch;
    const context = createOracleCloudContext(values, fetcher);

    await expect(
      oracleCloudActionHandlers.list_instances({ lifecycleState: "RUNNING", limit: 25 }, context),
    ).resolves.toEqual({
      instances: [{ id: "ocid1.instance.oc1..instance", compartmentId: values.defaultCompartmentId }],
      nextPage: "next-token",
      opcRequestId: "request-2",
    });
  });

  it("retrieves VNIC IP data by OCID", async () => {
    const vnicId = "ocid1.vnic.oc1..vnic";
    const fetcher = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(input.toString());
      expect(url.pathname).toBe(`/20160918/vnics/${vnicId}`);
      return jsonResponse({ id: vnicId, subnetId: "ocid1.subnet.oc1..subnet", privateIp: "10.0.0.2" });
    }) as unknown as typeof fetch;

    await expect(
      oracleCloudActionHandlers.get_vnic({ vnicId }, createOracleCloudContext(values, fetcher)),
    ).resolves.toMatchObject({ vnic: { id: vnicId, privateIp: "10.0.0.2" } });
  });

  it("sends curated lifecycle actions as signed POST requests", async () => {
    const instanceId = "ocid1.instance.oc1..instance";
    const fetcher = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = new URL(input.toString());
      expect(url.pathname).toBe(`/20160918/instances/${instanceId}`);
      expect(url.searchParams.get("action")).toBe("SOFTRESET");
      expect(init?.method).toBe("POST");
      expect(init?.body).toBe("{}");
      expect(new Headers(init?.headers).get("x-content-sha256")).toBeTruthy();
      return jsonResponse({ id: instanceId, compartmentId: values.defaultCompartmentId, lifecycleState: "STOPPING" });
    }) as unknown as typeof fetch;

    await expect(
      oracleCloudActionHandlers.instance_action(
        { instanceId, action: "SOFTRESET" },
        createOracleCloudContext(values, fetcher),
      ),
    ).resolves.toMatchObject({ instance: { id: instanceId, lifecycleState: "STOPPING" } });
  });

  it("launches, updates, and terminates instances with official request shapes", async () => {
    const instanceId = "ocid1.instance.oc1..instance";
    const fetcher = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = new URL(input.toString());
      if (init?.method === "POST") {
        expect(url.pathname).toBe("/20160918/instances");
        expect(JSON.parse(String(init.body))).toMatchObject({
          displayName: "web-1",
          shape: "VM.Standard.E5.Flex",
          sourceDetails: { sourceType: "image", imageId: "ocid1.image.oc1..image" },
          createVnicDetails: { subnetId: "ocid1.subnet.oc1..subnet" },
        });
        return jsonResponse({ id: instanceId });
      }
      if (init?.method === "PUT") {
        expect(JSON.parse(String(init.body))).toEqual({ shapeConfig: { ocpus: 2, memoryInGBs: 16 } });
        return jsonResponse({ id: instanceId });
      }
      expect(init?.method).toBe("DELETE");
      return new Response(null, { status: 204, headers: { "opc-request-id": "deleted" } });
    }) as unknown as typeof fetch;
    const context = createOracleCloudContext(values, fetcher);

    await oracleCloudActionHandlers.launch_instance(
      {
        displayName: "web-1",
        availabilityDomain: "aBCD:US-ASHBURN-AD-1",
        subnetId: "ocid1.subnet.oc1..subnet",
        imageId: "ocid1.image.oc1..image",
      },
      context,
    );
    await oracleCloudActionHandlers.update_instance({ instanceId, ocpus: 2, memoryInGBs: 16 }, context);
    await expect(oracleCloudActionHandlers.terminate_instance({ instanceId }, context)).resolves.toEqual({
      status: 204,
      opcRequestId: "deleted",
    });
  });

  it("uses Monitoring POST actions and preserves pagination", async () => {
    const fetcher = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = new URL(input.toString());
      expect(url.origin).toBe("https://telemetry.us-ashburn-1.oraclecloud.com");
      expect(url.pathname).toBe("/20180401/metrics/actions/listMetrics");
      expect(url.searchParams.get("compartmentId")).toBe(values.defaultCompartmentId);
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({ groupBy: ["namespace"], namespace: "oci_computeagent" });
      return jsonResponse([{ namespace: "oci_computeagent", name: "CpuUtilization" }], {
        "opc-next-page": "metrics-next",
      });
    }) as unknown as typeof fetch;

    await expect(
      oracleCloudActionHandlers.list_metric_definitions(
        { groupBy: ["namespace"], namespace: "oci_computeagent" },
        createOracleCloudContext(values, fetcher),
      ),
    ).resolves.toMatchObject({ metrics: [{ name: "CpuUtilization" }], nextPage: "metrics-next" });
  });

  it("resolves current identity through the Identity service endpoint", async () => {
    const fetcher = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(input.toString());
      expect(url.origin).toBe("https://identity.us-ashburn-1.oci.oraclecloud.com");
      expect(url.pathname).toBe(`/20160918/users/${values.userId}`);
      return jsonResponse({ id: values.userId, name: "api-user" });
    }) as unknown as typeof fetch;

    await expect(
      oracleCloudActionHandlers.get_current_user({}, createOracleCloudContext(values, fetcher)),
    ).resolves.toMatchObject({ user: { name: "api-user" } });
  });

  it("creates and reads an Instance Agent command through the 20180530 API", async () => {
    const commandId = "ocid1.instanceagentcommand.oc1..command";
    const instanceId = "ocid1.instance.oc1..instance";
    const fetcher = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = new URL(input.toString());
      expect(url.pathname.startsWith("/20180530/")).toBe(true);
      if (init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toMatchObject({
          target: { instanceId },
          content: { source: { sourceType: "TEXT", text: "uptime" }, output: { outputType: "TEXT" } },
          executionTimeOutInSeconds: 30,
        });
        return jsonResponse({ id: commandId });
      }
      expect(url.pathname).toBe(`/20180530/instanceAgentCommands/${commandId}/status`);
      expect(url.searchParams.get("instanceId")).toBe(instanceId);
      return jsonResponse({ lifecycleState: "SUCCEEDED", exitCode: 0 });
    }) as unknown as typeof fetch;

    await expect(
      oracleCloudActionHandlers.run_instance_agent_command(
        { instanceId, displayName: "uptime", script: "uptime" },
        createOracleCloudContext(values, fetcher),
      ),
    ).resolves.toMatchObject({ commandExecution: { lifecycleState: "SUCCEEDED", exitCode: 0 } });
  });

  it("returns the execution as soon as it reaches a terminal state such as TIMED_OUT", async () => {
    const commandId = "ocid1.instanceagentcommand.oc1..command";
    const fetcher = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      if (init?.method === "POST") return jsonResponse({ id: commandId });
      const url = new URL(input.toString());
      expect(url.pathname).toBe(`/20180530/instanceAgentCommands/${commandId}/status`);
      return jsonResponse({ lifecycleState: "TIMED_OUT", exitCode: 124 });
    }) as unknown as typeof fetch;

    await expect(
      oracleCloudActionHandlers.run_instance_agent_command(
        { instanceId: "ocid1.instance.oc1..instance", displayName: "sleep", script: "sleep 300" },
        createOracleCloudContext(values, fetcher),
      ),
    ).resolves.toMatchObject({ commandExecution: { lifecycleState: "TIMED_OUT", exitCode: 124 } });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejects Instance Agent command timeouts beyond the four-minute polling contract", async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;

    await expect(
      oracleCloudActionHandlers.run_instance_agent_command(
        {
          instanceId: "ocid1.instance.oc1..instance",
          displayName: "long-command",
          script: "sleep 300",
          executionTimeoutInSeconds: 300,
        },
        createOracleCloudContext(values, fetcher),
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: "executionTimeoutInSeconds must be between 1 and 240",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("includes the tenancy root only on the first page of a tenancy listing", async () => {
    const firstPageFetcher = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(input.toString());
      if (url.pathname === "/20160918/compartments") {
        return jsonResponse([{ id: "ocid1.compartment.oc1..child" }], { "opc-next-page": "page-2" });
      }
      expect(url.pathname).toBe(`/20160918/compartments/${values.tenancyId}`);
      return jsonResponse({ id: values.tenancyId, name: "root" });
    }) as unknown as typeof fetch;

    await expect(
      oracleCloudActionHandlers.list_compartments(
        { compartmentId: values.tenancyId },
        createOracleCloudContext(values, firstPageFetcher),
      ),
    ).resolves.toMatchObject({
      compartments: [{ id: "ocid1.compartment.oc1..child" }, { id: values.tenancyId, name: "root" }],
      nextPage: "page-2",
    });
    expect(firstPageFetcher).toHaveBeenCalledTimes(2);

    const nextPageFetcher = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(input.toString());
      expect(url.pathname).toBe("/20160918/compartments");
      expect(url.searchParams.get("page")).toBe("page-2");
      return jsonResponse([{ id: "ocid1.compartment.oc1..next-child" }]);
    }) as unknown as typeof fetch;

    await expect(
      oracleCloudActionHandlers.list_compartments(
        { compartmentId: values.tenancyId, page: "page-2" },
        createOracleCloudContext(values, nextPageFetcher),
      ),
    ).resolves.toMatchObject({ compartments: [{ id: "ocid1.compartment.oc1..next-child" }] });
    expect(nextPageFetcher).toHaveBeenCalledOnce();
  });

  it("omits the tenancy root when listing a child compartment", async () => {
    const fetcher = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(input.toString());
      expect(url.pathname).toBe("/20160918/compartments");
      expect(url.searchParams.get("compartmentId")).toBe(values.defaultCompartmentId);
      return jsonResponse([{ id: "ocid1.compartment.oc1..grandchild" }]);
    }) as unknown as typeof fetch;

    await expect(
      oracleCloudActionHandlers.list_compartments({}, createOracleCloudContext(values, fetcher)),
    ).resolves.toMatchObject({ compartments: [{ id: "ocid1.compartment.oc1..grandchild" }] });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("keeps a tenancy listing usable when the root compartment is not readable", async () => {
    const fetcher = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(input.toString());
      if (url.pathname === "/20160918/compartments") {
        return jsonResponse([{ id: "ocid1.compartment.oc1..child" }]);
      }
      return jsonResponse({ code: "NotAuthorizedOrNotFound", message: "Authorization failed." }, {}, 404);
    }) as unknown as typeof fetch;

    await expect(
      oracleCloudActionHandlers.list_compartments(
        { compartmentId: values.tenancyId },
        createOracleCloudContext(values, fetcher),
      ),
    ).resolves.toMatchObject({ compartments: [{ id: "ocid1.compartment.oc1..child" }] });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("normalizes response body read failures while the request timeout is active", async () => {
    const fetcher = vi.fn(async () => {
      return {
        text: async () => {
          throw new TypeError("response stream failed");
        },
      } as unknown as Response;
    }) as unknown as typeof fetch;

    await expect(
      oracleCloudActionHandlers.list_instances({}, createOracleCloudContext(values, fetcher)),
    ).rejects.toMatchObject({ status: 502, message: "OCI request failed: response stream failed" });
  });

  it("accepts a signed 403 response as valid credentials with insufficient Compute permissions", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({ code: "NotAuthorized", message: "The principal lacks INSTANCE_READ." }, {}, 403),
    ) as unknown as typeof fetch;

    await expect(validateOracleCloudCredential(values, fetcher)).resolves.toMatchObject({
      profile: { accountId: values.userId, displayName: "OCI us-ashburn-1" },
    });
  });

  it("maps OCI authorization failures during credential validation to invalid credentials", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({ code: "NotAuthenticated", message: "The required information was not supplied." }, {}, 401),
    ) as unknown as typeof fetch;

    await expect(validateOracleCloudCredential(values, fetcher)).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("NotAuthenticated"),
    });
  });

  it("rejects unsupported realms and unsafe region values before making a request", () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    expect(() => createOracleCloudContext({ ...values, realm: "unknown" }, fetcher)).toThrow("realm must be one of");
    expect(() => createOracleCloudContext({ ...values, realm: "toString" }, fetcher)).toThrow("realm must be one of");
    expect(() => createOracleCloudContext({ ...values, region: "example.com/path" }, fetcher)).toThrow(
      "region must be a valid OCI region identifier",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("OCI endpoint resolution", () => {
  it("uses the official second-level domain for each supported realm", () => {
    expect(buildOracleApiBaseUrl("us-ashburn-1", "oc1")).toBe("https://iaas.us-ashburn-1.oraclecloud.com/20160918");
    expect(buildOracleApiBaseUrl("us-langley-1", "oc2")).toBe("https://iaas.us-langley-1.oraclegovcloud.com/20160918");
    expect(buildOracleApiBaseUrl("eu-frankfurt-2", "oc19")).toBe("https://iaas.eu-frankfurt-2.oraclecloud.eu/20160918");
    expect(buildOracleApiBaseUrl("us-ashburn-1", "oc1", "monitoring")).toBe(
      "https://telemetry.us-ashburn-1.oraclecloud.com/20180401",
    );
    expect(buildOracleApiBaseUrl("us-ashburn-1", "oc1", "identity")).toBe(
      "https://identity.us-ashburn-1.oci.oraclecloud.com/20160918",
    );
    expect(buildOracleApiBaseUrl("us-ashburn-1", "oc1", "instanceAgent")).toBe(
      "https://iaas.us-ashburn-1.oraclecloud.com/20180530",
    );
  });
});

function jsonResponse(body: unknown, headers: Record<string, string> = {}, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}
