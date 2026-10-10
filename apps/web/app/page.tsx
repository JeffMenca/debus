import { TravelScene } from '@/components/brand/travel-scene';
import { BenefitCards } from '@/components/home/benefit-cards';
import { HomeActions } from '@/components/home/home-actions';

export default function HomePage() {
  return (
    <main className="flex min-h-dvh flex-col gap-4 bg-background">
      <div className="flex p-4.5 pb-0">
        <TravelScene actions={<HomeActions />} className="px-4 sm:px-11" />
      </div>
      <BenefitCards />
    </main>
  );
}
