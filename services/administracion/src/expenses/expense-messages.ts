export const EXPENSE_MESSAGES = {
  categoryNameTaken: 'Ya existe una categoría con ese nombre.',
  categoryInUse: 'Esta categoría ya tiene gastos. Desactívala para que no se use más.',
  categoryNotFound: 'No encontramos esa categoría.',
  categoryInactive: 'Una de las categorías está desactivada. Elige otra.',
  busNotFound: 'No encontramos ese bus en tu sucursal.',
  busInactive: 'Ese bus está desactivado.',
  expenseNotFound: 'No encontramos ese gasto.',
} as const;

export type ExpenseProblem = keyof typeof EXPENSE_MESSAGES;
