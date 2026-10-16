// What ventas tells the person; shared situations use SERVER_MESSAGES from @debus/server.
export const MESSAGES = {
  tripNotFound: 'No encontramos ese viaje. Puede que ya no esté a la venta.',
  tripDeparted: 'Este viaje ya salió. Elige otro horario.',
  seatTaken: 'Alguno de los asientos que elegiste ya fue vendido. Elige otros.',
  seatOutsideBus: (seats: number[], capacity: number) =>
    `El bus de este viaje tiene ${capacity} asientos; elige otro en lugar del ${seats.join(', ')}.`,
} as const;
