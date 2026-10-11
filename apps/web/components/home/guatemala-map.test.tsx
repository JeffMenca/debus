import { render, screen, within } from '@testing-library/react';
import { GuatemalaMap } from './guatemala-map';

const CITIES = [
  'Ciudad de Guatemala',
  'Quetzaltenango',
  'Cobán',
  'Puerto Barrios',
  'Flores',
  'Antigua',
];

describe('GuatemalaMap', () => {
  it('titles the section and says what the map is for, without promising routes or prices', () => {
    render(<GuatemalaMap />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Conectamos todo el país' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Los buses de debus unen las sucursales de Guatemala para que viajes cómodo y sin filas.',
      ),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Q\s?\d|\d/);
  });

  it('adds three rows with an icon each, so the column beside the map is not empty', () => {
    const { container } = render(<GuatemalaMap />);

    const rows = screen.getAllByRole('listitem');
    expect(rows.map((row) => within(row).getByRole('heading', { level: 3 }).textContent)).toEqual([
      'Sucursales en todo el país',
      'Compra sin filas',
      'Tu boleto en tu correo',
    ]);
    expect(screen.getByText('Elige desde dónde sales y adónde llegas.')).toBeInTheDocument();
    expect(
      screen.getByText('Reserva desde tu celular y sube al bus con tu boleto.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Recibes la confirmación apenas pagas.')).toBeInTheDocument();
    expect(container.querySelectorAll('li svg[aria-hidden="true"]')).toHaveLength(3);
    for (const [fill, text] of [
      ['bg-indigo-100', 'text-indigo-700'],
      ['bg-mint-100', 'text-mint-700'],
      ['bg-mango-100', 'text-mango-700'],
    ]) {
      expect(container.querySelector(`li .${fill}.${text}`)).not.toBeNull();
    }
  });

  it('centers the text against the map, and puts it above the map on small screens', () => {
    const { container } = render(<GuatemalaMap />);

    expect(container.querySelector('section')).toHaveClass('items-center');
    const [text, map] = Array.from(container.querySelector('section')!.children);
    expect(text).toContainElement(screen.getByRole('heading', { level: 2 }));
    expect(map).toContainElement(screen.getByRole('img'));
  });

  it('is one image for assistive technology, described with the six cities', () => {
    render(<GuatemalaMap />);

    const map = screen.getByRole('img', { name: /^Mapa de Guatemala/ });
    for (const city of CITIES) expect(map).toHaveAccessibleName(expect.stringContaining(city));
  });

  it('marks the six cities', () => {
    const { container } = render(<GuatemalaMap />);

    const marked = Array.from(container.querySelectorAll('[data-city]')).map((city) =>
      city.getAttribute('data-city'),
    );
    expect(marked).toEqual(CITIES);
  });

  it('draws the country in white with a lilac edge over its neighbors and the sea, all by token', () => {
    const { container } = render(<GuatemalaMap />);

    const country = container.querySelectorAll('path.fill-card.stroke-lilac-300');
    expect(country).toHaveLength(1);
    expect(country[0].getAttribute('d')?.length).toBeGreaterThan(100);
    expect(container.querySelectorAll('path.fill-muted-2')).toHaveLength(4);
    expect(container.querySelector('.bg-sky-100')).not.toBeNull();
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(container.innerHTML).not.toMatch(/\bborder\b/);
  });

  it('joins the capital with the other cities by dashed curves', () => {
    const { container } = render(<GuatemalaMap />);

    const curves = container.querySelectorAll('path[data-route]');
    expect(curves).toHaveLength(5);
    for (const curve of curves) {
      expect(curve.getAttribute('d')).toMatch(/^M[\d. ]+Q[\d. ]+$/);
      expect(curve).toHaveClass('animate-route');
    }
  });

  it('sends a small mango bus along one of the curves', () => {
    const { container } = render(<GuatemalaMap />);

    const bus = container.querySelector('[data-testid="map-bus"]') as SVGElement;
    expect(bus).toHaveClass('animate-drive-along');
    const route = Array.from(container.querySelectorAll('path[data-route]')).map((curve) =>
      curve.getAttribute('d'),
    );
    expect(bus).toHaveClass('[offset-path:var(--route)]');
    expect(route).toContain(/path\('(.+)'\)/.exec(bus.style.getPropertyValue('--route'))?.[1]);
    expect(bus.querySelector('rect')).toHaveClass('fill-mango-300');
  });

  it('stops every animation when the visitor prefers reduced motion', () => {
    const { container } = render(<GuatemalaMap />);

    const animated = container.querySelectorAll('[class*="animate-"]');
    expect(animated.length).toBeGreaterThan(5);
    for (const element of animated) {
      expect(element.getAttribute('class')).toContain('motion-reduce:animate-none');
    }
  });

  it('keeps the bus halfway along its curve while it is not animated', () => {
    const { container } = render(<GuatemalaMap />);

    const bus = container.querySelector('[data-testid="map-bus"]') as SVGElement;
    expect(bus).toHaveClass('[offset-distance:50%]');
  });

  it('keeps the bus icon of the pin at a size of the icon scale', () => {
    const { container } = render(<GuatemalaMap />);

    const icon = container.querySelector('[data-testid="map-bus"] svg')!;
    expect(['16', '20', '24']).toContain(icon.getAttribute('width'));
  });

  it('draws the neighbor names in a solid token color, readable on their fill', () => {
    const { container } = render(<GuatemalaMap />);

    const names = Array.from(container.querySelectorAll('text.fill-muted-foreground'));
    expect(names.map((name) => name.textContent)).toEqual([
      'MÉXICO',
      'BELICE',
      'HONDURAS',
      'EL SALVADOR',
    ]);
    expect(container.innerHTML).not.toMatch(/fill-muted-foreground\/\d/);
  });

  it('grows the labels as the map shrinks, so they keep a readable size', () => {
    const { container } = render(<GuatemalaMap />);

    expect(container.firstElementChild?.querySelector('.\\@container')).not.toBeNull();
    const city = container.querySelector('[data-city] text')!;
    const neighbor = container.querySelector('text.fill-muted-foreground')!;
    for (const label of [city, neighbor]) {
      expect(label.getAttribute('class')).toMatch(/@max-\[300px\]:text-\[\d+px\]/);
      expect(label.getAttribute('class')).toMatch(/@max-\[340px\]:text-\[\d+px\]/);
    }
  });

  it('does not repeat the seat icon of the benefits above: the row about buying uses a phone', () => {
    const { container } = render(<GuatemalaMap />);

    const icons = Array.from(container.querySelectorAll('li svg'));
    expect(icons.map((icon) => icon.getAttribute('class')?.match(/lucide-[a-z-]+/)?.[0])).toEqual([
      'lucide-map-pinned',
      'lucide-smartphone',
      'lucide-mail',
    ]);
    for (const icon of icons) expect(icon).toHaveAttribute('stroke-width', '1.75');
  });
});
