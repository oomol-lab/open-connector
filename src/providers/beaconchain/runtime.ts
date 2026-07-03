import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { BeaconchainActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

type BeaconchainRequestPhase = "validate" | "execute";
type BeaconchainActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type BeaconchainActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const beaconchainApiBaseUrl = "https://beaconcha.in";

export const beaconchainActionHandlers: Record<BeaconchainActionName, BeaconchainActionHandler> = {
  get_staking_queues(input, context) {
    return getStakingQueues(input, context);
  },
  get_network_performance(input, context) {
    return getNetworkPerformance(input, context);
  },
  get_validator(input, context) {
    return getValidator(input, context);
  },
  list_validators(input, context) {
    return listValidators(input, context);
  },
  get_validator_consensus_rewards(input, context) {
    return getValidatorConsensusRewards(input, context);
  },
};

export async function validateBeaconchainCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestBeaconchainJson(
    "/api/v2/ethereum/queues",
    { chain: "mainnet" },
    { apiKey, fetcher, signal },
    "validate",
  );
  const data = readRequiredObject(payload.data, "data");
  const depositQueue = readRequiredObject(data.deposit_queue, "data.deposit_queue");
  const exitQueue = readRequiredObject(data.exit_queue, "data.exit_queue");

  return {
    profile: {
      accountId: "beaconchain:mainnet",
      displayName: "Beaconcha.in API Key",
      grantedScopes: [],
    },
    metadata: {
      apiBaseUrl: beaconchainApiBaseUrl,
      validationEndpoint: "/api/v2/ethereum/queues",
      chain: "mainnet",
      finality: readRequiredString(data.finality, "data.finality"),
      depositQueueCount: readRequiredInteger(depositQueue.deposit_count, "data.deposit_queue.deposit_count"),
      exitQueueCount: readRequiredInteger(exitQueue.count, "data.exit_queue.count"),
    },
  };
}

async function getStakingQueues(input: Record<string, unknown>, context: BeaconchainActionContext): Promise<unknown> {
  const payload = await requestBeaconchainJson(
    "/api/v2/ethereum/queues",
    {
      chain: readChain(input),
    },
    context,
    "execute",
  );
  const data = readRequiredObject(payload.data, "data");
  const depositQueue = readRequiredObject(data.deposit_queue, "data.deposit_queue");
  const exitQueue = readRequiredObject(data.exit_queue, "data.exit_queue");
  const withdrawalSweep = readRequiredObject(data.withdrawal_sweep, "data.withdrawal_sweep");

  return {
    queues: {
      finality: readRequiredString(data.finality, "data.finality"),
      depositQueue: {
        churnWei: readRequiredScalarString(depositQueue.churn, "data.deposit_queue.churn"),
        depositCount: readRequiredInteger(depositQueue.deposit_count, "data.deposit_queue.deposit_count"),
        balanceWei: readRequiredScalarString(depositQueue.balance, "data.deposit_queue.balance"),
        estimatedProcessedAt: readRequiredInteger(
          depositQueue.estimated_processed_at,
          "data.deposit_queue.estimated_processed_at",
        ),
      },
      exitQueue: {
        churnWei: readRequiredScalarString(exitQueue.churn, "data.exit_queue.churn"),
        count: readRequiredInteger(exitQueue.count, "data.exit_queue.count"),
        balanceWei: readRequiredScalarString(exitQueue.balance, "data.exit_queue.balance"),
        estimatedProcessedAt: readRequiredInteger(
          exitQueue.estimated_processed_at,
          "data.exit_queue.estimated_processed_at",
        ),
      },
      withdrawalSweep: {
        lastSweptValidatorIndex: readRequiredInteger(
          withdrawalSweep.last_swept_validator_index,
          "data.withdrawal_sweep.last_swept_validator_index",
        ),
        estimatedSweepDelay: readRequiredInteger(
          withdrawalSweep.estimated_sweep_delay,
          "data.withdrawal_sweep.estimated_sweep_delay",
        ),
      },
    },
  };
}

