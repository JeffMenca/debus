import { HttpCode, applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

const DESCRIPTIONS = {
  400: 'Datos inválidos o enlace no válido.',
  401: 'Falta la sesión o las credenciales no son correctas.',
  403: 'El rol no permite esta acción.',
  404: 'No existe lo que se pidió.',
  409: 'Conflicto con el estado actual: ya existe, ya se usó o no se puede cambiar.',
  410: 'El enlace ya venció.',
  423: 'Cuenta bloqueada temporalmente por intentos fallidos.',
} as const;

export type DocumentedError = keyof typeof DESCRIPTIONS;

export function apiErrors(...statuses: DocumentedError[]): MethodDecorator {
  return applyDecorators(
    ...statuses.map((status) => ApiResponse({ status, description: DESCRIPTIONS[status] })),
  );
}

const SUCCESS = {
  200: 'Hecho.',
  201: 'Creado.',
  202: 'Recibido. La respuesta es la misma exista o no la cuenta.',
  204: 'Hecho, sin contenido.',
} as const;

export type DocumentedSuccess = keyof typeof SUCCESS;

// Sets the status the route answers and documents it in one place, so both never disagree. Nest
// only documents the success response when no other response is declared, so it is declared too.
export function apiSuccess(status: DocumentedSuccess): MethodDecorator {
  return applyDecorators(HttpCode(status), ApiResponse({ status, description: SUCCESS[status] }));
}
