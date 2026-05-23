const events: Array<{ name: string; payload: unknown }> = [];

export async function publishEvent(name: string, payload: unknown) {
  events.push({ name, payload });
  return true;
}

export function getPublishedEvents() {
  return events;
}
