'use client';

import { ArrowRight } from 'lucide-react';
import { Bus } from '@/components/brand/bus';
import { TextLink } from '@/components/ui/text-link';
import { useAudience } from '@/hooks/use-audience';

export function RentalBand() {
  const audience = useAudience();

  return (
    <section
      aria-labelledby="rental-title"
      className="relative mx-4.5 flex animate-arrive flex-col items-start gap-8 overflow-hidden rounded-[32px] bg-coral-100 p-8 text-coral-700 [animation-delay:240ms] sm:px-11 sm:py-12 md:flex-row md:items-center md:justify-between motion-reduce:animate-none"
    >
      <div
        aria-hidden="true"
        className="absolute -top-16 -right-16 size-60 animate-float rounded-full bg-mango-300 opacity-55 motion-reduce:animate-none"
      />
      <div className="relative flex max-w-[520px] flex-col gap-3">
        <h2
          id="rental-title"
          className="font-display text-[clamp(32px,4vw,48px)] leading-none font-bold text-balance"
        >
          ¿Viajas en grupo?
        </h2>
        <p className="text-lg leading-[1.6]">
          Alquila un bus completo con chofer para tu familia, tu institución o tu empresa.
        </p>
        <div className={audience === 'checking' ? 'min-h-6' : undefined}>
          {audience === 'CLIENT' && (
            <TextLink
              href="/alquiler"
              tone="coral"
              size="md"
              className="group underline underline-offset-4"
            >
              Pide tu cotización
              <ArrowRight
                aria-hidden="true"
                strokeWidth={1.75}
                className="ml-1.5 inline-block size-4 align-text-bottom transition-transform group-hover:translate-x-1 motion-reduce:transition-none"
              />
            </TextLink>
          )}
          {audience === 'visitor' && (
            <TextLink
              href="/registro"
              tone="coral"
              size="md"
              className="group underline underline-offset-4"
            >
              Crea tu cuenta para pedir tu cotización
              <ArrowRight
                aria-hidden="true"
                strokeWidth={1.75}
                className="ml-1.5 inline-block size-4 align-text-bottom transition-transform group-hover:translate-x-1 motion-reduce:transition-none"
              />
            </TextLink>
          )}
        </div>
      </div>
      <div data-bus aria-hidden="true" className="relative max-w-full shrink-0 md:mr-6">
        <Bus width={220} tone="coral" className="max-w-full" />
      </div>
    </section>
  );
}
