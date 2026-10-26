import { EXPENSE_CONCEPTS, INCOME_CONCEPTS } from '@debus/contracts';
import { EXPENSE_CONCEPT_LABELS, INCOME_CONCEPT_LABELS, emptyMessageOf } from './labels';

it('names every concept of the income and of the expenses in plain words', () => {
  expect(INCOME_CONCEPTS.map((concept) => INCOME_CONCEPT_LABELS[concept])).toEqual([
    'Boleto en línea',
    'Boleto de ventanilla',
    'Alquiler',
  ]);
  expect(EXPENSE_CONCEPTS.map((concept) => EXPENSE_CONCEPT_LABELS[concept])).toEqual([
    'Combustible',
    'Depreciación',
    'Mano de obra',
    'Repuestos',
  ]);
});

describe('emptyMessageOf', () => {
  const messages = { period: 'periodo', branch: 'sucursal', none: 'nada' };

  it('blames the period first, then the branch, then says there is nothing at all', () => {
    expect(emptyMessageOf({ from: '2026-10-01', branchId: 'b' }, messages)).toBe('periodo');
    expect(emptyMessageOf({ to: '2026-10-01' }, messages)).toBe('periodo');
    expect(emptyMessageOf({ branchId: 'b' }, messages)).toBe('sucursal');
    expect(emptyMessageOf({}, messages)).toBe('nada');
  });
});
