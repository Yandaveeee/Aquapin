import type { AdminSettingsSections, SettingSection } from "@aquapin/shared";
import { updateAdminSettingAction } from "@/app/admin/settings/actions";
import { formatDateTime } from "@/lib/admin-format";
import { SETTINGS_SECTION_META } from "@/lib/admin-settings";

type SettingsSectionFormProps = {
  section: SettingSection;
  value: AdminSettingsSections[SettingSection];
  updatedAt: string | null;
  updatedByLabel: string;
};

function getSectionSummary(section: SettingSection, value: AdminSettingsSections[SettingSection]) {
  switch (section) {
    case "general":
      return (() => {
        const typedValue = value as AdminSettingsSections["general"];
        return [
          typedValue.organizationName,
          typedValue.timezone,
          typedValue.units === "imperial" ? "Imperial" : "Metric",
        ];
      })();
    case "operations":
      return (() => {
        const typedValue = value as AdminSettingsSections["operations"];
        return [
          `Survival ${typedValue.survivalThresholdPercent}%`,
          `Low stock ${typedValue.lowStockThreshold}`,
          `${typedValue.defaultMapCenterLat}, ${typedValue.defaultMapCenterLng}`,
        ];
      })();
    case "notifications":
      return (() => {
        const typedValue = value as AdminSettingsSections["notifications"];
        return [
          typedValue.inAppEnabled ? "In-app on" : "In-app off",
          typedValue.emailEnabled ? "Email on" : "Email off",
          `${typedValue.staleSyncMinutes}m stale window`,
        ];
      })();
    case "integrations":
      return (() => {
        const typedValue = value as AdminSettingsSections["integrations"];
        return [
          typedValue.googleMapsApiKey ? "Maps configured" : "Maps pending",
          typedValue.webhookUrl ? "Webhook configured" : "Webhook pending",
        ];
      })();
    case "security":
      return (() => {
        const typedValue = value as AdminSettingsSections["security"];
        return [
          `${typedValue.sessionTimeoutMinutes}m session`,
          typedValue.enforceStrongPasswords ? "Strong passwords" : "Flexible passwords",
          typedValue.requireMfaForAdmins ? "Admin MFA on" : "Admin MFA off",
        ];
      })();
    default:
      return [];
  }
}

