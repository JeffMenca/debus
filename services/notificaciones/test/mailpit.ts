function base(): string {
  return process.env.MAILPIT_URL ?? 'http://localhost:8025';
}

export interface MailpitMessage {
  ID: string;
  Subject: string;
  To: { Address: string }[];
}

export async function findMail(to: string): Promise<MailpitMessage[]> {
  const response = await fetch(`${base()}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
  const body = (await response.json()) as { messages: MailpitMessage[] };
  return body.messages;
}

export async function mailHtml(id: string): Promise<string> {
  const response = await fetch(`${base()}/api/v1/message/${id}`);
  return ((await response.json()) as { HTML: string }).HTML;
}
