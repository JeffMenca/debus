export type TagSide = 'below' | 'above' | 'right' | 'left';

export interface TagAnchor {
  id: string;
  // Where the pin is, in pixels of the map container.
  x: number;
  y: number;
  // The estimated width of the tag, see tagWidth.
  width: number;
}

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const PIN_RADIUS = 12;
const GAP = 6;
const TAG_HEIGHT = 24;
const CHARACTER_WIDTH = 7.5;
const TAG_PADDING = 24;
// First choice first: a tag below its pin reads best, then above, then beside it.
const SIDES: readonly TagSide[] = ['below', 'above', 'right', 'left'];

// The DOM of Leaflet is not measured: the width is estimated from the name, a little generously.
export const tagWidth = (name: string): number => name.length * CHARACTER_WIDTH + TAG_PADDING;

export function tagBox({ x, y, width }: Pick<TagAnchor, 'x' | 'y' | 'width'>, side: TagSide): Box {
  const near = PIN_RADIUS + GAP;
  switch (side) {
    case 'below':
      return {
        left: x - width / 2,
        right: x + width / 2,
        top: y + near,
        bottom: y + near + TAG_HEIGHT,
      };
    case 'above':
      return {
        left: x - width / 2,
        right: x + width / 2,
        top: y - near - TAG_HEIGHT,
        bottom: y - near,
      };
    case 'right':
      return {
        left: x + near,
        right: x + near + width,
        top: y - TAG_HEIGHT / 2,
        bottom: y + TAG_HEIGHT / 2,
      };
    case 'left':
      return {
        left: x - near - width,
        right: x - near,
        top: y - TAG_HEIGHT / 2,
        bottom: y + TAG_HEIGHT / 2,
      };
  }
}

type Point = Pick<TagAnchor, 'x' | 'y'>;

const pinBox = ({ x, y }: Point): Box => ({
  left: x - PIN_RADIUS,
  right: x + PIN_RADIUS,
  top: y - PIN_RADIUS,
  bottom: y + PIN_RADIUS,
});

// The area two boxes share, 0 when they do not touch.
const overlapArea = (a: Box, b: Box): number =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
  Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

// Chooses the side of each tag so it covers neither a pin nor a tag already placed. Greedy and in
// the order given, so the first (the origin) gets its favorite side. `pins` are the pins of every
// branch on the map, tagged or not, all of them obstacles. When no side is free the tag takes the one
// that covers the least: a tag over another tag hides a name, a tag over a pin only hides a dot, so
// the first weighs more. Sides that tie keep the order of SIDES.
export function placeTags(
  items: readonly TagAnchor[],
  pins: readonly Point[] = items,
): Record<string, TagSide> {
  const pinBoxes = pins.map(pinBox);
  const placedBoxes: Box[] = [];
  const placed: Record<string, TagSide> = {};
  for (const item of items) {
    let best: { side: TagSide; tags: number; pins: number } | undefined;
    for (const side of SIDES) {
      const box = tagBox(item, side);
      const cost = {
        side,
        tags: sum(placedBoxes.map((other) => overlapArea(box, other))),
        pins: sum(pinBoxes.map((other) => overlapArea(box, other))),
      };
      if (!best || cost.tags < best.tags || (cost.tags === best.tags && cost.pins < best.pins)) {
        best = cost;
      }
    }
    const side = best!.side;
    placed[item.id] = side;
    placedBoxes.push(tagBox(item, side));
  }
  return placed;
}
