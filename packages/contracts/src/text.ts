import { z } from 'zod';

export const SEARCH_MAX_LENGTH = 80;

// Latin-1 Supplement and Latin Extended-A: the accented letters of Spanish names and their
// neighbours. The database folds exactly this range (fold_search_text), so both sides agree.
const FOLDED_LETTERS = /[À-ſ]/g;

const stripAccent = (letter: string): string =>
  letter.normalize('NFD').replace(/\p{Diacritic}/gu, '');

// Lowercase and accent-free; the database folds search_text the same way (fold_search_text).
export const foldSearchText = (value: string): string =>
  value.normalize('NFC').replace(FOLDED_LETTERS, stripAccent).toLowerCase().trim();

// LIKE treats % and _ as wildcards and \ as the escape; a search for them means the characters.
export const escapeLikePattern = (value: string): string => value.replace(/[\\%_]/g, '\\$&');

export const searchTermSchema = z.string().trim().max(SEARCH_MAX_LENGTH).transform(foldSearchText);

// Plates are stored without separators; people read them with the hyphen after the letter prefix.
export const formatPlate = (plate: string): string =>
  plate.replace(/^([A-Z]{1,2})(\d{3}[A-Z]{3})$/, '$1-$2');
