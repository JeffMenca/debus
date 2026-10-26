// What an email is about. With the recipient it is unique in sent_emails, so an event that arrives
// twice, or is published again with another eventId, never sends the same email twice.
export const emailKeys = {
  ticketSold: (ticketId: string) => `ticket-sold:${ticketId}`,
  tripCancelled: (ticketId: string) => `trip-cancelled:${ticketId}`,
  walletCredited: (movementId: string) => `wallet-credited:${movementId}`,
  rentalPaid: (rentalId: string) => `rental-paid:${rentalId}`,
  rentalConfirmed: (rentalId: string) => `rental-confirmed:${rentalId}`,
  licenseOf: (driverId: string) => `license:${driverId}:`,
  license: (driverId: string, expiresOn: string, threshold: number) =>
    `license:${driverId}:${expiresOn}:${threshold}`,
} as const;
