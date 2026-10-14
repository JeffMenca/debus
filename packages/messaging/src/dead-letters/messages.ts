// What the system admin reads when reviewing the events a service could not process.
export const DEAD_LETTER_MESSAGES = {
  unreadable: 'No pudimos leer los eventos fallidos de este servicio. Intenta de nuevo más tarde.',
  replayFailed: 'El evento volvió a fallar y sigue en la lista. Revisa los registros del servicio.',
} as const;
