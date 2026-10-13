import { BUS_DISPLAY_STATUSES } from '@debus/contracts';
import { BUS_ART_TONES, BUS_STATUS_LABELS } from './bus-status';

it('has a plain label and a tone for every status a bus can show', () => {
  for (const status of BUS_DISPLAY_STATUSES) {
    expect(BUS_STATUS_LABELS[status].label).toBeTruthy();
  }
  expect(BUS_STATUS_LABELS).toEqual({
    IN_TRANSIT: { label: 'En camino', tone: 'mint' },
    AVAILABLE: { label: 'Disponible', tone: 'indigo' },
    IN_WORKSHOP: { label: 'En taller', tone: 'mango' },
    INACTIVE: { label: 'Inactivo', tone: 'coral' },
  });
});

it('draws the bus illustration in the color of its state', () => {
  expect(BUS_ART_TONES).toEqual({
    IN_TRANSIT: 'teal',
    AVAILABLE: 'indigo',
    IN_WORKSHOP: 'mango',
    INACTIVE: 'coral',
  });
});
