import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AccountScreen } from '@/components/account/account-screen';

export const metadata: Metadata = { title: 'Mi cuenta · debus' };

// useSearchParams, which holds the open tab and page, needs a Suspense boundary on a prerendered page.
export default function AccountPage() {
  return (
    <Suspense>
      <AccountScreen />
    </Suspense>
  );
}
