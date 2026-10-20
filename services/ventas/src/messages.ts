// What ventas tells the person; shared situations use SERVER_MESSAGES from @debus/server.
export const MESSAGES = {
  tripNotFound: 'No encontramos ese viaje. Puede que ya no esté a la venta.',
  tripDeparted: 'Este viaje ya salió. Elige otro horario.',
  otherBranch: 'Solo puedes vender viajes que salen de tu sucursal.',
  saleKeyReused: 'Esa venta ya se registró con otros datos. Vuelve a empezar.',
  keyMissing: 'No pudimos identificar la venta. Recarga la página e intenta de nuevo.',
  seatTaken: 'Alguno de los asientos que elegiste ya fue vendido. Elige otros.',
  seatOutsideBus: (seats: number[], capacity: number) =>
    `El bus de este viaje tiene ${capacity} asientos; elige otro en lugar del ${seats.join(', ')}.`,
} as const;
