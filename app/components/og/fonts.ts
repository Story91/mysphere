import {
  BALOO2_BOLD,
  BALOO2_SEMIBOLD,
  NUNITO_BOLD,
  NUNITO_SEMIBOLD,
  NUNITO_REGULAR,
} from './fontData';

/**
 * Kroje marki dla wszystkich osmiu tras rysujacych karty OG.
 *
 * === PO CO, SKORO KARTY DZIALALY W NOTO SANS ===
 * Noto Sans jest krojem wbudowanym w @vercel/og i do tej pory rysowal cala
 * rodzine. Dzialalo, ale karta byla jedyna powierzchnia produktu pisana nie
 * jego glosem: Baloo 2 niesie naglowki i liczby (zaokraglone konce kresek,
 * wysoka x-height - kwota czyta sie jak etykieta, nie jak komorka tabeli),
 * Nunito jest tekstem. Te same dwa kroje laduje app/layout.tsx przez
 * next/font jako --font-soft-display i --font-soft-body.
 *
 * === DLACZEGO DOPIERO TERAZ, I DLACZEGO BASE64 ===
 * HomeShareCard.tsx odrzucal wgranie krojow, bo kazda znana droga dokladala
 * tryb awarii: `fs` z public/ nie trafia do bundla funkcji, fetch po sieci
 * kosztuje przy kazdym zimnym starcie, a `new URL(..., import.meta.url)`
 * wywala `fileURLToPath`. Czwarta droga - `outputFileTracingIncludes` -
 * dziala tylko dla tras z pliku `route.tsx`; szesciu kart z konwencji
 * `opengraph-image.tsx` nie lapie zaden ksztalt klucza. Uzasadnienie
 * pomiarowe siedzi w naglowku ./fontData.
 *
 * Zostaje import modulu, ktory webpack wciaga zawsze. Bajty krojow leza
 * w ./fontData jako base64; tutaj sa dekodowane raz na instancje funkcji.
 *
 * === ZAKRES ZNAKOW ===
 * Kroje sa przyciete do lacinki podstawowej, Latin-1 i Latin Extended-A,
 * zeby nazwy uzytkownikow z diakrytykami nie gubily znakow, plus typografia
 * i waluty. Znaku spoza tego zakresu satori nie narysuje - emoji w symbolu
 * tokena wypadnie, tak samo jak wypadalo w Noto Sans.
 */

/** Krojow uzywanych na kartach jest dokladnie tyle - 700 i 600 plus tekstowa 400. */
const FILES = [
  { b64: BALOO2_BOLD, name: 'Baloo 2', weight: 700 as const },
  { b64: BALOO2_SEMIBOLD, name: 'Baloo 2', weight: 600 as const },
  { b64: NUNITO_BOLD, name: 'Nunito', weight: 700 as const },
  { b64: NUNITO_SEMIBOLD, name: 'Nunito', weight: 600 as const },
  { b64: NUNITO_REGULAR, name: 'Nunito', weight: 400 as const },
];

export type OgFont = {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 600 | 700;
  style: 'normal';
};

let cached: OgFont[] | null = null;

/**
 * Zwraca tablice pod `fonts` w ImageResponse. Dekoduje raz na instancje
 * funkcji - karty maja `force-dynamic`, wiec bez cache kazde zadanie
 * dekodowaloby ~310 KB base64.
 *
 * Async mimo ze nic tu nie czeka: wywolania w osmiu trasach sa `await`owane,
 * a sygnatura ma zostac ta sama, gdyby kroje kiedys wrocily do odczytu
 * z dysku albo doszlo ich wiecej.
 */
export async function ogFonts(): Promise<OgFont[]> {
  if (!cached) {
    cached = FILES.map(({ b64, name, weight }) => {
      const bytes = Buffer.from(b64, 'base64');
      return {
        name,
        // Kopia do wlasnego ArrayBuffer - `bytes.buffer` moze byc wspoldzielona
        // pula Node'a i niesc bajty spoza tego fontu.
        data: bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength
        ) as ArrayBuffer,
        weight,
        style: 'normal' as const,
      };
    });
  }
  return cached;
}

/** Naglowki i liczby. */
export const DISPLAY_FAMILY = 'Baloo 2';
/** Tekst: stopki, etykiety, nazwy. */
export const BODY_FAMILY = 'Nunito';
