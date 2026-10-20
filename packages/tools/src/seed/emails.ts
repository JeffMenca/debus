// The seed mailboxes are tagged addresses of one real inbox: `equipo@gmail.com` + `admin-xel`.
export function seedEmail(base: string, label: string): string {
  const at = base.lastIndexOf('@');
  if (at < 1) throw new Error(`The seed email base must be an address, got "${base}"`);
  const [name, ...tag] = base.slice(0, at).split('+');
  return `${name}+${[...tag, label].join('-')}${base.slice(at)}`;
}
