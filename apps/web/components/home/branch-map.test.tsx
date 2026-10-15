import { render, screen, waitFor } from '@testing-library/react';
import { queryWrapper } from '../../test-support/query-wrapper';
import { BranchMap, labelFor, labelText } from './branch-map';

const place = (name: string, lat: number, lon: number, municipality = name, department = name) => ({
  id: `00000000-0000-4000-8000-${String(Math.abs(Math.round(lon * 1000))).padStart(12, '0')}`,
  name,
  municipality,
  department,
  latitude: lat,
  longitude: lon,
});
const GUATEMALA = place('Ciudad de Guatemala', 14.6349, -90.5069, 'Guatemala', 'Guatemala');
const XELA = place('Quetzaltenango', 14.8347, -91.5181, 'Quetzaltenango', 'Quetzaltenango');
const FLORES = place('Flores', 16.93, -89.892, 'Flores', 'Petén');
const ANTIGUA = place('Antigua Guatemala', 14.5586, -90.7295, 'Antigua Guatemala', 'Sacatepéquez');
const COBAN = place('Cobán', 15.47, -90.37, 'Cobán', 'Alta Verapaz');

const answer = (items: ReturnType<typeof place>[]) =>
  Response.json({ items, total: items.length, page: 1, pageSize: 100 });

function renderMap() {
  const { wrapper } = queryWrapper();
  return render(<BranchMap>{null}</BranchMap>, { wrapper });
}
const cities = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-city]')).map((city) =>
    city.getAttribute('data-city'),
  );

afterEach(() => jest.restoreAllMocks());

describe('labelFor', () => {
  it('puts the name of a branch east of the center to the right of its pin', () => {
    expect(labelFor([400, 120], 300)).toMatchObject({ anchor: 'start' });
    expect(labelFor([400, 120], 300).dx).toBeGreaterThan(0);
  });

  it('puts the name of a branch west of the center to the left of its pin', () => {
    expect(labelFor([220, 120], 300)).toMatchObject({ anchor: 'end' });
    expect(labelFor([220, 120], 300).dx).toBeLessThan(0);
  });

  it('keeps the name beside the pin, level with it', () => {
    expect(labelFor([400, 120], 300).dy).toBeCloseTo(labelFor([220, 120], 300).dy);
  });
});

describe('labelText', () => {
  it('drops the country-sounding tail of a long town name so it fits beside its pin', () => {
    expect(labelText('Antigua Guatemala')).toBe('Antigua');
  });

  it('keeps the name of the capital and every other name as it is', () => {
    expect(labelText('Ciudad de Guatemala')).toBe('Ciudad de Guatemala');
    expect(labelText('Quetzaltenango')).toBe('Quetzaltenango');
    expect(labelText('Guatemala')).toBe('Guatemala');
  });
});

describe('labelFor near the left edge', () => {
  it('centers the name above the pin when there is no room to its left', () => {
    expect(labelFor([108, 465], 300)).toEqual({ dx: 0, dy: -1.05, anchor: 'middle' });
  });
});

