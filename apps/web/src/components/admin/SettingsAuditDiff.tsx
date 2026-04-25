import type { Json, SettingSection } from "@aquapin/shared";
import { getSettingDiffEntries } from "@/lib/admin-settings";

type SettingsAuditDiffProps = {
  section: SettingSection;
  previousValue: Json | null;
  nextValue: Json;
};

export default function SettingsAuditDiff({
  section,
  previousValue,
  nextValue,
}: SettingsAuditDiffProps) {
  const diffEntries = getSettingDiffEntries(section, previousValue, nextValue).filter(
    (entry) => entry.changed
  );

  if (diffEntries.length === 0) {
    return <p className="muted">No field-level changes detected.</p>;
  }

  return (
    <ul className="settings-diff-list">
      {diffEntries.map((entry) => (
        <li key={entry.fieldName}>
          <div className="settings-diff-row">
            <strong>{entry.label}</strong>
            <div className="settings-diff-values">
              <span>{entry.previousValue}</span>
              <span className="transition-arrow">to</span>
              <span>{entry.nextValue}</span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