async function getNetworkPerformance(
  input: Record<string, unknown>,
  context: BeaconchainActionContext,
): Promise<unknown> {
  const payload = await requestBeaconchainJson(
    "/api/v2/ethereum/performance-aggregate",
    {
      chain: readChain(input),
      range: {
        evaluation_window: readRequiredInputString(input.evaluationWindow, "evaluationWindow"),
      },
    },
    context,
    "execute",
  );
  const data = readRequiredObject(payload.data, "data");
  const beaconscore = readRequiredObject(data.beaconscore, "data.beaconscore");
  const duties = readRequiredObject(data.duties, "data.duties");
  const attestation = readRequiredObject(duties.attestation, "data.duties.attestation");
  const syncCommittee = readRequiredObject(duties.sync_committee, "data.duties.sync_committee");
  const proposal = readRequiredObject(duties.proposal, "data.duties.proposal");

  return {
    performance: {
      finality: readRequiredString(data.finality, "data.finality"),
      beaconScore: {
        total: readRequiredNumber(beaconscore.total, "data.beaconscore.total"),
        attestation: readRequiredNumber(beaconscore.attestation, "data.beaconscore.attestation"),
        proposal: readRequiredNumber(beaconscore.proposal, "data.beaconscore.proposal"),
        syncCommittee: readRequiredNumber(beaconscore.sync_committee, "data.beaconscore.sync_committee"),
      },
      duties: {
        attestation: {
          included: readRequiredInteger(attestation.included, "data.duties.attestation.included"),
          assigned: readRequiredInteger(attestation.assigned, "data.duties.attestation.assigned"),
          correctHead: readRequiredInteger(attestation.correct_head, "data.duties.attestation.correct_head"),
          correctSource: readRequiredInteger(attestation.correct_source, "data.duties.attestation.correct_source"),
          correctTarget: readRequiredInteger(attestation.correct_target, "data.duties.attestation.correct_target"),
          valuableCorrectHead: readRequiredInteger(
            attestation.valuable_correct_head,
            "data.duties.attestation.valuable_correct_head",
          ),
          valuableCorrectSource: readRequiredInteger(
            attestation.valuable_correct_source,
            "data.duties.attestation.valuable_correct_source",
          ),
          valuableCorrectTarget: readRequiredInteger(
            attestation.valuable_correct_target,
            "data.duties.attestation.valuable_correct_target",
          ),
          avgInclusionDelay: readRequiredNumber(
            attestation.avg_inclusion_delay,
            "data.duties.attestation.avg_inclusion_delay",
          ),
          avgInclusionDelayExcludingMissedSlots: readRequiredNumber(
            attestation.avg_inclusion_delay_excluding_missed_slots,
            "data.duties.attestation.avg_inclusion_delay_excluding_missed_slots",
          ),
          missed: readRequiredInteger(attestation.missed, "data.duties.attestation.missed"),
        },
        syncCommittee: {
          successful: readRequiredInteger(syncCommittee.successful, "data.duties.sync_committee.successful"),
          assigned: readRequiredInteger(syncCommittee.assigned, "data.duties.sync_committee.assigned"),
          missed: readRequiredInteger(syncCommittee.missed, "data.duties.sync_committee.missed"),
          scheduled: readRequiredInteger(syncCommittee.scheduled, "data.duties.sync_committee.scheduled"),
        },
        proposal: {
          successful: readRequiredInteger(proposal.successful, "data.duties.proposal.successful"),
          assigned: readRequiredInteger(proposal.assigned, "data.duties.proposal.assigned"),
          missed: readRequiredInteger(proposal.missed, "data.duties.proposal.missed"),
          includedSlashings: readRequiredInteger(
            proposal.included_slashings,
            "data.duties.proposal.included_slashings",
          ),
        },
      },
    },
    range: normalizeRange(payload.range),
  };
}

async function getValidator(input: Record<string, unknown>, context: BeaconchainActionContext): Promise<unknown> {
  const payload = await requestBeaconchainJson(
    "/api/v2/ethereum/validators",
    buildValidatorsBody(
      {
        validatorIdentifiers: [readRequiredValidatorIdentifier(input.validatorIdentifier, "validatorIdentifier")],
        chain: readChain(input),
      },
      false,
    ),
    context,
    "execute",
  );

  const validators = normalizeValidators(readRequiredArray(payload.data, "data"));
  if (validators.length === 0) {
    throw new ProviderRequestError(400, "beaconchain returned no validators");
  }

  return {
    validator: validators[0],
    range: normalizeRange(payload.range),
  };
}

