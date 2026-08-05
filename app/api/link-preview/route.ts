import { NextResponse } from 'next/server';
import { parse } from 'node-html-parser';

/**
 * Podglad linku wklejonego w poscie.
 *
 * BRAMKA NA ADRES - to nie jest kosmetyka. Ta trasa pobiera adres podany przez
 * uzytkownika i oddaje mu fragmenty odpowiedzi. Bez filtra jest to gotowy SSRF:
 * wystarczylo wkleic `http://169.254.169.254/...` albo `http://localhost:6379`,
 * zeby serwer odpytal wlasna siec i zwrocil zawartosc w tytule/opisie. Dlatego
 * przepuszczamy wylacznie http(s) do nazw publicznych.
 *
 * CZEGO TO NIE ZALATWIA: przekierowanie z adresu publicznego na prywatny (fetch
 * podaza za nim samo) oraz nazwa DNS wskazujaca na adres prywatny. Domkniecie
 * tego wymaga wlasnego resolvera i `redirect: 'manual'` z re-walidacja kazdego
 * skoku - poza zakresem tej poprawki, ale najtansze wejscia sa juz zamkniete.
 */

/** Adresy, ktorych serwerowi nie wolno odpytac w imieniu uzytkownika. */
function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  // Nazwy bez kropki to nazwy wewnetrzne (np. `redis`, `metadata`).
  if (!host.includes('.') && !host.includes(':')) return true;

  // IPv6: loopback, unique-local (fc00::/7), link-local (fe80::/10).
  if (host.includes(':')) {
    if (host === '::1' || host === '::') return true;
    if (/^f[cd]/.test(host) || /^fe[89ab]/.test(host)) return true;
    return false;
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;

  const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
  if (a === 0 || a === 10 || a === 127) return true;          // ten host / prywatna / loopback
  if (a === 169 && b === 254) return true;                     // link-local + metadata chmury
  if (a === 172 && b >= 16 && b <= 31) return true;            // prywatna
  if (a === 192 && b === 168) return true;                     // prywatna
  if (a === 100 && b >= 64 && b <= 127) return true;           // CGNAT
  if (a >= 224) return true;                                   // multicast / zarezerwowane
  return false;
}

/** Gorny limit dokumentu do sparsowania - podglad nie potrzebuje wiecej. */
const MAX_HTML_BYTES = 512 * 1024;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({
      title: 'Error',
      description: 'URL is required',
      image: '',
      siteName: 'Error'
    }, { status: 200 });
  }

  let hostname = '';
  try {
    const parsedUrl = new URL(url);

    // Tylko http(s). Bez tego przechodzily file:, data:, gopher: itd.
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new Error('unsupported protocol');
    }
    if (isBlockedHost(parsedUrl.hostname)) {
      throw new Error('blocked host');
    }

    hostname = parsedUrl.hostname;
  } catch (error) {
    return NextResponse.json({
      title: 'Invalid URL',
      description: 'Could not parse URL',
      image: '',
      siteName: 'Error'
    }, { status: 200 });
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BaseBookBot/1.0; +https://basebook.vercel.app)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      },
      // Dodaj timeout, aby uniknąć długiego oczekiwania
      signal: AbortSignal.timeout(5000) 
    });

    if (!response.ok) {
      return NextResponse.json({
        title: hostname,
        description: 'Link preview not available',
        image: '',
        siteName: hostname
      }, { status: 200 });
    }

    // Podglad ma sens tylko dla HTML. Parsowanie pliku wideo albo archiwum to
    // czysty koszt pamieci przy zerowym zysku.
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return NextResponse.json({
        title: hostname,
        description: 'Link preview not available',
        image: '',
        siteName: hostname
      }, { status: 200 });
    }

    const html = (await response.text()).slice(0, MAX_HTML_BYTES);
    const root = parse(html);

    // Pobierz metadane
    const metadata = {
      title: root.querySelector('title')?.text || 
             root.querySelector('meta[property="og:title"]')?.getAttribute('content') || 
             hostname,
      description: root.querySelector('meta[name="description"]')?.getAttribute('content') || 
                  root.querySelector('meta[property="og:description"]')?.getAttribute('content') || 
                  'No description available',
      image: root.querySelector('meta[property="og:image"]')?.getAttribute('content') ||
             root.querySelector('meta[name="twitter:image"]')?.getAttribute('content') || '',
      siteName: root.querySelector('meta[property="og:site_name"]')?.getAttribute('content') ||
                hostname,
    };

    return NextResponse.json(metadata, { status: 200 });
  } catch (error) {
    // Zawsze zwracaj status 200 z domyślnymi wartościami
    return NextResponse.json({
      title: hostname,
      description: 'Link preview not available',
      image: '',
      siteName: hostname
    }, { status: 200 });
  }
} 