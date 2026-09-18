import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "beaconchain";

const chainSchema = s.stringEnum("The Ethereum chain to query.", ["mainnet", "hoodi"]);
const evaluationWindowSchema = s.stringEnum("The fixed evaluation window used for network performance aggregation.", [
  "24h",
  "7d",
  "30d",
  "90d",
  "all_time",
]);
const validatorIdentifierSchema = s.anyOf("A validator identifier accepted by Beaconcha.in.", [
  s.nonNegativeInteger("A validator index expressed as a non-negative integer."),
  s.nonEmptyString("A validator public key or another validator identifier string."),
]);
const validatorIdentifiersSchema = s.array(
  "Ordered list of validator identifiers used to filter the result.",
  validatorIdentifierSchema,
  { minItems: 1, maxItems: 100 },
);
const cursorSchema = s.nonEmptyString("The pagination cursor returned by a previous call.");
const pageSizeSchema = s.integer("The number of items to return per page.", { minimum: 1, maximum: 10 });
const epochSchema = s.nonNegativeInteger("The finalized epoch used for reward breakdown queries.");

const rangeBoundsSchema = s.object(
  "A normalized numeric range returned by Beaconcha.in.",
  {
    start: s.integer("The inclusive start value of the covered range."),
    end: s.integer("The inclusive end value of the covered range."),
  },
  { required: ["start", "end"] },
);

const rangeSchema = s.object(
  "The range covered by the returned dataset.",
  {
    slot: rangeBoundsSchema,
    epoch: rangeBoundsSchema,
    timestamp: rangeBoundsSchema,
  },
  { required: ["slot", "epoch", "timestamp"] },
);

const pagingSchema = s.object(
  "Normalized pagination metadata returned by Beaconcha.in.",
  {
    nextCursor: s.nullableString("The cursor used to fetch the next page."),
    previousCursor: s.nullableString("The cursor used to fetch the previous page."),
    pageSize: s.integer("The number of items returned per page."),
  },
  { required: ["nextCursor", "previousCursor", "pageSize"] },
);

const depositQueueSchema = s.object(
  "The current deposit queue metrics.",
  {
    churnWei: s.string("The activation churn limit in wei."),
    depositCount: s.integer("The number of validators waiting for activation."),
    balanceWei: s.string("The aggregate balance of the deposit queue in wei."),
    estimatedProcessedAt: s.integer("The estimated Unix timestamp when the deposit queue will be processed."),
  },
  { required: ["churnWei", "depositCount", "balanceWei", "estimatedProcessedAt"] },
);

const exitQueueSchema = s.object(
  "The current exit queue metrics.",
  {
    churnWei: s.string("The exit churn limit in wei."),
    count: s.integer("The number of validators waiting to exit."),
    balanceWei: s.string("The aggregate balance of the exit queue in wei."),
    estimatedProcessedAt: s.integer("The estimated Unix timestamp when the exit queue will be processed."),
  },
  { required: ["churnWei", "count", "balanceWei", "estimatedProcessedAt"] },
);

const withdrawalSweepSchema = s.object(
  "The current withdrawal sweep metrics.",
  {
    lastSweptValidatorIndex: s.integer("The last validator index that was swept for withdrawals."),
    estimatedSweepDelay: s.integer("The estimated delay in seconds before a withdrawal sweep is completed."),
  },
  { required: ["lastSweptValidatorIndex", "estimatedSweepDelay"] },
);

const queuesOutputSchema = s.object(
  "The staking queue response returned by Beaconcha.in.",
  {
    queues: s.object(
      "The normalized staking queue metrics.",
      {
        finality: s.string("The current finality status of the network."),
        depositQueue: depositQueueSchema,
        exitQueue: exitQueueSchema,
        withdrawalSweep: withdrawalSweepSchema,
      },
      { required: ["finality", "depositQueue", "exitQueue", "withdrawalSweep"] },
    ),
  },
  { required: ["queues"] },
);

