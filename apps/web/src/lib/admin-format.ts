const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatDateTime(value: string) {
  return DATE_TIME_FORMATTER.format(new Date(value));
}

export function formatRelativeTime(value: string) {
  const target = new Date(value).getTime();
  const diffMinutes = Math.round((target - Date.now()) / 60000);
  const absoluteMinutes = Math.abs(diffMinutes);

  if (absoluteMinutes < 1) return "just now";
  if (absoluteMinutes < 60) {
    return diffMinutes < 0 ? `${absoluteMinutes}m ago` : `in ${absoluteMinutes}m`;
  }

  const absoluteHours = Math.round(absoluteMinutes / 60);
  if (absoluteHours < 24) {
    return diffMinutes < 0 ? `${absoluteHours}h ago` : `in ${absoluteHours}h`;
  }

  const absoluteDays = Math.round(absoluteHours / 24);
  return diffMinutes < 0 ? `${absoluteDays}d ago` : `in ${absoluteDays}d`;
}

export function formatSignedDelta(value: number) {
  if (value === 0) return "No change";
  return value > 0 ? `+${value}` : `${value}`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}
