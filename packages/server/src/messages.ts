// Texts every service shows for the same situation; each service keeps its own domain texts.
export const SERVER_MESSAGES = {
  invalidData: 'Revisa los datos marcados e intenta de nuevo.',
  signInRequired: 'Inicia sesión para continuar.',
  sessionEnded: 'Tu sesión terminó. Inicia sesión de nuevo.',
  forbidden: 'No tienes permiso para hacer esto.',
  notFound: 'No encontramos lo que buscas.',
  upstream: 'El servicio no respondió. Intenta de nuevo en unos segundos.',
  generic: 'Algo salió mal. Intenta de nuevo en unos segundos.',
} as const;
