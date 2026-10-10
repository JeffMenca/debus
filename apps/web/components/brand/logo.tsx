import { Bus as BusIcon } from 'lucide-react';

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex size-[42px] items-center justify-center rounded-[14px] bg-primary text-mango-300">
        <BusIcon aria-hidden strokeWidth={1.75} className="size-5" />
      </div>
      <span className="font-display text-[26px] font-bold text-foreground">debus</span>
    </div>
  );
}
