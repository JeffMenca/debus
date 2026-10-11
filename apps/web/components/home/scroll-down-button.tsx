import { ChevronDown } from 'lucide-react';

// Sits half over the bottom edge of the hero. It is absolute, so it takes no room in the flow, and
// its holder lets clicks through everywhere but on the button itself.
export function ScrollDownButton() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex translate-y-1/2 justify-center">
      <a
        href="#beneficios"
        aria-label="Ver más contenido"
        className="pointer-events-auto flex size-11 animate-bounce-soft items-center justify-center rounded-full bg-card text-primary shadow-float outline-offset-2 transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring motion-reduce:animate-none motion-reduce:transition-none"
      >
        <ChevronDown aria-hidden="true" strokeWidth={1.75} className="size-6" />
      </a>
    </div>
  );
}
