import { ChevronDown } from 'lucide-react';
import { Bus } from '@/components/brand/bus';

const QUESTIONS = [
  {
    question: '¿Necesito una cuenta para comprar?',
    answer:
      'Para comprar en línea sí: crear tu cuenta toma un minuto. Si prefieres, también puedes comprar en la ventanilla de cualquier sucursal, sin cuenta.',
  },
  {
    question: '¿Cómo pago mis boletos?',
    answer:
      'Con el saldo de tu cartera digital. La recargas cuando quieras, indicando la cantidad y la fecha del pago.',
  },
  {
    question: '¿Puedo alquilar un bus para mi grupo?',
    answer:
      'Sí. Pides tu viaje indicando origen, destino, fecha y número de pasajeros; la sucursal confirma el precio y tú lo pagas con tu cartera.',
  },
  {
    question: '¿Qué pasa si se cancela mi viaje?',
    answer: 'Te devolvemos el valor de tu boleto a tu cartera digital.',
  },
] as const;

export function Faq() {
  return (
    <section
      aria-labelledby="faq-title"
      className="grid animate-arrive items-center gap-8 px-4.5 [animation-delay:180ms] sm:px-11 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14 motion-reduce:animate-none"
    >
      <div className="flex flex-col gap-4">
        <h2
          id="faq-title"
          className="font-display text-[clamp(32px,4vw,48px)] leading-none font-bold text-balance text-foreground"
        >
          Preguntas frecuentes
        </h2>
        <p className="max-w-[420px] text-lg leading-[1.6] text-muted-foreground">
          Lo que más nos preguntan antes de viajar.
        </p>
        <div data-bus aria-hidden="true" className="max-sm:hidden">
          <Bus width={200} tone="teal" />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {QUESTIONS.map(({ question, answer }) => (
          <details key={question} className="group rounded-[24px] bg-card">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-[24px] px-6 py-5 font-display text-[18px] leading-[1.25] font-bold text-foreground outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
              {question}
              <ChevronDown
                aria-hidden="true"
                strokeWidth={1.75}
                className="size-5 shrink-0 text-primary transition-transform group-open:rotate-180 motion-reduce:transition-none"
              />
            </summary>
            <p className="px-6 pb-5 text-[15px] leading-[1.6] text-muted-foreground">{answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
