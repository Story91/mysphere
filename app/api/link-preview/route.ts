import { NextResponse } from 'next/server';
import { parse } from 'node-html-parser';

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
    hostname = new URL(url).hostname;
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

    const html = await response.text();
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