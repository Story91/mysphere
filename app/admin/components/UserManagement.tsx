'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  getDoc,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { useAccount } from 'wagmi';
import { db, ADMIN_ADDRESS } from '../../utils/firebase';
import { toMillis } from '../../utils/firestoreTime';
import { addressReadVariants } from '../../utils/monetization/types';

/**
 * Zarządzanie użytkownikami — wyszukiwanie punktowe zamiast ładowania bazy.
 *
 * === CO TU BYŁO ===
 * Komponent zwracał czerwone pudełko „tymczasowo wyłączone”, bo stara wersja
 * robiła `getDocs` na CAŁEJ kolekcji `users`, żeby pokazać listę. Przy 184
 * tysiącach kont to 184 000 odczytów na jedno wejście. Wyłączenie było
 * właściwą reakcją na koszt i złą odpowiedzią na potrzebę: admin przestał
 * mieć jakikolwiek sposób, żeby kogokolwiek znaleźć albo zbanować.
 *
 * Stary kod miał jeszcze jedną wadę, przez którą i tak by nie zadziałał po
 * samym włączeniu: czytał `isBanned` z dokumentu użytkownika, podczas gdy
 * bany naprawdę mieszkają w osobnej kolekcji `bannedUsers` (patrz
 * app/hooks/useBanStatus.ts). Sprawdzał pole, którego nikt nie zapisuje.
 *
 * === DLACZEGO TERAZ JEST TANIO ===
 * Admin nigdy nie potrzebuje LISTY 184 tysięcy ludzi. Potrzebuje
 * KONKRETNEJ osoby albo krótkiego ogona ostatnich zapisów:
 *
 *   szukanie po adresie   → odczyt punktowy, 2 dokumenty
 *   lista zbanowanych     → cała kolekcja `bannedUsers`, w praktyce garstka
 *   ostatnio dołączyli    → orderBy + limit 25, czyli 25 odczytów
 *
 * Żadne z tych zapytań nie rośnie razem z bazą.
 *
 * === CZEGO TEN PANEL NIE ZAŁATWIA ===
 * Reguły Firestore są dziś otwarte (`allow read, write: if true`), więc ban
 * jest egzekwowany po stronie KLIENTA. Ten panel jest wygodą dla admina, a
 * nie granicą bezpieczeństwa — kto ominie interfejs, ominie i bana. Zamknie
 * to dopiero zaostrzenie reguł opisane w firestore.rules.
 */

type FoundUser = {
  address: string;
  name?: string;
  joinedAt?: number;
  lastActive?: number;
  exists: boolean;
};

type BanEntry = {
  address: string;
  reason?: string;
  bannedAt?: number;
};

/**
 * Adres w obu zapisach - profile w `users` stoja pod ID w checksumie.
 *
 * Wspolny `addressReadVariants` ODTWARZA postac checksum z samego adresu, wiec
 * admin, ktory wklei adres malymi literami, znajdzie teraz konto. Poprzednia
 * wersja liczyla warianty z tego, co wpisano, wiec przy malej pisowni pytala
 * wylacznie o male litery - i nie znajdowala nikogo.
 */
const addressVariants = addressReadVariants;

const isAddressLike = (value: string) => /^0x[0-9a-fA-F]{40}$/.test(value.trim());

