import type { Metadata } from 'next';
import { ProfileCard } from '@/components/account/profile-card';
import { PageHeader } from '@/components/layout/page-header';

export const metadata: Metadata = { title: 'Mi perfil · debus' };

export default function ProfilePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Mi perfil" />
      <div className="max-w-[560px]">
        <ProfileCard />
      </div>
    </div>
  );
}
