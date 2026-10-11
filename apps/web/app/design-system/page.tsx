import type { Metadata } from 'next';
import { DesignSystemShowcase } from '@/components/design-system/design-system-showcase';

export const metadata: Metadata = {
  title: 'Sistema de diseño · debus',
  robots: { index: false },
};

export default function DesignSystemPage() {
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-10">
      <DesignSystemShowcase />
    </main>
  );
}
