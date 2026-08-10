/**
 * Przygotowanie logo z pliku uzytkownika do postaci data URL.
 *
 * Dlaczego w ogole zmniejszamy: wynik trafia do profilu tokena w Firestore
 * i prosto do <img src> na stronie - megabajtowy oryginal z telefonu zabilby
 * oba miejsca. 256 px na dluzszym boku starcza na kazdy podglad, jaki mamy.
 *
 * Dlaczego webp z zapasem png: webp daje najmniejszy wynik, ale nie kazda
 * przegladarka umie go ZAPISAC z canvasa - taka oddaje z toDataURL png i po
 * tym prefiksie to poznajemy. Wyswietlic webp umie juz kazda, ktora nas
 * obchodzi.
 *
 * KONTRAKT INTERFEJSU (uzgodniony miedzy agentami - nie zmieniac sygnatury):
 *   resizeImageFile(file, maxSide?) -> Promise<string data URL>
 */

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/**
 * Twardy sufit na dlugosc wyniku. Nie jest z sufitu: dokument Firestore ma
 * limit 1 MiB, a data URL idzie tam w calosci razem z reszta profilu.
 */
const MAX_RESULT_CHARS = 150_000;

/** Zrodlo wieksze niz 20 MB to prawie na pewno pomylka, nie logo. */
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
};

/**
 * createImageBitmap dekoduje poza drzewem DOM i przyjmuje File wprost;
 * Image + object URL zostaje jako zapas dla przegladarek bez niego. Blad
 * dekodowania znaczy "to nie jest obrazek", niezaleznie od rozszerzenia.
 */
async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // Spadamy na Image - niektore przegladarki umieja zdekodowac przez
      // <img> plik, ktorego createImageBitmap nie przyjal.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('This file does not decode as an image.'));
      img.src = url;
    });
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => undefined };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Zmniejsza obrazek z pliku do data URL (webp, awaryjnie png) o dlugosci
 * najwyzej ~150k znakow. Rzuca Error z komunikatem nadajacym sie do pokazania
 * uzytkownikowi, gdy plik nie jest obslugiwanym obrazkiem albo nie daje sie
 * scisnac do limitu.
 */
export async function resizeImageFile(file: File, maxSide = 256): Promise<string> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Use a PNG, JPEG or WebP image.');
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('That image is over 20 MB - pick a smaller file.');
  }

  const decoded = await decodeImage(file);
  try {
    if (decoded.width < 1 || decoded.height < 1) {
      throw new Error('This file does not decode as an image.');
    }

    // Kazda kolejna proba zmniejsza bok albo jakosc - limit znakow jest
    // twardy, wiec wolimy mniejsze logo niz odrzucenie pliku.
    const sides = [maxSide, 192, 128, 96, 64].filter(
      (side, index, all) => side <= maxSide && side > 0 && all.indexOf(side) === index,
    );
    for (const side of sides) {
      const scale = Math.min(1, side / Math.max(decoded.width, decoded.height));
      const width = Math.max(1, Math.round(decoded.width * scale));
      const height = Math.max(1, Math.round(decoded.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Your browser refused a drawing surface for the image.');
      context.drawImage(decoded.source, 0, 0, width, height);

      for (const quality of [0.85, 0.7, 0.55]) {
        const url = canvas.toDataURL('image/webp', quality);
        // Przegladarka bez zapisu webp oddaje png i ignoruje jakosc - wtedy
        // kolejne przejscia petli jakosci nic nie zmienia, wiec je ucinamy.
        const isWebp = url.startsWith('data:image/webp');
        const candidate = isWebp ? url : canvas.toDataURL('image/png');
        if (candidate.length <= MAX_RESULT_CHARS) return candidate;
        if (!isWebp) break;
      }
    }
    throw new Error('Could not shrink the image enough - try a simpler picture.');
  } finally {
    decoded.close();
  }
}
