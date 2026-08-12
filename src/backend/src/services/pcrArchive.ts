/**
 * De-identified stats archive for PCR reports.
 *
 * Whenever a finalized (submitted/approved/completed) PCR report is deleted
 * — via the retention cleanup job — its stats-relevant fields are copied
 * into pcr_call_archive before the row is removed. This keeps call-history
 * stats (calendar, season bar chart, admin export) intact even after the
 * source report and its attachments are gone. Patient name and free-text
 * comments are intentionally never copied. Cancelled reports are never
 * archived here - they're meant to disappear from stats entirely.
 */

/**
 * Builds the INSERT OR REPLACE ... SELECT statement that archives finalized
 * pcr_reports rows matching an extra WHERE condition (e.g. `id = ?` or an
 * age condition). Must be run before the corresponding DELETE.
 */
export function archivePcrReportsSql(whereExtra: string): string {
  return `
    INSERT OR REPLACE INTO pcr_call_archive (
      id, date, status, supervisor, responders,
      report_number, chief_complaint, time_notified, on_scene, cleared_scene,
      patient_care_transferred, oxygen_given, created_by, created_at
    )
    SELECT
      id,
      json_extract(form_data, '$.date'),
      status,
      json_extract(form_data, '$.supervisor'),
      -- form_data normally has a JSON array under 'responders' (any number
      -- of names); older reports saved before that field existed only have
      -- the fixed responder1/2/3 keys, so fall back to building an array
      -- from those instead.
      COALESCE(
        json_extract(form_data, '$.responders'),
        json_array(
          json_extract(form_data, '$.responder1'),
          json_extract(form_data, '$.responder2'),
          json_extract(form_data, '$.responder3')
        )
      ),
      json_extract(form_data, '$.reportNumber'),
      json_extract(form_data, '$.chiefComplaint'),
      json_extract(form_data, '$.timeNotified'),
      json_extract(form_data, '$.onScene'),
      json_extract(form_data, '$.clearedScene'),
      json_extract(form_data, '$.patientCareTransferred'),
      json_extract(form_data, '$.oxygenProtocol.oxygen_given'),
      created_by,
      created_at
    FROM pcr_reports
    WHERE status IN ('submitted', 'approved', 'completed') AND ${whereExtra}
  `;
}
