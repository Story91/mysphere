import { NextResponse } from 'next/server';
import { createPublicClient, http, type Address } from 'viem';
import { erc20Abi, LAUNCHPAD_CHAIN } from '../../../startpad/config';
import { resolveMediaUrl } from '../../../startpad/metadata';
import { listProfiles } from '../profileStore';

/**
 * GET /api/launchpad/tokenlist - token lista w standardzie Uniswapa.
 *
 * ===========================================================================
 * PO CO TO ISTNIEJE
 * ===========================================================================
 * ERC-20 nie ma logo. Portfele i agregatory nie czytaja naszego `metadataURI`
 * i nie maja skad wiedziec, ze on istnieje. To, co one czytaja, to token listy:
 * jeden JSON pod stabilnym adresem, w ksztalcie, ktory rozumie caly ekosystem.
 *
 * Bez tego pliku logo tokena widac WYLACZNIE w naszym interfejsie. Z nim -
 * kazdy, kto zaimportuje ten adres, widzi komplet: nazwe, symbol, decimals
 * i obrazek.
 *
 * Ksztalt: https://github.com/Uniswap/token-lists (name, timestamp, version,
 * tokens[]). Wersje trzymamy w `major.minor.patch`; standard wymaga, zeby
 * usuniecie tokena podbijalo `major`, a dodanie `minor`. Nie potrafimy tego
 * policzyc bez historii listy, wiec `timestamp` jest tu prawda, a wersja
 * deklaracja - i tak to opisujemy ponizej, zamiast udawac.
 *
 * ===========================================================================
 * CO TRAFIA NA LISTE
 * ===========================================================================
 * Tokeny, ktorych tworca ustawil profil. To nie jest ograniczenie techniczne,
 * tylko decyzja: lista bez logo nie ma po co istniec, a wpisanie na nia
 * kazdego startu zrobiloby z niej spis smieci, ktorego nikt nie zaimportuje.
 *
 * `name`, `symbol` i `decimals` czytamy Z LANCUCHA, nie z bazy. Gdyby szly z
 * bazy, kazdy z dostepem do niej mogl by wystawic token podszywajacy sie pod
 * inny - a token lista jest dokladnie tym miejscem, w ktorym takie podszycie
 * dziala najlepiej.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_TOKENS = 200;

export async function GET() {
  const profiles = await listProfiles(LAUNCHPAD_CHAIN.id, MAX_TOKENS);

  const client = createPublicClient({ chain: LAUNCHPAD_CHAIN, transport: http() });

  const tokens = await Promise.all(
    profiles.map(async (profile) => {
      try {
        const address = profile.address as Address;
        const [name, symbol, decimals] = await Promise.all([
          client.readContract({ address, abi: erc20Abi, functionName: 'name' }),
          client.readContract({ address, abi: erc20Abi, functionName: 'symbol' }),
          client.readContract({ address, abi: erc20Abi, functionName: 'decimals' }),
        ]);
        // Token lista idzie do OBCYCH odbiorcow (portfele, agregatory) -
        // standard oczekuje URI do pobrania, nie wklejonych bajtow. Logo
        // z uploadu (data:) zyje tylko w naszym interfejsie i tu odpada.
        const resolved = resolveMediaUrl(profile.logoUrl);
        const logoURI = resolved && !resolved.startsWith('data:') ? resolved : null;
        return {
          chainId: LAUNCHPAD_CHAIN.id,
          address,
          name: String(name),
          symbol: String(symbol),
          decimals: Number(decimals),
          ...(logoURI ? { logoURI } : {}),
        };
      } catch {
        // Token, ktorego nie da sie odczytac z lancucha, NIE trafia na liste.
        // Lepiej krotsza lista niz wpis, ktorego nikt nie potwierdzil.
        return null;
      }
    })
  );

  const list = {
    name: 'MySphere Startpad',
    timestamp: new Date().toISOString(),
    version: { major: 1, minor: 0, patch: 0 },
    keywords: ['mysphere', 'launchpad', 'base'],
    tokens: tokens.filter((token): token is NonNullable<typeof token> => token !== null),
  };

  return NextResponse.json(list, {
    headers: {
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
      // Listy sa importowane przez cudze interfejsy, wiec musza dac sie pobrac
      // z innego origin. Bez tego naglowka import konczy sie bledem CORS.
      'Access-Control-Allow-Origin': '*',
    },
  });
}
