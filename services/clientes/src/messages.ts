// What clientes tells the person; shared situations use SERVER_MESSAGES from @debus/server.
export const MESSAGES = {
  profilePending: 'Estamos preparando tu cuenta. Vuelve a intentar en unos segundos.',
  nitTaken: 'Ese NIT ya está registrado en otra cuenta.',
  insufficientBalance: 'No tienes saldo suficiente en tu cartera.',
  keyReused: 'Esta operación ya se hizo con otros datos. Recarga la página e intenta de nuevo.',
  keyMissing: 'No pudimos identificar la operación. Recarga la página e intenta de nuevo.',
  topUpDescription: 'Recarga de saldo',
} as const;
