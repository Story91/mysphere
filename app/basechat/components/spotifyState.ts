/**
 * DLACZEGO WYBOR UTWORU NIC NIE POKAZAL - czysta decyzja, bez sieci i DOM-u.
 *
 * ===========================================================================
 * "NIE PODLACZYLES KONTA" TO NIE JEST AWARIA
 * ===========================================================================
 * Kto nie ma podpietego Spotify, dostawal w okienku wyboru utworu czerwone
 * "❌" z przyciskiem Try Again. Ponawianie nie moglo pomoc, bo nie bylo czego
 * ponawiac - konto po prostu nie jest podlaczone. Zamiast tego ma tam stac
 * konektor, ktorym da sie je podpiac bez wychodzenia z pisania posta.
 *
 * `/api/camp/spotify` rozroznia te dwa przypadki, tylko subtelnie:
 *   - konto niepodlaczone  ->  { success: false, message: '...' }   (bez `error`)
 *   - awaria Camp Network  ->  { success: false, error: '...' }
 *
 * Klient sklejal je jednym `data.error || data.message`, przez co kazdy brak
 * konta wygladal jak usterka produktu.
 *
 * ===========================================================================
 * DLACZEGO BRAK POWODU LICZY SIE JAKO AWARIA
 * ===========================================================================
 * Bo ciche "nie udalo sie" nie moze zamienic sie w zdanie O UZYTKOWNIKU.
 * "Nie masz podlaczonego konta" jest twierdzeniem i musi miec pokrycie w tym,
 * co odpowiedzial serwer - inaczej lepiej przyznac sie do usterki.
 */

export type SpotifyFailure = 'not-connected' | 'failed' | null;

export function spotifyFailureKind(payload: unknown): SpotifyFailure {
  if (!payload || typeof payload !== 'object') return 'failed';

  const body = payload as { success?: unknown; error?: unknown; message?: unknown };
  if (body.success === true) return null;

  if (typeof body.error === 'string' && body.error.trim() !== '') return 'failed';
  if (typeof body.message === 'string' && body.message.trim() !== '') return 'not-connected';

  return 'failed';
}
