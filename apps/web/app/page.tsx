import { TravelScene } from '@/components/brand/travel-scene';
import { BenefitCards } from '@/components/home/benefit-cards';
import { Faq } from '@/components/home/faq';
import { FloatingShapes } from '@/components/home/floating-shapes';
import { GuatemalaMap } from '@/components/home/guatemala-map';
import { HomeActions } from '@/components/home/home-actions';
import { RentalBand } from '@/components/home/rental-band';
import { ScrollDownButton } from '@/components/home/scroll-down-button';
import { SiteFooter } from '@/components/home/site-footer';

export default function HomePage() {
  return (
    <>
      <div className="relative isolate flex flex-col gap-10 bg-background pb-10 md:gap-16 md:pb-16">
        <FloatingShapes />
        <div className="relative flex p-4.5 pb-0">
          <TravelScene header actions={<HomeActions />} className="px-4 sm:px-11" />
          <ScrollDownButton />
        </div>
        <main className="flex flex-col gap-10 md:gap-16">
          <BenefitCards />
          <GuatemalaMap />
          <Faq />
          <RentalBand />
        </main>
      </div>
      <SiteFooter />
    </>
  );
}
