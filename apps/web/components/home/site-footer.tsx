import { Bus } from '@/components/brand/bus';
import { Logo } from '@/components/brand/logo';
import { FooterAccount } from './footer-account';

// The year is read on the server, so every visitor sees the same one.
export function SiteFooter({ year = new Date().getFullYear() }: { year?: number }) {
  return (
    <footer className="animate-arrive overflow-hidden rounded-t-[32px] bg-sidebar px-4.5 pt-12 pb-8 text-sidebar-foreground [animation-delay:300ms] sm:px-11 motion-reduce:animate-none">
      <div className="flex flex-col gap-10 md:flex-row md:justify-between">
        <div className="flex max-w-[360px] flex-col gap-4">
          <Logo tone="light" />
          <p className="text-[15px] leading-[1.55]">
            Boletos, viajes y alquiler de buses en Guatemala.
          </p>
        </div>
        <FooterAccount />
      </div>
      <div
        aria-hidden="true"
        data-testid="footer-road"
        className="relative mt-12 h-12 overflow-hidden"
      >
        <div className="absolute inset-x-0 bottom-0 h-3 rounded-full bg-sidebar-accent" />
        <svg
          viewBox="0 0 100 6"
          preserveAspectRatio="none"
          className="absolute inset-x-0 bottom-0 h-3 w-full"
        >
          <line
            x1="0"
            y1="3"
            x2="100"
            y2="3"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            className="animate-route stroke-mango-300 [stroke-dasharray:10_10] motion-reduce:animate-none"
          />
        </svg>
        <div
          data-bus
          className="absolute bottom-1 left-[40%] animate-drive-across [animation-duration:16s] motion-reduce:animate-none"
        >
          <Bus width={72} tone="mango" />
        </div>
      </div>
      <p className="mt-6 text-[13px] text-sidebar-foreground/70">{`© ${year} debus. Hecho en Guatemala.`}</p>
    </footer>
  );
}