const proposalDutiesSchema = s.object(
  "The normalized proposal duty metrics.",
  {
    successful: s.integer("The number of successful proposal duties."),
    assigned: s.integer("The number of assigned proposal duties."),
    missed: s.integer("The number of missed proposal duties."),
    includedSlashings: s.integer("The number of slashings included by proposal duties."),
  },
  { required: ["successful", "assigned", "missed", "includedSlashings"] },
);

const attestationDutiesSchema = s.object(
  "The normalized attestation duty metrics.",
  {
    included: s.integer("The number of included attestations."),
    assigned: s.integer("The number of assigned attestations."),
    correctHead: s.integer("The number of correct head votes."),
    correctSource: s.integer("The number of correct source votes."),
    correctTarget: s.integer("The number of correct target votes."),
    valuableCorrectHead: s.integer("The number of valuable correct head votes."),
    valuableCorrectSource: s.integer("The number of valuable correct source votes."),
    valuableCorrectTarget: s.integer("The number of valuable correct target votes."),
    avgInclusionDelay: s.number("The average inclusion delay across all returned attestations."),
    avgInclusionDelayExcludingMissedSlots: s.number("The average inclusion delay excluding missed slots."),
    missed: s.integer("The number of missed attestations."),
  },
  {
    required: [
      "included",
      "assigned",
      "correctHead",
      "correctSource",
      "correctTarget",
      "valuableCorrectHead",
      "valuableCorrectSource",
      "valuableCorrectTarget",
      "avgInclusionDelay",
      "avgInclusionDelayExcludingMissedSlots",
      "missed",
    ],
  },
);

const syncCommitteeDutiesSchema = s.object(
  "The normalized sync committee duty metrics.",
  {
    successful: s.integer("The number of successful sync committee duties."),
    assigned: s.integer("The number of assigned sync committee duties."),
    missed: s.integer("The number of missed sync committee duties."),
    scheduled: s.integer("The number of scheduled sync committee duties."),
  },
  { required: ["successful", "assigned", "missed", "scheduled"] },
);

const performanceOutputSchema = s.object(
  "The network performance response returned by Beaconcha.in.",
  {
    performance: s.object(
      "The normalized network performance payload.",
      {
        finality: s.string("The finality status returned for the requested range."),
        beaconScore: s.object(
          "The beacon score summary.",
          {
            total: s.number("The overall beacon score."),
            attestation: s.number("The attestation beacon score."),
            proposal: s.number("The proposal beacon score."),
            syncCommittee: s.number("The sync committee beacon score."),
          },
          { required: ["total", "attestation", "proposal", "syncCommittee"] },
        ),
        duties: s.object(
          "The grouped duty metrics.",
          {
            attestation: attestationDutiesSchema,
            syncCommittee: syncCommitteeDutiesSchema,
            proposal: proposalDutiesSchema,
          },
          { required: ["attestation", "syncCommittee", "proposal"] },
        ),
      },
      { required: ["finality", "beaconScore", "duties"] },
    ),
    range: rangeSchema,
  },
  { required: ["performance", "range"] },
);

const withdrawalCredentialsSchema = s.object(
  "The normalized withdrawal credentials.",
  {
    type: s.string("The withdrawal credential type."),
    prefix: s.string("The withdrawal credential prefix."),
    credential: s.string("The normalized withdrawal credential body."),
    address: s.nullableString("The resolved withdrawal address when present."),
  },
  { required: ["type", "prefix", "credential", "address"] },
);

const lifeCycleEpochsSchema = s.object(
  "The validator lifecycle epochs.",
  {
    activationEligibility: s.integer("The activation eligibility epoch of the validator."),
    activation: s.integer("The activation epoch of the validator."),
    exit: s.integer("The exit epoch of the validator."),
    withdrawable: s.integer("The withdrawable epoch of the validator."),
  },
  { required: ["activationEligibility", "activation", "exit", "withdrawable"] },
);

const validatorBalancesSchema = s.object(
  "The normalized validator balances.",
  {
    currentGwei: s.string("The current validator balance in gwei."),
    effectiveGwei: s.string("The effective validator balance in gwei."),
  },
  { required: ["currentGwei", "effectiveGwei"] },
);

