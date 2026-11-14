interface PgLikeError {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

const CONSTRAINT_MESSAGES: Record<string, string> = {
  egg_collections_unique_shed_day: "A collection for this shed and date already exists. Void it first to re-enter.",
  egg_collections_breakdown_matches: "The size breakdown must add up to the total eggs collected.",
  egg_purchases_supplier_invoice_uniq: "This supplier invoice number has already been entered.",
  salary_records_unique_month: "A salary record for this employee and month already exists.",
  attendance_employee_id_attendance_date_key: "Attendance for this employee and date already exists.",
  farms_code_key: "A farm with this code already exists.",
  sheds_farm_id_code_key: "This farm already has a shed with that code.",
  chicken_batches_batch_code_key: "A batch with this code already exists.",
  employees_employee_code_key: "An employee with this ID already exists.",
  customers_code_key: "A customer with this code already exists.",
  suppliers_code_key: "A supplier with this code already exists.",
};

/** Turns a PostgREST / PostgreSQL error into a message fit for end users. */
export function friendlyError(error: unknown): string {
  if (!error) return "Something went wrong";
  if (typeof error === "string") return error;
  const e = error as PgLikeError;
  const msg = e.message ?? String(error);
  for (const [constraint, text] of Object.entries(CONSTRAINT_MESSAGES)) {
    if (msg.includes(constraint) || e.details?.includes(constraint)) return text;
  }
  switch (e.code) {
    case "23505":
      return "A record with these details already exists.";
    case "23503":
      return msg.includes("delete") || msg.includes("update")
        ? "This record is in use by other records and cannot be removed. Deactivate it instead."
        : "A referenced record does not exist.";
    case "23514":
      return msg.includes("violates check constraint") ? "Some values are not allowed. Please review the form." : msg;
    case "42501":
      return msg.startsWith("Permission denied") || msg.includes("immutable") || msg.includes("cannot be")
        ? msg
        : "You do not have permission to perform this action.";
    case "PGRST116":
      return "Record not found.";
    case "22P02":
      return "One of the values has an invalid format.";
  }
  return msg;
}