export default function SettingsSectionForm({
  section,
  value,
  updatedAt,
  updatedByLabel,
}: SettingsSectionFormProps) {
  const meta = SETTINGS_SECTION_META[section];
  const summary = getSectionSummary(section, value);
  const generalValue = section === "general" ? (value as AdminSettingsSections["general"]) : null;
  const operationsValue =
    section === "operations" ? (value as AdminSettingsSections["operations"]) : null;
  const notificationsValue =
    section === "notifications" ? (value as AdminSettingsSections["notifications"]) : null;
  const integrationsValue =
    section === "integrations" ? (value as AdminSettingsSections["integrations"]) : null;
  const securityValue =
    section === "security" ? (value as AdminSettingsSections["security"]) : null;

  return (
    <form className="settings-card" action={updateAdminSettingAction}>
      <div className="settings-card-head">
        <div>
          <p className="settings-card-kicker">{meta.caption}</p>
          <h4>{meta.title}</h4>
          <p className="muted">{meta.description}</p>
        </div>
        <div className="settings-card-meta">
          <p>Last updated</p>
          <strong>{updatedAt ? formatDateTime(updatedAt) : "Not yet saved"}</strong>
          <span>{updatedByLabel}</span>
        </div>
      </div>

      <div className="settings-chip-row">
        {summary.map((item) => (
          <span className="ui-pill ui-pill-ghost" key={item}>
            {item}
          </span>
        ))}
      </div>

      <input type="hidden" name="section" value={section} />
      <input type="hidden" name="returnTo" value="/admin/settings" />

      {section === "general" ? (
        <div className="settings-field-grid">
          <div className="settings-field">
            <label className="field-label" htmlFor={`${section}-organizationName`}>
              Organization name
            </label>
            <input
              className="field-input"
              defaultValue={generalValue?.organizationName}
              id={`${section}-organizationName`}
              name="organizationName"
            />
            <p className="field-hint">Shown across the admin console and shell header.</p>
          </div>

          <div className="settings-field">
            <label className="field-label" htmlFor={`${section}-timezone`}>
              Time zone
            </label>
            <input
              className="field-input"
              defaultValue={generalValue?.timezone}
              id={`${section}-timezone`}
              name="timezone"
            />
            <p className="field-hint">Used as the operational reference zone for administrators.</p>
          </div>

          <div className="settings-field">
            <label className="field-label" htmlFor={`${section}-units`}>
              Units
            </label>
            <select
              className="field-input"
              defaultValue={generalValue?.units}
              id={`${section}-units`}
              name="units"
            >
              <option value="metric">Metric</option>
              <option value="imperial">Imperial</option>
            </select>
            <p className="field-hint">Controls how operational values are presented in the console.</p>
          </div>
        </div>
      ) : null}

      {section === "operations" ? (
        <div className="settings-field-grid">
          <div className="settings-field">
            <label className="field-label" htmlFor={`${section}-survivalThresholdPercent`}>
              Survival threshold (%)
            </label>
            <input
              className="field-input"
              defaultValue={operationsValue?.survivalThresholdPercent}
              id={`${section}-survivalThresholdPercent`}
              max={100}
              min={0}
              name="survivalThresholdPercent"
              step="0.1"
              type="number"
            />
            <p className="field-hint">Below this value, pond performance should be reviewed.</p>
          </div>

          <div className="settings-field">
            <label className="field-label" htmlFor={`${section}-lowStockThreshold`}>
              Low-stock threshold
            </label>
            <input
              className="field-input"
              defaultValue={operationsValue?.lowStockThreshold}
              id={`${section}-lowStockThreshold`}
              min={0}
              name="lowStockThreshold"
              step="1"
              type="number"
            />
            <p className="field-hint">Active ponds below this stock count appear in the attention rail.</p>
          </div>

          <div className="settings-field">
            <label className="field-label" htmlFor={`${section}-defaultMapCenterLat`}>
              Default latitude
            </label>
            <input
              className="field-input"
              defaultValue={operationsValue?.defaultMapCenterLat}
              id={`${section}-defaultMapCenterLat`}
              max={90}
              min={-90}
              name="defaultMapCenterLat"
              step="0.0001"
              type="number"
            />
          </div>

          <div className="settings-field">
            <label className="field-label" htmlFor={`${section}-defaultMapCenterLng`}>
              Default longitude
            </label>
            <input
              className="field-input"
              defaultValue={operationsValue?.defaultMapCenterLng}
              id={`${section}-defaultMapCenterLng`}
              max={180}
              min={-180}
              name="defaultMapCenterLng"
              step="0.0001"
              type="number"
            />
          </div>
        </div>
      ) : null}

      {section === "notifications" ? (
        <div className="settings-field-grid">
          <div className="settings-field">
            <label className="field-label" htmlFor={`${section}-staleSyncMinutes`}>
              Stale activity window (minutes)
            </label>
            <input
              className="field-input"
              defaultValue={notificationsValue?.staleSyncMinutes}
              id={`${section}-staleSyncMinutes`}
              max={1440}
              min={1}
              name="staleSyncMinutes"
              step="1"
              type="number"
            />
            <p className="field-hint">Active ponds without recent history after this window are flagged.</p>
          </div>

          <label className="toggle-field" htmlFor={`${section}-inAppEnabled`}>
            <input
              defaultChecked={notificationsValue?.inAppEnabled}
              id={`${section}-inAppEnabled`}
              name="inAppEnabled"
              type="checkbox"
              value="true"
            />
            <span>
              <strong>Enable in-app alerts</strong>
              <small>Show operational alerts inside the admin console.</small>
            </span>
          </label>

          <label className="toggle-field" htmlFor={`${section}-emailEnabled`}>
            <input
              defaultChecked={notificationsValue?.emailEnabled}
              id={`${section}-emailEnabled`}
              name="emailEnabled"
              type="checkbox"
              value="true"
            />
            <span>
              <strong>Enable email alerts</strong>
              <small>Allow alert workflows that depend on email delivery.</small>
            </span>
          </label>

          <label className="toggle-field" htmlFor={`${section}-criticalAlertsOnly`}>
            <input
              defaultChecked={notificationsValue?.criticalAlertsOnly}
              id={`${section}-criticalAlertsOnly`}
              name="criticalAlertsOnly"
              type="checkbox"
              value="true"
            />
            <span>
              <strong>Critical alerts only</strong>
              <small>Suppress lower-priority alerts when only severe issues should surface.</small>
            </span>
          </label>
        </div>
      ) : null}

      {section === "integrations" ? (
        <div className="settings-field-grid">
          <div className="settings-field">
            <label className="field-label" htmlFor={`${section}-googleMapsApiKey`}>
              Google Maps API key
            </label>
            <input
              className="field-input"
              defaultValue={integrationsValue?.googleMapsApiKey}
              id={`${section}-googleMapsApiKey`}
              name="googleMapsApiKey"
              type="password"
            />
            <p className="field-hint">Leave blank until map integrations are ready to be enabled.</p>
          </div>

          <div className="settings-field">
            <label className="field-label" htmlFor={`${section}-webhookUrl`}>
              Webhook URL
            </label>
            <input
              className="field-input"
              defaultValue={integrationsValue?.webhookUrl}
              id={`${section}-webhookUrl`}
              name="webhookUrl"
              placeholder="https://example.com/hooks/aquapin"
              type="url"
            />
            <p className="field-hint">Used for outbound notifications or downstream sync hooks.</p>
          </div>
        </div>
      ) : null}

      {section === "security" ? (
        <div className="settings-field-grid">
          <div className="settings-field">
            <label className="field-label" htmlFor={`${section}-sessionTimeoutMinutes`}>
              Session timeout (minutes)
            </label>
            <input
              className="field-input"
              defaultValue={securityValue?.sessionTimeoutMinutes}
              id={`${section}-sessionTimeoutMinutes`}
              max={1440}
              min={15}
              name="sessionTimeoutMinutes"
              step="1"
              type="number"
            />
            <p className="field-hint">Shorter sessions reduce risk for shared or unattended devices.</p>
          </div>

          <label className="toggle-field" htmlFor={`${section}-enforceStrongPasswords`}>
            <input
              defaultChecked={securityValue?.enforceStrongPasswords}
              id={`${section}-enforceStrongPasswords`}
              name="enforceStrongPasswords"
              type="checkbox"
              value="true"
            />
            <span>
              <strong>Enforce strong passwords</strong>
              <small>Require higher-quality passwords for admin console access.</small>
            </span>
          </label>

          <label className="toggle-field" htmlFor={`${section}-requireMfaForAdmins`}>
            <input
              defaultChecked={securityValue?.requireMfaForAdmins}
              id={`${section}-requireMfaForAdmins`}
              name="requireMfaForAdmins"
              type="checkbox"
              value="true"
            />
            <span>
              <strong>Require MFA for admins</strong>
              <small>Add an extra approval step for administrative accounts.</small>
            </span>
          </label>
        </div>
      ) : null}

      <div className="settings-card-footer">
        <button className="primary-button" type="submit">
          Save {meta.title}
        </button>
      </div>
    </form>
  );
}
