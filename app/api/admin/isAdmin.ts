import 'server-only';
import { ADMIN_ADDRESS } from '../../utils/adminAddress';
import { getSessionFromCookies, type CookieStoreLike } from '../../utils/auth/session';

/**
 * Bramka tras administracyjnych: WAZNA, PODPISANA sesja SIWE (httpOnly
 * cookie, HMAC) i adres z tej sesji rowny ADMIN_ADDRESS.
 *
 * Wyciagniete z app/api/admin/ops/route.ts, zeby kazda trasa admina
 * (ops, asks-reseal) sprawdzala to samo, jednym kodem. Adres NIGDY nie
 * pochodzi z ciala zadania, naglowka ani query - tylko z sesji, ktora serwer
 * sam wystawil po weryfikacji podpisu portfela (app/api/auth/verify).
 *
 * ADMIN_ADDRESS bierzemy z app/utils/adminAddress.ts, a nie z
 * app/utils/firebase.ts: tamten modul przy imporcie odpala przegladarkowy SDK
 * Firebase, a trasa serwerowa potrzebuje samego adresu.
 *
 * Przyjmuje wszystko, co ma `cookies` o ksztalcie CookieStoreLike (NextRequest
 * pasuje), zeby dalo sie to sprawdzic w mochy bez Nexta.
 */
export function isAdminRequest(request: { cookies: CookieStoreLike }): boolean {
  try {
    const session = getSessionFromCookies(request.cookies);
    if (!session) return false;
    return session.address.toLowerCase() === ADMIN_ADDRESS.toLowerCase();
  } catch {
    // Najczestszy powod: brak AUTH_SESSION_SECRET. Failujemy zamknieto -
    // blad konfiguracji ma znaczyc "nie admin", nigdy "admin".
    return false;
  }
}
