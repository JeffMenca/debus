import { Bus } from '@/components/brand/bus';

// The top of the search: sun, title and a bus on the road, in the colors of the travel scenes.
export function TripSearchHero() {
  return (
    <section
      aria-labelledby="trip-search-title"
      className="relative flex min-h-[340px] flex-col gap-4 overflow-hidden rounded-[32px] bg-coral-100 px-6 pt-10 pb-28 sm:min-h-[400px] sm:px-11 sm:pt-14"
    >
      <span
        aria-hidden
        className="absolute top-10 right-[10%] size-24 animate-sun rounded-full bg-mango-300 motion-reduce:animate-none sm:size-[150px]"
      />
      <h1
        id="trip-search-title"
        className="relative max-w-[600px] animate-arrive font-display text-[clamp(44px,7vw,84px)] leading-[0.95] font-bold text-balance motion-reduce:animate-none"
      >
        ¿A dónde viajamos hoy?
      </h1>
      <p className="relative max-w-[500px] animate-arrive text-lg leading-[1.6] text-coral-900 [animation-delay:120ms] motion-reduce:animate-none">
        Viajes directos entre sucursales. Elige tu asiento y paga en segundos con tu cartera.
      </p>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-24">
        <div className="absolute inset-x-0 bottom-0 h-16 bg-road" />
        <span className="absolute inset-x-0 bottom-[30px] border-t-[3px] border-dashed border-mango-300" />
        <div className="absolute bottom-[34px] left-[12%]">
          <Bus width={150} tone="indigo" />
        </div>
      </div>
    </section>
  );
}