async function listValidators(input: Record<string, unknown>, context: BeaconchainActionContext): Promise<unknown> {
  const payload = await requestBeaconchainJson(
    "/api/v2/ethereum/validators",
    buildValidatorsBody(
      {
        validatorIdentifiers: readRequiredValidatorIdentifiers(input.validatorIdentifiers),
        chain: readChain(input),
        cursor: optionalString(input.cursor),
        pageSize: readOptionalInteger(input.pageSize),
      },
      true,
    ),
    context,
    "execute",
  );

  return {
    validators: normalizeValidators(readRequiredArray(payload.data, "data")),
    range: normalizeRange(payload.range),
    paging: normalizePaging(payload.paging),
  };
}

async function getValidatorConsensusRewards(
  input: Record<string, unknown>,
  context: BeaconchainActionContext,
): Promise<unknown> {
  const payload = await requestBeaconchainJson(
    "/api/v2/ethereum/validators/rewards-list",
    compactObject({
      validator: {
        validator_identifiers: readRequiredValidatorIdentifiers(input.validatorIdentifiers),
      },
      epoch: readOptionalInteger(input.epoch),
      chain: readChain(input),
      cursor: optionalString(input.cursor),
      page_size: readOptionalInteger(input.pageSize),
    }),
    context,
    "execute",
  );

  return {
    rewards: normalizeRewards(readRequiredArray(payload.data, "data")),
    range: normalizeRange(payload.range),
    paging: normalizePaging(payload.paging),
  };
}

function buildValidatorsBody(
  input: {
    validatorIdentifiers: Array<number | string>;
    chain: "mainnet" | "hoodi";
    cursor?: string;
    pageSize?: number;
  },
  includePaging: boolean,
): Record<string, unknown> {
  return compactObject({
    validator: {
      validator_identifiers: input.validatorIdentifiers,
    },
    chain: input.chain,
    cursor: includePaging ? input.cursor : undefined,
    page_size: includePaging ? input.pageSize : undefined,
  });
}

