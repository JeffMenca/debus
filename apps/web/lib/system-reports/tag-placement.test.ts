import { type TagAnchor, type TagSide, placeTags, tagBox, tagWidth } from './tag-placement';

const at = (id: string, x: number, y: number, name = 'Sucursal'): TagAnchor => ({
  id,
  x,
  y,
  width: tagWidth(name),
});

const overlap = (a: ReturnType<typeof tagBox>, b: ReturnType<typeof tagBox>) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

// No tag crosses another tag, and none covers the pin of another branch.
function expectClear(items: TagAnchor[], sides: Record<string, TagSide>) {
  const boxes = items.map((item) => tagBox(item, sides[item.id]!));
  boxes.forEach((box, index) => {
    boxes.slice(index + 1).forEach((other) => expect(overlap(box, other)).toBe(false));
    items.forEach((item) => {
      const pin = { left: item.x - 12, right: item.x + 12, top: item.y - 12, bottom: item.y + 12 };
      expect(overlap(box, pin)).toBe(false);
    });
  });
}

describe('tagWidth', () => {
  it('estimates the width from the characters of the name, plus the padding', () => {
    expect(tagWidth('Antigua')).toBe(7 * 7.5 + 24);
    expect(tagWidth('')).toBe(24);
  });

  it('is never shorter than what a short name really takes', () => {
    // "Cobán" measures 58 px in the tag: the estimate must not fall below it.
    expect(tagWidth('Cobán')).toBeGreaterThanOrEqual(58);
  });
});

describe('tagBox', () => {
  const item = at('a', 100, 100, 'Xela');
  const { width } = item;

  it('puts the tag centered under, over, or beside the pin, a gap away from it', () => {
    expect(tagBox(item, 'below')).toEqual({
      left: 100 - width / 2,
      right: 100 + width / 2,
      top: 118,
      bottom: 142,
    });
    expect(tagBox(item, 'above')).toEqual({
      left: 100 - width / 2,
      right: 100 + width / 2,
      top: 58,
      bottom: 82,
    });
    expect(tagBox(item, 'right')).toEqual({ left: 118, right: 118 + width, top: 88, bottom: 112 });
    expect(tagBox(item, 'left')).toEqual({ left: 82 - width, right: 82, top: 88, bottom: 112 });
  });
});

describe('placeTags', () => {
  it('puts the tag of an isolated branch below its pin', () => {
    expect(placeTags([at('a', 200, 200)])).toEqual({ a: 'below' });
  });

  it('answers nothing for no branches', () => {
    expect(placeTags([])).toEqual({});
  });

  it('gives the origin the first choice, then moves the next one out of its way', () => {
    // Guatemala City and Antigua at country zoom: 22 px apart across and 7 px down.
    const items = [
      at('guatemala', 300, 200, 'Ciudad de Guatemala'),
      at('antigua', 278, 207, 'Antigua Guatemala'),
    ];

    const sides = placeTags(items);

    expect(sides.guatemala).not.toBe(sides.antigua);
    expectClear(items, sides);
  });

  it('keeps the preferred side for whoever comes first', () => {
    const near = [at('first', 100, 100, 'Uno'), at('second', 100, 100, 'Dos')];

    const sides = placeTags(near);

    expect(sides.first).toBe('below');
    expect(sides.second).toBe('above');
  });

  it('leaves no tag over another when three branches crowd together and a side is free', () => {
    const items = [
      at('guatemala', 300, 200, 'Ciudad de Guatemala'),
      at('antigua', 278, 207, 'Antigua Guatemala'),
      at('escuintla', 292, 232, 'Escuintla'),
    ];

    expectClear(items, placeTags(items));
  });

  it('falls back to below when every side is equally taken', () => {
    const center = at('center', 200, 200, 'Centro');
    const block = (id: string, x: number, y: number) => at(id, x, y, 'Muro');
    const items = [
      center,
      block('n', 200, 170),
      block('s', 200, 230),
      block('e', 260, 200),
      block('w', 140, 200),
    ];

    expect(placeTags(items).center).toBe('below');
  });

  it('answers a side for every branch it was given', () => {
    const items = [at('a', 10, 10), at('b', 500, 400), at('c', 12, 14)];

    expect(Object.keys(placeTags(items)).sort()).toEqual(['a', 'b', 'c']);
  });

  it('keeps a tag off the pin of a branch that has no tag', () => {
    const tagged = at('tagged', 200, 200, 'Con nombre');
    const idle = { x: 200, y: 230 };

    expect(placeTags([tagged]).tagged).toBe('below');
    expect(placeTags([tagged], [tagged, idle]).tagged).toBe('above');
  });

  describe('when no side is free', () => {
    it('takes the side that covers the least, and a pin before a tag', () => {
      // Below is hidden by a tag already placed, the other three only reach a pin: above wins.
      const first = at('first', 200, 200, 'Primero');
      const second = at('second', 200, 206, 'Segundo');
      const pins = [first, second, { x: 200, y: 170 }, { x: 270, y: 206 }, { x: 150, y: 206 }];

      const sides = placeTags([first, second], pins);

      expect(sides.first).toBe('below');
      expect(sides.second).toBe('above');
    });

    it('takes the side that covers a smaller part of a pin', () => {
      const lone = at('lone', 200, 200, 'Solo');
      // Pins around it, bigger overlap below and above than to the left.
      const pins = [
        lone,
        { x: 200, y: 230 },
        { x: 200, y: 170 },
        { x: 260, y: 200 },
        { x: 138, y: 224 },
      ];

      expect(placeTags([lone], pins).lone).toBe('left');
    });
  });

  describe('with the branches of the seed at 390 px', () => {
    // Pins as they fall on the container of a phone: Ciudad de Guatemala (the origin), Antigua and
    // Quetzaltenango are tagged; Huehuetenango, north of them, has a pin and no tag.
    const guatemala = at('guatemala', 174, 626, 'Ciudad de Guatemala');
    const antigua = at('antigua', 157, 632, 'Antigua Guatemala');
    const quetzaltenango = at('quetzaltenango', 96, 610, 'Quetzaltenango');
    const items = [guatemala, antigua, quetzaltenango];
    const pins = [...items, { x: 100, y: 571 }];

    it('never puts one tag over another', () => {
      const sides = placeTags(items, pins);

      const boxes = items.map((item) => tagBox(item, sides[item.id]!));
      boxes.forEach((box, index) =>
        boxes.slice(index + 1).forEach((other) => expect(overlap(box, other)).toBe(false)),
      );
    });

    it('does not leave the tag of Antigua below, over the one of Ciudad de Guatemala', () => {
      const sides = placeTags(items, pins);

      expect(sides.guatemala).toBe('below');
      expect(sides.antigua).not.toBe('below');
    });
  });
});
