'use client';

import type { AccountLinkPurpose } from '@debus/contracts';
import { LinkGate } from './link-gate';
import { SetPasswordForm } from './set-password-form';

export function SetPasswordScreen({
  token,
  purpose,
}: {
  token: string | null;
  purpose: AccountLinkPurpose;
}) {
  return (
    <LinkGate token={token} purpose={purpose}>
      {({ recheck }) => (
        <SetPasswordForm token={token as string} purpose={purpose} onLinkProblem={recheck} />
      )}
    </LinkGate>
  );
}
