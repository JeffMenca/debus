import type { Bus, BusFields } from '@debus/contracts';

// A bus is saved whole, so changing one thing (the workshop) starts from what it already has.
export function busToFields(bus: Bus): BusFields {
  return {
    plate: bus.plate,
    brand: bus.brand,
    model: bus.model,
    year: bus.year,
    capacity: bus.capacity,
    mileageKm: bus.mileageKm,
    operationalStatus: bus.operationalStatus,
    assignedDriverId: bus.assignedDriverId,
  };
}