function formatDate(ms?: number): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString('pl-PL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function UserManagement() {
  const { address } = useAccount();
  const isAdmin = !!address && address.toLowerCase() === ADMIN_ADDRESS;

  const [searchInput, setSearchInput] = useState('');
  const [found, setFound] = useState<FoundUser | null>(null);
  const [foundBan, setFoundBan] = useState<BanEntry | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const [bans, setBans] = useState<BanEntry[] | null>(null);
  const [recent, setRecent] = useState<FoundUser[] | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadBans = useCallback(async () => {
    setError(null);
    try {
      const snapshot = await getDocs(query(collection(db, 'bannedUsers'), limit(100)));
      setBans(
        snapshot.docs.map((entry) => ({
          address: entry.id,
          reason: entry.data().reason,
          bannedAt: toMillis(entry.data().bannedAt),
        }))
      );
    } catch (loadError) {
      console.error('[UserManagement] Nie udalo sie wczytac banow:', loadError);
      // Pusta lista i awaria to nie to samo zdanie - nie pokazujemy "brak
      // banow" komus, kto wlasnie nie zdolal ich sprawdzic.
      setError('Nie udało się wczytać listy zbanowanych.');
    }
  }, []);

  useEffect(() => {
    // `bannedUsers` to w praktyce garstka dokumentów, więc jedno wczytanie na
    // wejściu jest tanie - inaczej niż lista wszystkich użytkowników.
    void loadBans();
  }, [loadBans]);

  const search = useCallback(async () => {
    const raw = searchInput.trim();
    if (!isAddressLike(raw)) {
      setError('Podaj pełny adres portfela (0x + 40 znaków).');
      return;
    }

    setIsSearching(true);
    setError(null);
    setNotice(null);
    setFound(null);
    setFoundBan(null);

    try {
      const variants = addressVariants(raw);
      const [userDocs, banDoc] = await Promise.all([
        Promise.all(variants.map((variant) => getDoc(doc(db, 'users', variant)))),
        getDoc(doc(db, 'bannedUsers', raw.toLowerCase())),
      ]);

      const hit = userDocs.find((entry) => entry.exists());
      const data = hit?.data() ?? {};

      setFound({
        address: hit?.id ?? raw,
        name: typeof data.name === 'string' ? data.name : undefined,
        joinedAt: toMillis(data.joinedAt),
        lastActive: toMillis(data.lastActive),
        exists: Boolean(hit),
      });

      setFoundBan(
        banDoc.exists()
          ? {
              address: banDoc.id,
              reason: banDoc.data().reason,
              bannedAt: toMillis(banDoc.data().bannedAt),
            }
          : null
      );
    } catch (searchError) {
      console.error('[UserManagement] Szukanie nie powiodlo sie:', searchError);
      setError('Szukanie nie powiodło się.');
    } finally {
      setIsSearching(false);
    }
  }, [searchInput]);

  const loadRecent = useCallback(async () => {
    setError(null);
    try {
      // 25 dokumentów, nie 184 tysiące. Uwaga: `joinedAt` leży w bazie raz
      // jako Timestamp, raz jako liczba, a Firestore sortuje najpierw po
      // TYPIE - więc to jest ogon, a nie ścisły ranking. Do tego, po co ta
      // lista służy (zobaczyć, kto ostatnio wszedł), wystarcza.
      const snapshot = await getDocs(
        query(collection(db, 'users'), orderBy('joinedAt', 'desc'), limit(25))
      );
      setRecent(
        snapshot.docs.map((entry) => {
          const data = entry.data();
          return {
            address: entry.id,
            name: typeof data.name === 'string' ? data.name : undefined,
            joinedAt: toMillis(data.joinedAt),
            lastActive: toMillis(data.lastActive),
            exists: true,
          };
        })
      );
    } catch (recentError) {
      console.error('[UserManagement] Nie udalo sie wczytac ostatnich:', recentError);
      setError('Nie udało się wczytać ostatnich zapisów.');
    }
  }, []);

  const banUser = useCallback(
    async (target: string, reason: string) => {
      if (!isAdmin) return;
      setIsBusy(true);
      setError(null);
      try {
        await setDoc(doc(db, 'bannedUsers', target.toLowerCase()), {
          reason: reason || 'Naruszenie zasad',
          bannedAt: serverTimestamp(),
          bannedBy: address,
        });
        setNotice(`Zbanowano ${target}`);
        setFoundBan({ address: target.toLowerCase(), reason, bannedAt: Date.now() });
        await loadBans();
      } catch (banError) {
        console.error('[UserManagement] Ban nie powiodl sie:', banError);
        setError('Nie udało się zbanować.');
      } finally {
        setIsBusy(false);
      }
    },
    [isAdmin, address, loadBans]
  );

  const unbanUser = useCallback(
    async (target: string) => {
      if (!isAdmin) return;
      setIsBusy(true);
      setError(null);
      try {
        await deleteDoc(doc(db, 'bannedUsers', target.toLowerCase()));
        setNotice(`Odbanowano ${target}`);
        setFoundBan(null);
        await loadBans();
      } catch (unbanError) {
        console.error('[UserManagement] Odbanowanie nie powiodlo sie:', unbanError);
        setError('Nie udało się odbanować.');
      } finally {
        setIsBusy(false);
      }
    },
    [isAdmin, loadBans]
  );

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="text-xl font-bold text-gray-900">Użytkownicy</h2>
      <p className="mt-1 text-sm text-gray-500">
        Szukanie po adresie kosztuje 2 odczyty. Lista nie jest ładowana — przy 184 tys.
        kont nie ma czegoś takiego jak „pokaż wszystkich”.
      </p>

      {!isAdmin && (
        <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Podłącz portfel administratora, żeby banować i odbanowywać. Podgląd działa
          bez tego.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-4 rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
          {notice}
        </p>
      )}

      {/* ---- szukanie ---- */}
      <div className="mt-5 flex flex-wrap gap-2">
        <input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void search();
          }}
          placeholder="0x… adres portfela"
          className="min-w-[280px] flex-1 rounded-md border border-gray-300 px-3 py-2 font-mono text-sm"
        />
        <button
          type="button"
          onClick={search}
          disabled={isSearching}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition-transform duration-150 active:scale-[0.97] disabled:opacity-60"
        >
          {isSearching ? 'Szukam…' : 'Szukaj'}
        </button>
      </div>

      {found && (
        <div className="mt-4 rounded-md border border-gray-200 p-4">
          {!found.exists ? (
            <p className="text-sm text-gray-600">
              Nie ma konta pod tym adresem.{' '}
              {foundBan && <strong className="text-red-700">Ale jest zbanowany.</strong>}
            </p>
          ) : (
            <div className="space-y-1 text-sm text-gray-700">
              <p className="font-mono text-[12px] text-gray-500">{found.address}</p>
              <p className="font-semibold text-gray-900">{found.name || '(bez nazwy)'}</p>
              <p>Dołączył: {formatDate(found.joinedAt)}</p>
              <p>Ostatnio aktywny: {formatDate(found.lastActive)}</p>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {foundBan ? (
              <>
                <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
                  Zbanowany{foundBan.reason ? `: ${foundBan.reason}` : ''}
                </span>
                <button
                  type="button"
                  disabled={!isAdmin || isBusy}
                  onClick={() => void unbanUser(found.address)}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 disabled:opacity-50"
                >
                  Odbanuj
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={!isAdmin || isBusy}
                onClick={() => {
                  const reason = window.prompt('Powód bana:', 'Naruszenie zasad');
                  // `null` = anulowano. Pusty string to świadomy wybór i
                  // dostaje wartość domyślną w banUser.
                  if (reason !== null) void banUser(found.address, reason);
                }}
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                Zbanuj
              </button>
            )}
          </div>
        </div>
      )}

      {/* ---- zbanowani ---- */}
      <div className="mt-7">
        <h3 className="text-sm font-bold uppercase tracking-wide text-gray-600">
          Zbanowani {bans && `(${bans.length})`}
        </h3>
        {bans === null ? (
          <p className="mt-2 text-sm text-gray-400">Wczytuję…</p>
        ) : bans.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">Nikt nie jest zbanowany.</p>
        ) : (
          <ul className="mt-2 divide-y divide-gray-100">
            {bans.map((ban) => (
              <li key={ban.address} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-mono text-[12px] text-gray-700">{ban.address}</span>
                <span className="text-xs text-gray-500">
                  {ban.reason || '—'} · {formatDate(ban.bannedAt)}
                </span>
                <button
                  type="button"
                  disabled={!isAdmin || isBusy}
                  onClick={() => void unbanUser(ban.address)}
                  className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 disabled:opacity-50"
                >
                  Odbanuj
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---- ostatnio dolaczyli ---- */}
      <div className="mt-7">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wide text-gray-600">
            Ostatnio dołączyli
          </h3>
          <button
            type="button"
            onClick={loadRecent}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700"
          >
            {recent ? 'Odśwież (25 odczytów)' : 'Pokaż 25 (25 odczytów)'}
          </button>
        </div>

        {recent && (
          <ul className="mt-2 divide-y divide-gray-100">
            {recent.map((user) => (
              <li key={user.address} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-mono text-[12px] text-gray-700">{user.address}</span>
                <span className="text-xs text-gray-500">
                  {user.name || '(bez nazwy)'} · {formatDate(user.joinedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
