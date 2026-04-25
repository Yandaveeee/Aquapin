type SupabaseErrorLike = {
  code?: string;
  message?: string;
} | null;

function includesAll(message: string | undefined, fragments: string[]) {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return fragments.every((fragment) => normalized.includes(fragment.toLowerCase()));
}

export function isMissingSchemaRelationError(
  error: SupabaseErrorLike,
  relationName: string
) {
  if (!error) return false;

  return (
    error.code === "PGRST205" ||
    includesAll(error.message, ["could not find the table", relationName, "schema cache"])
  );
}

export function isMissingSchemaFunctionError(
  error: SupabaseErrorLike,
  functionName: string
) {
  if (!error) return false;

  return (
    error.code === "PGRST202" ||
    includesAll(error.message, ["could not find the function", functionName, "schema cache"])
  );
}

export function getStep4SettingsMigrationMessage() {
  return "Settings audit is unavailable until supabase/step4_settings_schema.sql has been applied.";
}

export function getStep5AccessMigrationMessage() {
  return "Access audit and approval RPCs are unavailable until supabase/step5_admin_access_schema.sql has been applied.";
}
