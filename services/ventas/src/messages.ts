// What ventas tells the person; shared situations use SERVER_MESSAGES from @debus/server.
export const MESSAGES = {
  tripNotFound: 'No encontramos ese viaje. Puede que ya no esté a la venta.',
  tripDeparted: 'Este viaje ya salió. Elige otro horario.',
  otherBranch: 'Solo puedes vender viajes que salen de tu sucursal.',
  saleKeyReused: 'Esa venta ya se registró con otros datos. Vuelve a empezar.',
  accountNotReady: 'Estamos terminando de preparar tu cuenta. Intenta de nuevo en unos segundos.',
  tripCheckUnavailable:
    'No pudimos confirmar que el viaje sigue a la venta. No se te cobró nada; intenta de nuevo en unos segundos.',
  walletUnavailable:
    'No pudimos conectar con tu cartera. No se te cobró nada y tus asientos quedaron libres; intenta de nuevo en unos segundos.',
  insufficientBalance:
    'No tienes saldo suficiente en tu cartera. Recarga y vuelve a intentarlo; tus asientos quedaron libres.',
  paymentExpired:
    'Se terminó el tiempo para pagar esta compra y liberamos tus asientos. Vuelve a elegirlos.',
  paymentPending:
    'Estamos confirmando el pago con tu cartera. Tus asientos están apartados; no repitas la compra.',
  paymentRejected:
    'No pudimos cobrar esta compra y tus asientos quedaron libres. Vuelve a intentarlo.',
  tripCancelled: 'Este viaje ya no está disponible y tus asientos quedaron libres.',
  purchaseKeyMissing: 'No pudimos identificar la compra. Recarga la página e intenta de nuevo.',
  purchaseNotFound: 'No encontramos esa compra.',
  seatsReleased: 'Tus asientos quedaron libres.',
  purchaseKeyReused: 'Esa compra ya se registró con otros datos. Vuelve a empezar.',
  keyMissing: 'No pudimos identificar la venta. Recarga la página e intenta de nuevo.',
  seatTaken: 'Alguno de los asientos que elegiste ya fue vendido. Elige otros.',
  seatOutsideBus: (seats: number[], capacity: number) =>
    `El bus de este viaje tiene ${capacity} asientos; elige otro en lugar del ${seats.join(', ')}.`,
} as const;
