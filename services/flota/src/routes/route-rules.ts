export const isValidDestination = (
  originBranchId: string,
  destination: { id: string; active: boolean } | null,
): boolean => destination !== null && destination.active && destination.id !== originBranchId;

export const canDeleteRoute = (route: { hasTrips: boolean }): boolean => !route.hasTrips;
