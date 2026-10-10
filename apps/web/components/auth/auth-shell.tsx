import type { ReactNode } from 'react';
import { TravelScene } from '@/components/brand/travel-scene';

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-wrap bg-background">
      <div className="flex min-w-0 flex-[1_1_600px] p-4.5">
        <TravelScene />
      </div>
      <div className="relative flex min-w-0 flex-[1_1_460px] items-center justify-center overflow-hidden px-7 py-12">
        <div
          aria-hidden="true"
          className="absolute top-[60px] -right-10 size-40 animate-float rounded-full bg-mango-100 motion-reduce:animate-none"
        />
        <div
          aria-hidden="true"
          className="absolute bottom-10 left-[30px] size-[90px] animate-float rounded-[28px] bg-mint-100 [animation-delay:-2.5s] motion-reduce:animate-none"
        />
        {children}
      </div>
    </main>
  );
}
