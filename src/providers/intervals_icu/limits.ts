/**
 * Number of activities list_activities and search_activities return when the
 * caller sets no limit, shared by their schemas and handlers. Intervals.icu
 * itself returns every activity in the range, which can be hundreds of large
 * records, so the actions ask for a page an agent can read.
 */
export const intervalsIcuDefaultActivityLimit = 30;
