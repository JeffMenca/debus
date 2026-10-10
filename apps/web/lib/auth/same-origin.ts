// The address the visitor typed, as far as a proxy in front of the web tells us.
function ownOrigin(request: Request): { host: string | null; protocol: string } {
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  return {
    host: request.headers.get('x-forwarded-host') ?? request.headers.get('host'),
    protocol: forwardedProto === undefined ? new URL(request.url).protocol : `${forwardedProto}:`,
  };
}

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) {
    const site = request.headers.get('sec-fetch-site');
    return !site || site === 'same-origin';
  }
  const own = ownOrigin(request);
  try {
    const sent = new URL(origin);
    return sent.host === own.host && sent.protocol === own.protocol;
  } catch {
    return false;
  }
}
