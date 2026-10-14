'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { messageOf } from '@/lib/api/client';
import { CYCLE_FIELD_ORDER, type CycleOutcome, type CycleProblems } from '@/lib/trips/cycle';

interface RecordFormOptions<R> {
  // The prefix of the field ids of the card, such as `departure` for `departure-day`.
  idPrefix: 'departure' | 'arrival';
  outcome: CycleOutcome<R>;
  record: (request: R) => Promise<unknown>;
  savedMessage: string;
}

// Reviewing and saving a departure or an arrival: the first field with a problem takes the focus,
// valid data asks for a confirmation, and what the service refuses shows on the card.
export function useRecordForm<R>({
  idPrefix,
  outcome,
  record,
  savedMessage,
}: RecordFormOptions<R>) {
  const [problems, setProblems] = useState<CycleProblems>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const focusField = (field: string) => document.getElementById(`${idPrefix}-${field}`)?.focus();

  function review() {
    const found = outcome.problems;
    setServerError(null);
    setProblems(found ?? {});
    if (found) {
      const first = CYCLE_FIELD_ORDER.find((field) => found[field]);
      if (first) focusField(first);
      return;
    }
    setConfirming(true);
  }

  async function save() {
    if (!outcome.request) return;
    try {
      await record(outcome.request);
    } catch (error) {
      // The dialog closes and the card shows what the service said, next to the fields to fix.
      setServerError(messageOf(error));
      setTimeout(() => focusField('day'), 0);
      return;
    }
    toast.success(savedMessage);
  }

  return { problems, serverError, confirming, setConfirming, review, save };
}
