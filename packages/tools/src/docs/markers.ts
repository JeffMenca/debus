const open = (marker: string): string => `<!-- generado:${marker} -->`;
const close = (marker: string): string => `<!-- /generado:${marker} -->`;

// Replaces what is between the two comments of a block that the generator owns, and nothing else:
// the text around it is written by hand.
export function replaceBetween(markdown: string, marker: string, content: string): string {
  const start = markdown.indexOf(open(marker));
  if (start === -1) throw new Error(`The manual has no ${open(marker)} marker`);
  const from = start + open(marker).length;
  const end = markdown.indexOf(close(marker), from);
  if (end === -1)
    throw new Error(`The manual has no ${close(marker)} marker after ${open(marker)}`);
  return `${markdown.slice(0, from)}\n${content}\n${markdown.slice(end)}`;
}
