import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

export const fredActions: ProviderActionDefinition[] = [
  defineProviderAction("aisa", {
    name: "search_fred_series",
    operationType: "read",
    description: "Find FRED economic series by text, tags, and frequency.",
    requiredScopes: [],
    inputSchema: {
      type: "object",
      description: "Find FRED economic series by text, tags, and frequency.",
      properties: {
        excludeTagNames: {
          type: "string",
          description:
            "A semicolon delimited list of tag names that series match none of.\nString, optional, no filtering by tags by default.\nExample value: 'discontinued;m1'. Filter results to series having neither tag 'discontinued' nor tag 'm1'.\nParameter exclude_tag_names requires that parameter tag_names also be set to limit the number of matching series.",
        },
        filterValue: {
          type: "string",
          description:
            "The value of the filter_variable attribute to filter results by.\nString, optional, no filter by default",
        },
        filterVariable: {
          enum: ["frequency", "units", "seasonal_adjustment"],
          type: "string",
          description:
            "The attribute to filter results by.\nOne of the following strings: 'frequency', 'units', 'seasonal_adjustment'.\noptional, no filter by default",
        },
        limit: {
          maximum: 1000,
          minimum: 1,
          type: "integer",
          description: "The maximum number of results to return.\ninteger between 1 and 1000, optional, default: 1000",
        },
        offset: {
          minimum: 0,
          type: "integer",
          description: "non-negative integer, optional, default: 0",
        },
        orderBy: {
          enum: [
            "search_rank",
            "series_id",
            "title",
            "units",
            "frequency",
            "seasonal_adjustment",
            "realtime_start",
            "realtime_end",
            "last_updated",
            "observation_start",
            "observation_end",
            "popularity",
            "group_popularity",
          ],
          type: "string",
          description:
            "Order results by values of the specified attribute.\nOne of the following strings: 'search_rank', 'series_id', 'title', 'units', 'frequency', 'seasonal_adjustment', 'realtime_start', 'realtime_end', 'last_updated', 'observation_start', 'observation_end', 'popularity', 'group_popularity'.\noptional, default: If the value of search_type is 'full_text' then the default value of order_by is 'search_rank'. If the value of search_type is 'series_id' then the default value of order_by is 'series_id'.",
        },
        realtimeEnd: {
          format: "date",
          type: "string",
          description:
            "The end of the real-time period. For more information, see Real-Time Periods .\nYYYY-MM-DD formatted string, optional, default: today's date",
        },
        realtimeStart: {
          format: "date",
          type: "string",
          description:
            "The start of the real-time period. For more information, see Real-Time Periods .\nYYYY-MM-DD formatted string, optional, default: today's date",
        },
        searchText: {
          type: "string",
          description: "The words to match against economic data series.",
        },
        searchType: {
          enum: ["full_text", "series_id"],
          type: "string",
          description:
            "Determines the type of search to perform.\nOne of the following strings: 'full_text', 'series_id'.\n'full_text' searches series attributes title, units, frequency, and tags by parsing words into stems. This makes it possible for searches like 'Industry' to match series containing related words such as 'Industries'. Of course, you can search for multiple words like 'money' and 'stock'. Remember to url encode spaces (e.g. 'money%20stock').\n'series_id' performs a substring search on series IDs. Searching for 'ex' will find series containing 'ex' anywhere in a series ID. '*' can be used to anchor searches and match 0 or more of any character. Searching for 'ex*' will find series containing 'ex' at the beginning of a series ID. Searching for '*ex' will find series containing 'ex' at the end of a series ID. It's also possible to put an '*' in the middle of a string. 'm*sl' finds any series starting with 'm' and ending with 'sl'.\noptional, default: full_text.",
        },
        sortOrder: {
          enum: ["asc", "desc"],
          type: "string",
          description:
            "Sort results is ascending or descending order for attribute values specified by order_by.\nOne of the following strings: 'asc', 'desc'.\noptional, default: If order_by is equal to 'search_rank' or 'popularity', then the default value of sort_order is 'desc'. Otherwise, the default sort order is 'asc'.",
        },
        tagNames: {
          type: "string",
          description:
            "A semicolon delimited list of tag names that series match all of.\nString, optional, no filtering by tags by default\nExample value: 'usa;m2'. Filter results to series having both tags 'usa' and 'm2'.\nSee the related request fred/tags .",
        },
      },
      required: ["searchText"],
      additionalProperties: false,
    },
    outputSchema: s.looseObject("The upstream research response, including additional fields and pagination metadata."),
  }),
  defineProviderAction("aisa", {
    name: "get_fred_series",
    operationType: "read",
    description: "Get FRED series metadata, units, and observation coverage.",
    requiredScopes: [],
    inputSchema: {
      type: "object",
      description: "Get FRED series metadata, units, and observation coverage.",
      properties: {
        realtimeEnd: {
          format: "date",
          type: "string",
          description:
            "The end of the real-time period. For more information, see Real-Time Periods .\nYYYY-MM-DD formatted string, optional, default: today's date",
        },
        realtimeStart: {
          format: "date",
          type: "string",
          description:
            "The start of the real-time period. For more information, see Real-Time Periods .\nYYYY-MM-DD formatted string, optional, default: today's date",
        },
        seriesId: {
          type: "string",
          description: "The id for a series.\nstring, required",
        },
      },
      required: ["seriesId"],
      additionalProperties: false,
    },
    outputSchema: s.looseObject("The upstream research response, including additional fields and pagination metadata."),
  }),
  defineProviderAction("aisa", {
    name: "get_fred_observations",
    operationType: "read",
    description: "Read FRED observations with date, vintage, frequency, and unit transformations.",
    requiredScopes: [],
    inputSchema: {
      type: "object",
      description: "Read FRED observations with date, vintage, frequency, and unit transformations.",
      properties: {
        aggregationMethod: {
          enum: ["avg", "sum", "eop"],
          type: "string",
          description:
            "A key that indicates the aggregation method used for frequency aggregation. This parameter has no affect if the frequency parameter is not set.\nstring, optional, default: avg\nOne of the following values: 'avg', 'sum', 'eop' avg = Average sum = Sum eop = End of Period\navg = Average sum = Sum eop = End of Period",
        },
        frequency: {
          enum: [
            "d",
            "w",
            "bw",
            "m",
            "q",
            "sa",
            "a",
            "wef",
            "weth",
            "wew",
            "wetu",
            "wem",
            "wesu",
            "wesa",
            "bwew",
            "bwem",
          ],
          type: "string",
          description:
            "An optional parameter that indicates a lower frequency to aggregate values to. The FRED frequency aggregation feature converts higher frequency data series into lower frequency data series (e.g. converts a monthly data series into an annual data series). In FRED, the highest frequency data is daily, and the lowest frequency data is annual. There are 3 aggregation methods available- average, sum, and end of period. See the aggregation_method parameter.\nstring, optional, default: no value for no frequency aggregation\nOne of the following values: 'd', 'w', 'bw', 'm', 'q', 'sa', 'a', 'wef', 'weth', 'wew', 'wetu', 'wem', 'wesu', 'wesa', 'bwew', 'bwem' Frequencies without period descriptions: d = Daily w = Weekly bw = Biweekly m = Monthly q = Quarterly sa = Semiannual a = Annual Frequencies with period descriptions: wef = Weekly, Ending Friday weth = Weekly, Ending Thursday wew = Weekly, Ending Wednesday wetu = Weekly, Ending Tuesday wem = Weekly, Ending Monday wesu = Weekly, Ending Sunday wesa = Weekly, Ending Saturday bwew = Biweekly, Ending Wednesday bwem = Biweekly, Ending Monday\nFrequencies without period descriptions: d = Daily w = Weekly bw = Biweekly m = Monthly q = Quarterly sa = Semiannual a = Annual\nd = Daily w = Weekly bw = Biweekly m = Monthly q = Quarterly sa = Semiannual a = Annual\nFrequencies with period descriptions: wef = Weekly, Ending Friday weth = Weekly, Ending Thursday wew = Weekly, Ending Wednesday wetu = Weekly, Ending Tuesday wem = Weekly, Ending Monday wesu = Weekly, Ending Sunday wesa = Weekly, Ending Saturday bwew = Biweekly, Ending Wednesday bwem = Biweekly, Ending Monday\nwef = Weekly, Ending Friday weth = Weekly, Ending Thursday wew = Weekly, Ending Wednesday wetu = Weekly, Ending Tuesday wem = Weekly, Ending Monday wesu = Weekly, Ending Sunday wesa = Weekly, Ending Saturday bwew = Biweekly, Ending Wednesday bwem = Biweekly, Ending Monday\nNote that an error will be returned if a frequency is specified that is higher than the native frequency of the series. For instance if a series has the native frequency 'Monthly' (as returned by the fred/series request), it is not possible to aggregate the series to the higher 'Daily' frequency using the frequency parameter value 'd'.\nNo frequency aggregation will occur if the frequency specified by the frequency parameter matches the native frequency of the series. For instance if the value of the frequency parameter is 'm' and the native frequency of the series is 'Monthly' (as returned by the fred/series request), observations will be returned, but they will not be aggregated to a lower frequency.\nFor most cases, it will be sufficient to specify a lower frequency without a period description (e.g. 'd', 'w', 'bw', 'm', 'q', 'sa', 'a') as opposed to frequencies with period descriptions (e.g. 'wef', 'weth', 'wew', 'wetu', 'wem', 'wesu', 'wesa', 'bwew', 'bwem') which only exist for the weekly and biweekly frequencies. The weekly and biweekly frequencies with periods exist to offer more options and override the default periods implied by values 'w' and 'bw'. The value 'w' defaults to frequency and period 'Weekly, Ending Friday' when aggregating daily series. The value 'bw' defaults to frequency and period 'Biweekly, Ending Wednesday' when aggregating daily and weekly series. Consider the difference between values 'w' for 'Weekly' and 'wef' for 'Weekly, Ending Friday'. When aggregating observations from daily to weekly, the value 'w' defaults to frequency and period 'Weekly, Ending Friday' which is the same as 'wef'. Here, the difference is that the period 'Ending Friday' is implicit for value 'w' but explicit for value 'wef'. However, if a series has native frequency 'Weekly, Ending Monday', an error will be returned for value 'wef' but not value 'w'.\nThe weekly and biweekly frequencies with periods exist to offer more options and override the default periods implied by values 'w' and 'bw'.\nThe value 'w' defaults to frequency and period 'Weekly, Ending Friday' when aggregating daily series.\nThe value 'bw' defaults to frequency and period 'Biweekly, Ending Wednesday' when aggregating daily and weekly series.\nConsider the difference between values 'w' for 'Weekly' and 'wef' for 'Weekly, Ending Friday'. When aggregating observations from daily to weekly, the value 'w' defaults to frequency and period 'Weekly, Ending Friday' which is the same as 'wef'. Here, the difference is that the period 'Ending Friday' is implicit for value 'w' but explicit for value 'wef'. However, if a series has native frequency 'Weekly, Ending Monday', an error will be returned for value 'wef' but not value 'w'.\nNote that frequency aggregation is currently only available for file_type equal to xml or json due to time constraints.\nRead the 'Frequency Aggregation' section of the FRED FAQs for implementation details.",
        },
        limit: {
          maximum: 100000,
          minimum: 1,
          type: "integer",
          description:
            "The maximum number of results to return.\ninteger between 1 and 100000, optional, default: 100000",
        },
        observationEnd: {
          format: "date",
          type: "string",
          description:
            "The end of the observation period.\nYYYY-MM-DD formatted string, optional, default: 9999-12-31 (latest available)",
        },
        observationStart: {
          format: "date",
          type: "string",
          description:
            "The start of the observation period.\nYYYY-MM-DD formatted string, optional, default: 1776-07-04 (earliest available)",
        },
        offset: {
          minimum: 0,
          type: "integer",
          description: "non-negative integer, optional, default: 0",
        },
        outputType: {
          enum: [1, 2, 3, 4],
          type: "integer",
          description:
            "An integer that indicates an output type.\ninteger, optional, default: 1\nOne of the following values: '1', '2', '3', '4' 1 = Observations by Real-Time Period 2 = Observations by Vintage Date, All Observations 3 = Observations by Vintage Date, New and Revised Observations Only 4 = Observations, Initial Release Only\n1 = Observations by Real-Time Period 2 = Observations by Vintage Date, All Observations 3 = Observations by Vintage Date, New and Revised Observations Only 4 = Observations, Initial Release Only\nFor output types '2' and '3', some XML attribute names start with the series ID which may have a first character that is a number (i.e. 0 through 9). In this case only, the XML attribute name starts with an underscore then the series ID in order to avoid invalid XML. If the series ID starts with a letter (i.e. A through Z) then an underscore is not prepended.\nFor more information, read: https://alfred.stlouisfed.org/help/downloaddata#outputformats",
        },
        realtimeEnd: {
          format: "date",
          type: "string",
          description:
            "The end of the real-time period. For more information, see Real-Time Periods , vintage_dates .\nYYYY-MM-DD formatted string, optional, default: today's date",
        },
        realtimeStart: {
          format: "date",
          type: "string",
          description:
            "The start of the real-time period. For more information, see Real-Time Periods , vintage_dates .\nYYYY-MM-DD formatted string, optional, default: today's date",
        },
        seriesId: {
          type: "string",
          description: "The id for a series.\nstring, required",
        },
        sortOrder: {
          enum: ["asc", "desc"],
          type: "string",
          description:
            "Sort results is ascending or descending observation_date order.\nOne of the following strings: 'asc', 'desc'.\noptional, default: asc",
        },
        units: {
          enum: ["lin", "chg", "ch1", "pch", "pc1", "pca", "cch", "cca", "log"],
          type: "string",
          description:
            "A key that indicates a data value transformation.\nstring, optional, default: lin (No transformation)\nOne of the following values: 'lin', 'chg', 'ch1', 'pch', 'pc1', 'pca', 'cch', 'cca', 'log' lin = Levels (No transformation) chg = Change ch1 = Change from Year Ago pch = Percent Change pc1 = Percent Change from Year Ago pca = Compounded Annual Rate of Change cch = Continuously Compounded Rate of Change cca = Continuously Compounded Annual Rate of Change log = Natural Log\nlin = Levels (No transformation) chg = Change ch1 = Change from Year Ago pch = Percent Change pc1 = Percent Change from Year Ago pca = Compounded Annual Rate of Change cch = Continuously Compounded Rate of Change cca = Continuously Compounded Annual Rate of Change log = Natural Log\nFor unit transformation formulas, see: https://alfred.stlouisfed.org/help#growth_formulas",
        },
        vintageDates: {
          type: "string",
          description:
            "A comma separated string of YYYY-MM-DD formatted dates in history (e.g. 2000-01-01,2005-02-24). Vintage dates are used to download data as it existed on these specified dates in history. Vintage dates can be specified instead of a real-time period using realtime_start and realtime_end.\nSometimes it may be useful to enter a vintage date that is not a date when the data values were revised. For instance you may want to know the latest available revisions on a particular date. Entering a vintage date is also useful to compare series on different releases with different release dates.\nstring, optional, no vintage dates are set by default.\nYour query will be limited to a specific number of vintage dates depending on the series_id , file_type and output_type specified.\noutput_type=2, series_id=USRECD: 110 csv, 55 xlsx\noutput_type=2, any daily series: 450 csv, 225 xlsx\nany output_type or other series: 1000 csv, 1000 xlsx, 2000 json, 2000 xml",
        },
      },
      required: ["seriesId"],
      additionalProperties: false,
    },
    outputSchema: s.looseObject("The upstream research response, including additional fields and pagination metadata."),
  }),
  defineProviderAction("aisa", {
    name: "get_fred_release_dates",
    operationType: "read",
    description: "List FRED economic release dates and publication metadata.",
    requiredScopes: [],
    inputSchema: {
      type: "object",
      description: "List FRED economic release dates and publication metadata.",
      properties: {
        includeReleaseDatesWithNoData: {
          enum: ["true", "false"],
          type: "string",
          description:
            "Determines whether release dates with no data available are returned. The defalut value 'false' excludes release dates that do not have data. In particular, this excludes future release dates which may be available in the FRED release calendar or the ALFRED release calendar .\nIf include_release_dates_with_no_data is set to true, the XML tag release_date has an extra attribute release_last_updated that can be compared to the release date to determine if data has been updated.\nOne of the following strings: 'true', 'false'.\noptional, default: false",
        },
        limit: {
          maximum: 1000,
          minimum: 1,
          type: "integer",
          description: "The maximum number of results to return.\ninteger between 1 and 1000, optional, default: 1000",
        },
        offset: {
          minimum: 0,
          type: "integer",
          description: "non-negative integer, optional, default: 0",
        },
        orderBy: {
          enum: ["release_date", "release_id", "release_name"],
          type: "string",
          description:
            "Order results by values of the specified attribute.\nOne of the following strings: 'release_date', 'release_id', 'release_name'.\noptional, default: release_date",
        },
        realtimeEnd: {
          format: "date",
          type: "string",
          description:
            "The end of the real-time period. For more information, see Real-Time Periods .\nYYYY-MM-DD formatted string, optional, default: 9999-12-31 (latest available)",
        },
        realtimeStart: {
          format: "date",
          type: "string",
          description:
            "The start of the real-time period. For more information, see Real-Time Periods .\nYYYY-MM-DD formatted string, optional, default: First day of the current year",
        },
        sortOrder: {
          enum: ["asc", "desc"],
          type: "string",
          description:
            "Sort results is ascending or descending release date order.\nOne of the following strings: 'asc', 'desc'.\noptional, default: desc",
        },
      },
      required: [],
      additionalProperties: false,
    },
    outputSchema: s.looseObject("The upstream research response, including additional fields and pagination metadata."),
  }),
];
