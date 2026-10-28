import {
  NEIGHBOUR_LABELS,
  branchMarkerElement,
  busMarkerElement,
  neighbourLabelElement,
} from './map-markers';

describe('branchMarkerElement', () => {
  it('marks the origin with its name and a pulse', () => {
    const marker = branchMarkerElement('Quetzaltenango', 'origin');

    expect(marker).toHaveAttribute('role', 'img');
    expect(marker).toHaveAttribute('aria-label', 'Sucursal de origen: Quetzaltenango');
    expect(marker).toHaveTextContent('Quetzaltenango');
    expect(marker.querySelector('[data-part="pin"]')).toHaveClass(
      'bg-primary',
      'animate-pulse-live',
    );
    expect(marker.querySelector('[data-part="tag"]')).toHaveClass('bg-primary');
  });

  it('marks a destination with a ring and its name', () => {
    const marker = branchMarkerElement('Huehuetenango', 'destination');

    expect(marker).toHaveAttribute('aria-label', 'Destino con ruta: Huehuetenango');
    expect(marker).toHaveTextContent('Huehuetenango');
    expect(marker.querySelector('[data-part="pin"]')).toHaveClass('ring-primary');
  });

  it('shows the other branches in gray and without a name on the map', () => {
    const marker = branchMarkerElement('Cobán', 'idle');

    expect(marker).toHaveAttribute('aria-label', 'Sucursal: Cobán');
    expect(marker).not.toHaveTextContent('Cobán');
    expect(marker.querySelector('[data-part="tag"]')).toBeNull();
    expect(marker.querySelector('[data-part="pin"]')).toHaveClass('ring-muted-foreground/60');
  });

  it.each([
    ['below', ['top-full', 'mt-1.5', '-translate-x-1/2']],
    ['above', ['bottom-full', 'mb-1.5', '-translate-x-1/2']],
    ['right', ['left-full', 'ml-1.5', '-translate-y-1/2']],
    ['left', ['right-full', 'mr-1.5', '-translate-y-1/2']],
  ] as const)('puts the tag %s the pin', (side, classes) => {
    const marker = branchMarkerElement('Antigua Guatemala', 'destination', side);

    expect(marker.querySelector('[data-part="tag"]')).toHaveClass(...classes);
  });

  it('puts the tag below the pin when no side is given', () => {
    const marker = branchMarkerElement('Antigua Guatemala', 'destination');

    expect(marker.querySelector('[data-part="tag"]')).toHaveClass('top-full');
  });

  it.each(['below', 'above', 'right', 'left'] as const)(
    'leaves the pin on the coordinate whatever side the tag takes (%s)',
    (side) => {
      const marker = branchMarkerElement('Cobán', 'origin', side);

      // The marker is a box centered on the coordinate, and the pin is centered in the box.
      expect(marker).toHaveClass('size-6', '-translate-x-1/2', '-translate-y-1/2');
      expect(marker.querySelector('[data-part="pin"]')).toHaveClass(
        'absolute',
        'top-1/2',
        'left-1/2',
        '-translate-x-1/2',
        '-translate-y-1/2',
      );
    },
  );

  it('writes the name as text, never as markup', () => {
    const marker = branchMarkerElement('<img src=x onerror=alert(1)>', 'destination');

    expect(marker.querySelector('img')).toBeNull();
    expect(marker).toHaveTextContent('<img src=x onerror=alert(1)>');
  });
});

describe('busMarkerElement', () => {
  it('draws a bus on a mango tile that screen readers skip', () => {
    const marker = busMarkerElement();

    expect(marker).toHaveAttribute('aria-hidden', 'true');
    expect(marker).toHaveClass('bg-mango-300');
    expect(marker.querySelector('svg')).not.toBeNull();
  });
});

describe('neighbourLabelElement', () => {
  it('writes the name of a neighbour country in small capitals that screen readers skip', () => {
    const label = neighbourLabelElement('Belice');

    expect(label).toHaveTextContent('Belice');
    expect(label).toHaveAttribute('aria-hidden', 'true');
    expect(label).toHaveClass('uppercase');
  });

  it('knows the four neighbours of Guatemala', () => {
    expect(NEIGHBOUR_LABELS.map((label) => label.name)).toEqual([
      'México',
      'Belice',
      'Honduras',
      'El Salvador',
    ]);
  });
});
