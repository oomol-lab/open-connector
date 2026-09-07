import type { ActionDefinition } from "../../core/types.ts";

import { sfExpressColdchainActions } from "./actions-coldchain.ts";
import { sfExpressFreightCoreActions } from "./actions-freight-core.ts";
import { sfExpressFreightForwardCrossborderActions } from "./actions-freight-forward-crossborder.ts";
import { sfExpressFreightInstallActions } from "./actions-freight-install.ts";
import { sfExpressFreightTlCityActions } from "./actions-freight-tl-city.ts";
import { sfExpressOrderActions } from "./actions-order.ts";
import { sfExpressPrintActions } from "./actions-print.ts";
import { sfExpressPushActions } from "./actions-push.ts";
import { sfExpressQueryActions } from "./actions-query.ts";
import { sfExpressStationActions } from "./actions-stations.ts";

export const sfExpressActions: ActionDefinition[] = [
  ...sfExpressQueryActions,
  ...sfExpressOrderActions,
  ...sfExpressPushActions,
  ...sfExpressPrintActions,
  ...sfExpressColdchainActions,
  ...sfExpressFreightCoreActions,
  ...sfExpressFreightTlCityActions,
  ...sfExpressFreightInstallActions,
  ...sfExpressFreightForwardCrossborderActions,
  ...sfExpressStationActions,
];