const validatorSummarySchema = s.object(
  "A normalized Beaconcha.in validator summary.",
  {
    validatorIndex: s.integer("The validator index."),
    publicKey: s.string("The validator public key."),
    slashed: s.boolean("Whether the validator has been slashed."),
    status: s.string("The current validator status."),
    online: s.boolean("Whether the validator is currently online."),
    finality: s.string("The finality mode used by the returned validator snapshot."),
    balances: validatorBalancesSchema,
    withdrawalCredentials: withdrawalCredentialsSchema,
    lifeCycleEpochs: lifeCycleEpochsSchema,
  },
  {
    required: [
      "validatorIndex",
      "publicKey",
      "slashed",
      "status",
      "online",
      "finality",
      "balances",
      "withdrawalCredentials",
      "lifeCycleEpochs",
    ],
  },
);

const validatorOutputSchema = s.object(
  "The single-validator response returned by Beaconcha.in.",
  {
    validator: validatorSummarySchema,
    range: rangeSchema,
  },
  { required: ["validator", "range"] },
);

const validatorListOutputSchema = s.object(
  "The multi-validator response returned by Beaconcha.in.",
  {
    validators: s.array("The ordered validators returned for the requested selector.", validatorSummarySchema),
    range: rangeSchema,
    paging: pagingSchema,
  },
  { required: ["validators", "range", "paging"] },
);

const rewardSummarySchema = s.object(
  "A normalized validator reward summary.",
  {
    validatorIndex: s.integer("The validator index."),
    publicKey: s.string("The validator public key."),
    totalGwei: s.string("The net reward total in gwei."),
    totalRewardGwei: s.string("The gross reward total in gwei."),
    totalPenaltyGwei: s.string("The penalty total in gwei."),
  },
  { required: ["validatorIndex", "publicKey", "totalGwei", "totalRewardGwei", "totalPenaltyGwei"] },
);

const rewardListOutputSchema = s.object(
  "The validator rewards response returned by Beaconcha.in.",
  {
    rewards: s.array("The validator rewards returned for the requested epoch.", rewardSummarySchema),
    range: rangeSchema,
    paging: pagingSchema,
  },
  { required: ["rewards", "range", "paging"] },
);

function beaconchainInput(properties: Record<string, JsonSchema>, required: string[]): JsonSchema {
  return s.object(properties, { required });
}

export const beaconchainActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_staking_queues",
    operationType: "read",
    description: "Get the current staking queue metrics for the requested Beaconcha.in chain.",
    inputSchema: beaconchainInput(
      {
        chain: chainSchema,
      },
      [],
    ),
    outputSchema: queuesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_network_performance",
    operationType: "read",
    description: "Get aggregated Beaconcha.in network performance metrics for a fixed evaluation window.",
    inputSchema: beaconchainInput(
      {
        chain: chainSchema,
        evaluationWindow: evaluationWindowSchema,
      },
      ["evaluationWindow"],
    ),
    outputSchema: performanceOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_validator",
    operationType: "read",
    description: "Get the current validator snapshot for a single validator identifier.",
    inputSchema: beaconchainInput(
      {
        chain: chainSchema,
        validatorIdentifier: validatorIdentifierSchema,
      },
      ["validatorIdentifier"],
    ),
    outputSchema: validatorOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_validators",
    operationType: "read",
    description: "List the current validator snapshots for one or more validator identifiers.",
    inputSchema: beaconchainInput(
      {
        chain: chainSchema,
        validatorIdentifiers: validatorIdentifiersSchema,
        cursor: cursorSchema,
        pageSize: pageSizeSchema,
      },
      ["validatorIdentifiers"],
    ),
    outputSchema: validatorListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_validator_consensus_rewards",
    operationType: "read",
    description: "Get per-validator reward breakdowns for a finalized Beaconcha.in epoch.",
    inputSchema: beaconchainInput(
      {
        chain: chainSchema,
        validatorIdentifiers: validatorIdentifiersSchema,
        epoch: epochSchema,
        cursor: cursorSchema,
        pageSize: pageSizeSchema,
      },
      ["validatorIdentifiers"],
    ),
    outputSchema: rewardListOutputSchema,
  }),
];
