const SHAPES = [
  'bg-mango-100 size-64 -left-24 top-[31%]',
  'bg-lilac-100 size-52 -right-16 top-[36%] [animation-delay:-2.5s]',
  'bg-mint-100 size-44 -left-16 top-[61%] [animation-delay:-1.2s]',
  'bg-mango-100 size-56 -right-20 top-[64%] [animation-delay:-3.7s]',
  'bg-lilac-100 size-40 left-[6%] top-[80%] [animation-delay:-1.9s]',
] as const;

// Soft circles behind the page. The holder clips them, so they can never widen the page.
export function FloatingShapes() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {SHAPES.map((shape) => (
        <div
          key={shape}
          className={`absolute animate-float rounded-full motion-reduce:animate-none ${shape}`}
        />
      ))}
    </div>
  );
}