async function requestBeaconchainJson(
  path: string,
  body: Record<string, unknown>,
  context: BeaconchainActionContext,
  phase: BeaconchainRequestPhase,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await context.fetcher(new URL(path, beaconchainApiBaseUrl), {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(body),
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Beaconcha.in request failed: ${error.message}` : "Beaconcha.in request failed",
    );
  }

  if (!response.ok) {
    const payload = await readBeaconchainErrorPayload(response);
    throw buildBeaconchainError(response.status, payload, phase);
  }

  const payload = await readBeaconchainPayload(response);
  return readRequiredObject(payload, "payload");
}

async function readBeaconchainPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    throw new ProviderRequestError(502, "Beaconcha.in returned an empty response");
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Beaconcha.in returned invalid JSON");
  }
}

async function readBeaconchainErrorPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function buildBeaconchainError(
  httpStatus: number,
  payload: unknown,
  phase: BeaconchainRequestPhase,
): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(payload) ??
    optionalString(record?.error) ??
    optionalString(record?.message) ??
    `Beaconcha.in request failed with ${httpStatus || 500}`;

  if (httpStatus === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (httpStatus === 400 || httpStatus === 404) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(httpStatus >= 400 ? httpStatus : 502, message, payload);
}

function normalizeValidators(value: unknown[]): unknown[] {
  return value.map((item, index) => normalizeValidator(readRequiredObject(item, `data[${index}]`)));
}

function normalizeValidator(value: Record<string, unknown>): Record<string, unknown> {
  const validator = readRequiredObject(value.validator, "validator");
  const withdrawalCredentials = readRequiredObject(value.withdrawal_credentials, "withdrawal_credentials");
  const lifeCycleEpochs = readRequiredObject(value.life_cycle_epochs, "life_cycle_epochs");
  const balances = readRequiredObject(value.balances, "balances");

  return {
    validatorIndex: readRequiredInteger(validator.index, "validator.index"),
    publicKey: readRequiredString(validator.public_key, "validator.public_key"),
    slashed: readRequiredBoolean(value.slashed, "slashed"),
    status: readRequiredString(value.status, "status"),
    online: readRequiredBoolean(value.online, "online"),
    finality: readRequiredString(value.finality, "finality"),
    balances: {
      currentGwei: readRequiredScalarString(balances.current, "balances.current"),
      effectiveGwei: readRequiredScalarString(balances.effective, "balances.effective"),
    },
    withdrawalCredentials: {
      type: readRequiredString(withdrawalCredentials.type, "withdrawal_credentials.type"),
      prefix: readRequiredString(withdrawalCredentials.prefix, "withdrawal_credentials.prefix"),
      credential: readRequiredString(withdrawalCredentials.credential, "withdrawal_credentials.credential"),
      address: readNullableString(withdrawalCredentials.address),
    },
    lifeCycleEpochs: {
      activationEligibility: readRequiredInteger(
        lifeCycleEpochs.activation_eligibility,
        "life_cycle_epochs.activation_eligibility",
      ),
      activation: readRequiredInteger(lifeCycleEpochs.activation, "life_cycle_epochs.activation"),
      exit: readRequiredInteger(lifeCycleEpochs.exit, "life_cycle_epochs.exit"),
      withdrawable: readRequiredInteger(lifeCycleEpochs.withdrawable, "life_cycle_epochs.withdrawable"),
    },
  };
}

function normalizeRewards(value: unknown[]): unknown[] {
  return value.map((item, index) => {
    const reward = readRequiredObject(item, `data[${index}]`);
    const validator = readRequiredObject(reward.validator, `data[${index}].validator`);

    return {
      validatorIndex: readRequiredInteger(validator.index, `data[${index}].validator.index`),
      publicKey: readRequiredString(validator.public_key, `data[${index}].validator.public_key`),
      totalGwei: readRequiredScalarString(reward.total, `data[${index}].total`),
      totalRewardGwei: readRequiredScalarString(reward.total_reward, `data[${index}].total_reward`),
      totalPenaltyGwei: readRequiredScalarString(reward.total_penalty, `data[${index}].total_penalty`),
    };
  });
}

function normalizeRange(value: unknown): Record<string, unknown> {
  const range = readRequiredObject(value, "range");
  return {
    slot: normalizeRangeBounds(range.slot, "range.slot"),
    epoch: normalizeRangeBounds(range.epoch, "range.epoch"),
    timestamp: normalizeRangeBounds(range.timestamp, "range.timestamp"),
  };
}

function normalizeRangeBounds(value: unknown, fieldName: string): Record<string, number> {
  const bounds = readRequiredObject(value, fieldName);
  return {
    start: readRequiredInteger(bounds.start, `${fieldName}.start`),
    end: readRequiredInteger(bounds.end, `${fieldName}.end`),
  };
}

function normalizePaging(value: unknown): Record<string, unknown> {
  const paging = readRequiredObject(value, "paging");
  return {
    nextCursor: readNullableString(paging.next_cursor),
    previousCursor: readNullableString(paging.prev_cursor),
    pageSize: readRequiredInteger(paging.page_size, "paging.page_size"),
  };
}

function readChain(input: Record<string, unknown>): "mainnet" | "hoodi" {
  if (input.chain === undefined || input.chain === "mainnet") {
    return "mainnet";
  }
  if (input.chain === "hoodi") {
    return "hoodi";
  }
  throw new ProviderRequestError(400, "chain must be either mainnet or hoodi");
}

function readRequiredValidatorIdentifiers(value: unknown): Array<number | string> {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, "validatorIdentifiers must be a non-empty array");
  }

  return value.map((item, index) => readRequiredValidatorIdentifier(item, `validatorIdentifiers[${index}]`));
}

function readRequiredValidatorIdentifier(value: unknown, fieldName: string): number | string {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  throw new ProviderRequestError(400, `${fieldName} must be a validator identifier`);
}

function readRequiredObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `Beaconcha.in response is missing ${fieldName}`);
  }
  return record;
}

function readRequiredArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Beaconcha.in response is missing ${fieldName}`);
  }
  return value;
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderRequestError(502, `Beaconcha.in response is missing ${fieldName}`);
  }
  return value;
}

function readRequiredInputString(value: unknown, fieldName: string): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  throw new ProviderRequestError(400, `${fieldName} is required`);
}

function readNullableString(value: unknown): string | null {
  if (value === null) {
    return null;
  }
  return typeof value === "string" ? value : null;
}

function readRequiredScalarString(value: unknown, fieldName: string): string {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  throw new ProviderRequestError(502, `Beaconcha.in response is missing ${fieldName}`);
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  throw new ProviderRequestError(502, `Beaconcha.in response is missing ${fieldName}`);
}

function readOptionalInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  return undefined;
}

function readRequiredNumber(value: unknown, fieldName: string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  throw new ProviderRequestError(502, `Beaconcha.in response is missing ${fieldName}`);
}

function readRequiredBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  throw new ProviderRequestError(502, `Beaconcha.in response is missing ${fieldName}`);
}