describe('BranchMap', () => {
  it('draws the country alone while the branches load, with no city that may not be a branch', () => {
    jest.spyOn(global, 'fetch').mockReturnValue(new Promise(() => undefined));

    const { container } = renderMap();

    expect(cities(container)).toEqual([]);
    expect(container.querySelector('path[data-route]')).toBeNull();
    expect(container.querySelector('[data-testid="map-bus"]')).toBeNull();
    expect(screen.getByRole('img', { name: 'Mapa de Guatemala.' })).toBeInTheDocument();
  });

  it('draws one pin with its name for each branch the API gives', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(answer([GUATEMALA, XELA, FLORES]));

    const { container } = renderMap();

    await waitFor(() =>
      expect(cities(container)).toEqual(['Ciudad de Guatemala', 'Quetzaltenango', 'Flores']),
    );
    for (const name of ['Ciudad de Guatemala', 'Quetzaltenango', 'Flores']) {
      expect(container.querySelector(`[data-city="${name}"] text`)).toHaveTextContent(name);
    }
  });

  it('puts the label of each branch on the side that leaves the map room', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(answer([GUATEMALA, XELA, FLORES]));

    const { container } = renderMap();

    await waitFor(() => expect(cities(container)).toHaveLength(3));
    const anchor = (name: string) =>
      container.querySelector(`[data-city="${name}"] text`)?.getAttribute('text-anchor');
    expect(anchor('Flores')).toBe('start');
    // Quetzaltenango is so far west that a name on its left would leave the map.
    expect(anchor('Quetzaltenango')).toBe('middle');
    expect(anchor('Ciudad de Guatemala')).toBe('start');
  });

  it('joins the capital with every other branch and sends the bus along the longest curve', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(answer([XELA, GUATEMALA, FLORES, COBAN]));

    const { container } = renderMap();

    await waitFor(() => expect(cities(container)).toHaveLength(4));
    const curves = Array.from(container.querySelectorAll('path[data-route]'));
    expect(curves.map((curve) => curve.getAttribute('data-route')).sort()).toEqual([
      'Cobán',
      'Flores',
      'Quetzaltenango',
    ]);
    const bus = container.querySelector('[data-testid="map-bus"]') as SVGElement;
    const longest = container.querySelector('path[data-route="Flores"]')?.getAttribute('d');
    expect(/path\('(.+)'\)/.exec(bus.style.getPropertyValue('--route'))?.[1]).toBe(longest);
  });

  it('marks the capital as the hub, wherever it is in the list', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(answer([XELA, FLORES, GUATEMALA]));

    const { container } = renderMap();

    await waitFor(() => expect(cities(container)).toHaveLength(3));
    expect(
      container.querySelector('[data-city="Ciudad de Guatemala"] circle.fill-primary'),
    ).not.toBeNull();
    expect(container.querySelector('[data-city="Flores"] circle.fill-primary')).toBeNull();
  });

  it('takes the first branch as the hub when none is in the capital', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(answer([XELA, FLORES]));

    const { container } = renderMap();

    await waitFor(() => expect(cities(container)).toEqual(['Quetzaltenango', 'Flores']));
    expect(
      container.querySelector('[data-city="Quetzaltenango"] circle.fill-primary'),
    ).not.toBeNull();
    expect(container.querySelectorAll('path[data-route]')).toHaveLength(1);
  });

  it('draws a lone branch without curves or a bus', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(answer([ANTIGUA]));

    const { container } = renderMap();

    await waitFor(() => expect(cities(container)).toEqual(['Antigua Guatemala']));
    expect(container.querySelector('[data-city] text')).toHaveTextContent(/^Antigua$/);
    expect(container.querySelectorAll('path[data-route]')).toHaveLength(0);
    expect(container.querySelector('[data-testid="map-bus"]')).toBeNull();
  });

  it('describes the map with the names of the branches it draws', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(answer([GUATEMALA, XELA, FLORES]));

    renderMap();

    expect(
      await screen.findByRole('img', {
        name: 'Mapa de Guatemala con curvas que unen Ciudad de Guatemala, Quetzaltenango y Flores.',
      }),
    ).toBeInTheDocument();
  });

  it('stays with the country alone when the request fails', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(Response.json({ message: 'No disponible' }, { status: 503 }));

    const { container } = renderMap();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(cities(container)).toEqual([]);
  });

  it('stays with the country alone when no branch is active', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(answer([]));

    const { container } = renderMap();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(cities(container)).toEqual([]);
  });

  it('keeps the static layers it is given under the pins', async () => {
    jest.spyOn(global, 'fetch').mockReturnValue(new Promise(() => undefined));
    const { wrapper } = queryWrapper();

    const { container } = render(
      <BranchMap>
        <path data-testid="country" d="M0 0" />
      </BranchMap>,
      { wrapper },
    );

    const svg = container.querySelector('svg')!;
    expect(svg.firstElementChild).toBe(screen.getByTestId('country'));
  });

  it('stops every animation when the visitor prefers reduced motion', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(answer([GUATEMALA, XELA, FLORES]));

    const { container } = renderMap();

    await waitFor(() => expect(cities(container)).toHaveLength(3));
    const animated = container.querySelectorAll('[class*="animate-"]');
    expect(animated.length).toBeGreaterThan(2);
    for (const element of animated) {
      expect(element.getAttribute('class')).toContain('motion-reduce:animate-none');
    }
  });

  it('draws by token, never with a loose color', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(answer([GUATEMALA, XELA]));

    const { container } = renderMap();

    await waitFor(() => expect(cities(container)).toHaveLength(2));
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});
