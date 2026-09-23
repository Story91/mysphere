/**
 * Brama uprawnien w aplikacji: kasowanie cudzych postow i komentarzy,
 * przypinanie, panel /admin, moderacja tresci, reczny cleanup przypiec.
 *
 * PRZENIESIONE 6 sierpnia 2026 z 0xF1fa2002...1Dfd na ten adres - decyzja
 * wlasciciela. Ten sam portfel trzyma ADMIN_PRIVATE_KEY, wystawia kontrakty
 * i jest odbiorca platnosci x402, wiec od teraz jest JEDNYM adresem
 * administracyjnym calego produktu zamiast dwoch rozjezdzajacych sie.
 *
 * SKUTEK: ze starego portfela nie da sie juz moderowac. To bylo swiadome.
 *
 * === TA STALA JEST JEDYNYM ZRODLEM ===
 * app/utils/friends/config.ts i app/api/cleanup-expired-pins/route.ts mialy
 * wlasne kopie tego adresu; dzis oba importuja ja (przez re-eksport
 * w app/utils/firebase.ts). Nie dopisuj kolejnej - kopia zostaje przy starym
 * wlascicielu przy nastepnej zmianie.
 *
 * === DLACZEGO OSOBNY PLIK (2026-09-23) ===
 * Stala siedziala w app/utils/firebase.ts, a ten modul przy imporcie odpala
 * klienta Firebase (initializeApp, getFirestore, getAuth). Trasa serwerowa,
 * ktora potrzebuje samego adresu (np. /api/solana/reply-moderation), nie moze
 * ciagnac za soba przegladarkowego SDK. Tu nie ma zadnych importow;
 * firebase.ts re-eksportuje stala, wiec dotychczasowe importy dzialaja dalej.
 *
 * NIE MYLIC z MYSPHERE_ADDRESS w PaidPinModal.tsx. Tamten ma dzis te sama
 * wartosc co STARY admin, ale znaczy co innego: to ODBIORCA PLATNOSCI za
 * przypiete posty. Nie ruszam go tutaj, bo przeniesienie uprawnien i zmiana
 * konta, na ktore wplywaja pieniadze, to dwie osobne decyzje.
 */
export const ADMIN_ADDRESS = '0xD4885A5aa53446843CABcDE1F35DE9b4E906030e'.toLowerCase();
