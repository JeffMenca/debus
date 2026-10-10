// Brand illustration used in heroes, empty states, fleet rows and live route lanes.
import { cn } from '@/lib/utils';

const TONES = {
  indigo: { body: '#3E4FC7', dark: '#2B3896', a1: '#FFCE5C', a2: '#FF9F80' },
  coral: { body: '#F7826A', dark: '#C9573C', a1: '#FFF0C2', a2: '#3E4FC7' },
  teal: { body: '#2AA886', dark: '#1B7D63', a1: '#FFCE5C', a2: '#FFFFFF' },
  mango: { body: '#FFC53D', dark: '#D99A12', a1: '#3E4FC7', a2: '#FF9F80' },
} as const;

export type BusTone = keyof typeof TONES;

interface BusProps {
  width?: number;
  tone?: BusTone;
  moving?: boolean;
  className?: string;
}

const WINDOW_X = [17, 51, 85, 119, 153, 187];

export function Bus({ width = 284, tone = 'indigo', moving = true, className }: BusProps) {
  const c = TONES[tone];
  const wheel = (cx: number) => (
    <g className={cn('wheel', moving && 'animate-wheel')}>
      <circle cx={cx} cy={114} r={17} fill="#1B1F3B" />
      <circle cx={cx} cy={114} r={9} fill="#D5D9EE" />
      <rect x={cx - 1.5} y={105} width={3} height={18} fill="#1B1F3B" />
      <rect x={cx - 9} y={112.5} width={18} height={3} fill="#1B1F3B" />
      <circle cx={cx} cy={114} r={3} fill={c.a1} />
    </g>
  );

  return (
    <svg
      viewBox="0 0 284 134"
      width={width}
      className={cn('block overflow-visible', className)}
      role="img"
      aria-label="Bus"
    >
      <ellipse cx={142} cy={129} rx={124} ry={5} fill="#1B1F3B" opacity={0.12} />
      {moving && (
        <g>
          {[0, 0.5, 1].map((delay) => (
            <circle
              key={delay}
              cx={2}
              cy={106}
              r={6}
              fill="#C9CEE6"
              className="wheel animate-puff opacity-0"
              style={{ animationDelay: `${delay}s` }}
            />
          ))}
        </g>
      )}
      <g className={cn(moving && 'animate-bob')}>
        <rect x={80} y={3} width={88} height={11} rx={4} fill={c.dark} />
        <path
          d="M15 12 H246 C260 12 266 20 268 32 L274 92 V104 C274 110 270 114 264 114 H17 C11 114 7 110 7 104 V20 C7 15 10 12 15 12 Z"
          fill={c.body}
        />
        {WINDOW_X.map((x) => (
          <rect key={x} x={x} y={22} width={30} height={34} rx={4} fill="#E3EEFF" />
        ))}
        <path d="M22 54 L36 24 H43 L29 54 Z" fill="#fff" opacity={0.55} />
        <path d="M90 54 L104 24 H108 L94 54 Z" fill="#fff" opacity={0.55} />
        <path d="M158 54 L172 24 H176 L162 54 Z" fill="#fff" opacity={0.55} />
        <rect x={223} y={22} width={20} height={72} rx={3} fill="#E3EEFF" />
        <rect x={232} y={24} width={2} height={68} fill={c.body} opacity={0.5} />
        <path d="M249 22 H253 C259 22 263 28 264 34 L269 70 H249 Z" fill="#E3EEFF" />
        <path d="M252 66 L262 30 H265 L256 66 Z" fill="#fff" opacity={0.55} />
        <rect x={249} y={14} width={17} height={5} rx={1.5} fill={c.a1} />
        <rect x={7} y={62} width={212} height={7} fill={c.a1} />
        <rect x={7} y={71} width={212} height={4} fill={c.a2} />
        <rect x={247} y={74} width={27} height={6} fill={c.a1} />
        <path
          d="M7 96 H274 V104 C274 110 270 114 264 114 H17 C11 114 7 110 7 104 Z"
          fill={c.dark}
        />
        <rect x={262} y={84} width={11} height={8} rx={2} fill="#FFF6D5" />
        <rect x={7} y={78} width={5} height={12} rx={1.5} fill="#FF9DB5" />
        <path d="M268 22 H277 A2 2 0 0 1 279 24 V36 H275 V27 H268 Z" fill={c.dark} />
        <path d="M42 114 A23 23 0 0 1 88 114 Z" fill="#1B1F3B" />
        <path d="M190 114 A23 23 0 0 1 236 114 Z" fill="#1B1F3B" />
      </g>
      {wheel(65)}
      {wheel(213)}
    </svg>
  );
}
