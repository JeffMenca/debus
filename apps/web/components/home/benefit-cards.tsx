import { Armchair, BusFront, Ticket, type LucideIcon } from 'lucide-react';

interface Benefit {
  title: string;
  text: string;
  icon: LucideIcon;
  // Surface (100) and text (700) of the same family.
  tone: string;
}

const BENEFITS: readonly Benefit[] = [
  {
    title: 'Compra tus boletos',
    text: 'Elige tu viaje y paga en segundos, desde tu celular o tu computadora.',
    icon: Ticket,
    tone: 'bg-mango-100 text-mango-700',
  },
  {
    title: 'Elige tu asiento',
    text: 'Mira el bus y escoge tu lugar, junto a la ventana o cerca del pasillo.',
    icon: Armchair,
    tone: 'bg-mint-100 text-mint-700',
  },
  {
    title: 'Alquila un bus para tu grupo',
    text: 'Pide un bus para tu familia o tu equipo y confirma el precio antes de pagar.',
    icon: BusFront,
    tone: 'bg-coral-100 text-coral-700',
  },
];

export function BenefitCards() {
  return (
    <div className="grid gap-4 px-4.5 pb-4.5 sm:grid-cols-3">
      {BENEFITS.map(({ title, text, icon: Icon, tone }) => (
        <article key={title} className={`flex flex-col gap-3 rounded-[24px] p-6 ${tone}`}>
          <Icon aria-hidden="true" strokeWidth={1.75} className="size-6" />
          <h2 className="font-display text-[22px] leading-[1.15] font-bold">{title}</h2>
          <p className="text-[15px] leading-[1.55]">{text}</p>
        </article>
      ))}
    </div>
  );
}
