export const REPUBLISH_PAGE_SIZE = 100;

// Prisma arguments that walk a table by id, one page at a time.
export function republishPageArgs(after?: string) {
  return {
    select: { id: true },
    orderBy: { id: 'asc' },
    take: REPUBLISH_PAGE_SIZE,
    ...(after && { cursor: { id: after }, skip: 1 }),
  } as const;
}

interface RepublishSteps<Tx> {
  findPage(after?: string): Promise<{ id: string }[]>;
  transaction(work: (tx: Tx) => Promise<void>): Promise<void>;
  publishOne(tx: Tx, id: string): Promise<void>;
  flush(): Promise<void>;
}

// Each page is its own transaction, so a big table never lands in one. What the short flush leaves
// behind goes out with the scheduled one.
export async function republishInPages<Tx>(steps: RepublishSteps<Tx>): Promise<number> {
  let republished = 0;
  let after: string | undefined;
  for (;;) {
    const page = await steps.findPage(after);
    if (page.length === 0) break;
    await steps.transaction(async (tx) => {
      for (const { id } of page) await steps.publishOne(tx, id);
    });
    republished += page.length;
    after = page[page.length - 1]!.id;
  }
  if (republished > 0) await steps.flush();
  return republished;
}
