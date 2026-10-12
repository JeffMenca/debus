'use client';

import { ConfirmDialog } from './confirm-dialog';

interface ActiveToggleDialogProps {
  // The change waiting for confirmation; null keeps the dialog closed.
  pending: { active: boolean } | null;
  onClose: () => void;
  // What the title names after the verb, such as "a Ana López" or "Xela".
  subject: string | undefined;
  reactivateDescription: string;
  deactivateDescription: string;
  onConfirm: () => Promise<void>;
}

// Records are never deleted, only deactivated, so every list confirms both directions the same way.
export function ActiveToggleDialog({
  pending,
  onClose,
  subject,
  reactivateDescription,
  deactivateDescription,
  onConfirm,
}: ActiveToggleDialogProps) {
  const reactivating = Boolean(pending?.active);
  return (
    <ConfirmDialog
      open={Boolean(pending)}
      onOpenChange={(open) => !open && onClose()}
      title={`${reactivating ? '¿Reactivar' : '¿Desactivar'} ${subject}?`}
      description={reactivating ? reactivateDescription : deactivateDescription}
      confirmLabel={reactivating ? 'Reactivar' : 'Desactivar'}
      tone={reactivating ? 'default' : 'danger'}
      onConfirm={onConfirm}
    />
  );
}
