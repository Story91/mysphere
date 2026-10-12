import { formatShareMoney } from './askPublicView';
import { solAskAmount } from './solAskDisplay';
import type { Ask } from './types';

/**
 * Kwota Aska na stronie udostepnienia i na jej karcie OG: Ask SOL z lamportow
 * (dokladnie to, co zapieczetowal serwer), reszta przez formatShareMoney.
 * Jedna funkcja, zeby obrazek i strona nie mogly podac dwoch roznych kwot.
 * formatAskAmount z AskCard.tsx tu NIE wolno: patrz formatShareMoney.
 */
export function shareAmount(ask: Ask, which: 'budget' | 'perAnswer'): string {
  return solAskAmount(ask, which) ?? formatShareMoney(which === 'budget' ? ask.budget : ask.perAnswer, ask.token);
}
