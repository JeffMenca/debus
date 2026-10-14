import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ListPageSkeleton } from '@/components/data/list-page-skeleton';
import { CategoriesScreen } from '@/components/expenses/categories-screen';

export const metadata: Metadata = { title: 'Categorías de gasto · debus' };

// useSearchParams, which holds the list state, needs a Suspense boundary on a prerendered page.
export default function CategoriesPage() {
  return (
    <Suspense fallback={<ListPageSkeleton title="Categorías de gasto" />}>
      <CategoriesScreen />
    </Suspense>
  );
}
