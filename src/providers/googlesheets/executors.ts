import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { OAuthProviderContext } from "../provider-runtime.ts";
import type { GooglesheetsActionName } from "./actions.ts";

import { defineOAuthProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import {
  addSheet,
  appendDimension,
  autoResizeDimensions,
  clearBasicFilter,
  copySheetToOtherSpreadsheet,
  createChart,
  deleteDimension,
  deleteSheet,
  findReplace,
  formatCell,
  insertDimension,
  mutateConditionalFormatRules,
  setBasicFilter,
  setDataValidationRule,
  updateDimensionProperties,
  updateSheetProperties,
  updateSpreadsheetProperties,
} from "./runtime-batch-update.ts";
import {
  createGoogleSheet,
  getConditionalFormatRules,
  getDataValidationRules,
  getSheetNames,
  getSpreadsheetByDataFilter,
  getSpreadsheetInfo,
  searchDeveloperMetadata,
  searchSpreadsheets,
} from "./runtime-metadata.ts";
import { googleJsonRequest } from "./runtime-shared.ts";
import {
  aggregateColumnData,
  createSpreadsheetColumn,
  createSpreadsheetRow,
  lookupSpreadsheetRow,
  upsertRows,
} from "./runtime-table.ts";
import { batchGetValues, batchGetValuesByDataFilter, getValues } from "./runtime-values.ts";
import {
  appendValues,
  batchClearValues,
  batchClearValuesByDataFilter,
  batchUpdateValuesByDataFilter,
  clearValues,
  updateValues,
  updateValuesBatch,
} from "./runtime-values.ts";

const service = "googlesheets";

const sheetsApiBaseUrl = "https://sheets.googleapis.com/v4";

type ActionContext = OAuthProviderContext;

type ActionHandler = (input: Record<string, unknown>, context: ActionContext) => Promise<unknown>;

const implementedActionHandlers: Record<GooglesheetsActionName, ActionHandler> = {
  search_spreadsheets(input, { accessToken, fetcher }) {
    return searchSpreadsheets(input, accessToken, fetcher);
  },
  create_google_sheet1(input, { accessToken, fetcher }) {
    return createGoogleSheet(input, accessToken, fetcher);
  },
  get_spreadsheet_info(input, { accessToken, fetcher }) {
    return getSpreadsheetInfo(input, accessToken, fetcher);
  },
  get_spreadsheet_by_data_filter(input, { accessToken, fetcher }) {
    return getSpreadsheetByDataFilter(input, accessToken, fetcher);
  },
  get_sheet_names(input, { accessToken, fetcher }) {
    return getSheetNames(input, accessToken, fetcher);
  },
  search_developer_metadata(input, { accessToken, fetcher }) {
    return searchDeveloperMetadata(input, accessToken, fetcher);
  },
  get_conditional_format_rules(input, { accessToken, fetcher }) {
    return getConditionalFormatRules(input, accessToken, fetcher);
  },
  get_data_validation_rules(input, { accessToken, fetcher }) {
    return getDataValidationRules(input, accessToken, fetcher);
  },
  values_get(input, { accessToken, fetcher }) {
    return getValues(input, accessToken, fetcher);
  },
  batch_get(input, { accessToken, fetcher }) {
    return batchGetValues(input, accessToken, fetcher);
  },
  spreadsheets_values_batch_get_by_data_filter(input, { accessToken, fetcher }) {
    return batchGetValuesByDataFilter(input, accessToken, fetcher);
  },
  values_update(input, { accessToken, fetcher }) {
    return updateValues(input, accessToken, fetcher);
  },
  update_values_batch(input, { accessToken, fetcher }) {
    return updateValuesBatch(input, accessToken, fetcher);
  },
  spreadsheets_values_append(input, { accessToken, fetcher }) {
    return appendValues(input, accessToken, fetcher);
  },
  clear_values(input, { accessToken, fetcher }) {
    return clearValues(input, accessToken, fetcher);
  },
  spreadsheets_values_batch_clear(input, { accessToken, fetcher }) {
    return batchClearValues(input, accessToken, fetcher);
  },
  batch_clear_values_by_data_filter(input, { accessToken, fetcher }) {
    return batchClearValuesByDataFilter(input, accessToken, fetcher);
  },
  batch_update_values_by_data_filter(input, { accessToken, fetcher }) {
    return batchUpdateValuesByDataFilter(input, accessToken, fetcher);
  },
  add_sheet(input, { accessToken, fetcher }) {
    return addSheet(input, accessToken, fetcher);
  },
  delete_sheet(input, { accessToken, fetcher }) {
    return deleteSheet(input, accessToken, fetcher);
  },
  update_sheet_properties(input, { accessToken, fetcher }) {
    return updateSheetProperties(input, accessToken, fetcher);
  },
  update_spreadsheet_properties(input, { accessToken, fetcher }) {
    return updateSpreadsheetProperties(input, accessToken, fetcher);
  },
  append_dimension(input, { accessToken, fetcher }) {
    return appendDimension(input, accessToken, fetcher);
  },
  insert_dimension(input, { accessToken, fetcher }) {
    return insertDimension(input, accessToken, fetcher);
  },
  delete_dimension(input, { accessToken, fetcher }) {
    return deleteDimension(input, accessToken, fetcher);
  },
  auto_resize_dimensions(input, { accessToken, fetcher }) {
    return autoResizeDimensions(input, accessToken, fetcher);
  },
  update_dimension_properties(input, { accessToken, fetcher }) {
    return updateDimensionProperties(input, accessToken, fetcher);
  },
  set_basic_filter(input, { accessToken, fetcher }) {
    return setBasicFilter(input, accessToken, fetcher);
  },
  clear_basic_filter(input, { accessToken, fetcher }) {
    return clearBasicFilter(input, accessToken, fetcher);
  },
  find_replace(input, { accessToken, fetcher }) {
    return findReplace(input, accessToken, fetcher);
  },
  format_cell(input, { accessToken, fetcher }) {
    return formatCell(input, accessToken, fetcher);
  },
  mutate_conditional_format_rules(input, { accessToken, fetcher }) {
    return mutateConditionalFormatRules(input, accessToken, fetcher);
  },
  set_data_validation_rule(input, { accessToken, fetcher }) {
    return setDataValidationRule(input, accessToken, fetcher);
  },
  create_chart(input, { accessToken, fetcher }) {
    return createChart(input, accessToken, fetcher);
  },
  spreadsheets_sheets_copy_to(input, { accessToken, fetcher }) {
    return copySheetToOtherSpreadsheet(input, accessToken, fetcher);
  },
  create_spreadsheet_row(input, { accessToken, fetcher }) {
    return createSpreadsheetRow(input, accessToken, fetcher);
  },
  create_spreadsheet_column(input, { accessToken, fetcher }) {
    return createSpreadsheetColumn(input, accessToken, fetcher);
  },
  lookup_spreadsheet_row(input, { accessToken, fetcher }) {
    return lookupSpreadsheetRow(input, accessToken, fetcher);
  },
  aggregate_column_data(input, { accessToken, fetcher }) {
    return aggregateColumnData(input, accessToken, fetcher);
  },
  upsert_rows(input, { accessToken, fetcher }) {
    return upsertRows(input, accessToken, fetcher);
  },
};

export const googlesheetsActionHandlers: Record<GooglesheetsActionName, ActionHandler> = implementedActionHandlers;

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, googlesheetsActionHandlers);

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher, signal }) {
    const profile: {
      email?: string;
      name?: string;
      sub?: string;
    } = await googleJsonRequest<{
      email?: string;
      name?: string;
      sub?: string;
    }>("https://www.googleapis.com/oauth2/v3/userinfo", {
      accessToken: input.accessToken,
      fetcher,
      signal,
    }).catch(
      async (): Promise<{
        email?: string;
        name?: string;
        sub?: string;
      }> => {
        await googleJsonRequest<Record<string, unknown>>(`${sheetsApiBaseUrl}/spreadsheets`, {
          accessToken: input.accessToken,
          fetcher,
          signal,
        });
        return {};
      },
    );

    return {
      profile: {
        accountId: profile.email ?? profile.sub ?? "googlesheets:oauth2",
        displayName: profile.name ?? profile.email ?? "Google Sheets User",
      },
      metadata: {
        currentAccount: profile,
      },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://sheets.googleapis.com/v4",
  auth: { type: "oauth_bearer" },
});
