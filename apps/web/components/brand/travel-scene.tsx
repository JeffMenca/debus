import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Bus } from './bus';
import { Logo } from './logo';

const MOUNTAINS = (
  <svg viewBox="0 0 1000 180" preserveAspectRatio="none" className="h-full w-1/2">
    <path d="M0 180 L160 60 Q180 45 200 60 L350 180 Z" className="fill-lilac-300" />
    <path d="M280 180 L440 30 Q460 15 480 30 L640 180 Z" className="fill-lilac-500" />
    <path d="M600 180 L740 80 Q755 70 770 80 L920 180 Z" className="fill-lilac-300" />
    <path d="M860 180 L960 105 Q970 98 980 105 L1000 120 V180 Z" className="fill-lilac-200" />
  </svg>
);

const HILLS = (
  <svg viewBox="0 0 1000 120" preserveAspectRatio="none" className="h-full w-1/2">
    <path
      d="M0 120 L0 66 Q120 12 240 56 T480 44 T720 34 T1000 66 L1000 120 Z"
      className="fill-mint-300"
    />
    <path d="M0 120 L0 92 Q160 56 320 88 T640 76 T1000 92 L1000 120 Z" className="fill-mint-500" />
  </svg>
);

// Two copies side by side so translating by -50% loops without a seam.
function ParallaxLayer({ className, children }: { className: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'absolute left-0 flex w-[200%] animate-parallax motion-reduce:animate-none',
        className,
      )}
    >
      {children}
      {children}
    </div>
  );
}

interface TravelSceneProps {
  className?: string;
  // Shown on the right of the logo row, e.g. the sign-in links of the home page.
  actions?: ReactNode;
  // The logo row is the banner of the page: the scene is then a plain block, because a header
  // inside a section is not a banner.
  header?: boolean;
}

export function TravelScene({ className, actions, header = false }: TravelSceneProps) {
  const Root = header ? 'div' : 'section';
  const Bar = header ? 'header' : 'div';
  return (
    <Root
      data-testid={header ? 'hero' : undefined}
      className={cn(
        'relative flex min-h-[620px] flex-1 flex-col gap-7 overflow-hidden rounded-[32px] bg-coral-100 px-11 py-10',
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="absolute top-[120px] right-[16%] size-[130px] animate-sun rounded-full bg-mango-300 motion-reduce:animate-none"
      />
      <div
        aria-hidden="true"
        className="absolute top-[90px] left-0 w-full animate-drift motion-reduce:animate-none"
      >
        <div className="h-[38px] w-[140px] rounded-[40px] bg-card" />
      </div>
      <div
        aria-hidden="true"
        className="absolute top-[200px] left-0 w-full animate-drift [animation-delay:-18s] [animation-duration:44s] motion-reduce:animate-none"
      >
        <div className="h-7 w-24 rounded-[40px] bg-card opacity-85" />
      </div>
      <div
        aria-hidden="true"
        className="absolute top-[170px] left-0 w-full animate-bird motion-reduce:animate-none"
      >
        <svg width="44" height="16" viewBox="0 0 44 16">
          <path
            d="M2 9 Q9 2 16 9 Q23 2 30 9"
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            className="origin-center animate-flap stroke-coral-700 [transform-box:fill-box] motion-reduce:animate-none"
          />
        </svg>
      </div>

      <Bar className="relative z-[2] flex animate-arrive flex-wrap items-center justify-between gap-2 min-[380px]:flex-nowrap motion-reduce:animate-none">
        <Logo compact={Boolean(actions)} />
        {actions}
      </Bar>
      <div className="relative z-[2] flex max-w-[540px] animate-arrive flex-col gap-4 [animation-delay:120ms] motion-reduce:animate-none">
        <h1 className="font-display text-[clamp(46px,5.4vw,76px)] leading-[0.95] font-bold text-balance text-foreground">
          Tu próximo viaje empieza aquí.
        </h1>
        <p className="max-w-[440px] text-lg leading-[1.6] text-coral-900">
          Compra boletos, elige tu asiento y alquila un bus para tu grupo. Todo en un solo lugar.
        </p>
      </div>

      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-[330px]">
        <ParallaxLayer className="bottom-[104px] h-[180px] [animation-duration:48s]">
          {MOUNTAINS}
        </ParallaxLayer>
        <ParallaxLayer className="bottom-[78px] h-[120px]">{HILLS}</ParallaxLayer>
        <div className="absolute inset-x-0 bottom-0 h-[82px] bg-road" />
        <svg
          viewBox="0 0 100 6"
          preserveAspectRatio="none"
          className="absolute bottom-[38px] left-0 h-1.5 w-full"
        >
          <line
            x1="0"
            y1="3"
            x2="100"
            y2="3"
            strokeWidth="3"
            vectorEffect="non-scaling-stroke"
            className="animate-route stroke-mango-300 [stroke-dasharray:14_12] motion-reduce:animate-none"
          />
        </svg>
        <div className="absolute bottom-[46px] left-1/2 -translate-x-1/2">
          <Bus width={320} tone="indigo" />
        </div>
      </div>
    </Root>
  );
}
