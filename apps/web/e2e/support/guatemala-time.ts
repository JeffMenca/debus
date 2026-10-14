const DAY_AND_TIME = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Guatemala',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// The day and the hour in Guatemala of a moment some minutes ago (or ahead, when negative), the
// way the forms fill them.
export function guatemalaAgo(minutes: number) {
  const parts = Object.fromEntries(
    DAY_AND_TIME.formatToParts(new Date(Date.now() - minutes * 60_000)).map((part) => [
      part.type,
      part.value,
    ]),
  );
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}
