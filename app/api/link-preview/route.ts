import { NextResponse } from 'next/server';
import { parse } from 'node-html-parser';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BaseBookBot/1.0; +https://basebook.vercel.app)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    });

    if (!response.ok) {
      return NextResponse.json({
        title: new URL(url).hostname,
        description: 'Link preview not available',
        image: '',
        siteName: new URL(url).hostname
      });
    }

    const html = await response.text();
    const root = parse(html);

    // Pobierz metadane
    const metadata = {
      title: root.querySelector('title')?.text || 
             root.querySelector('meta[property="og:title"]')?.getAttribute('content') || 
             new URL(url).hostname,
      description: root.querySelector('meta[name="description"]')?.getAttribute('content') || 
                  root.querySelector('meta[property="og:description"]')?.getAttribute('content') || 
                  'No description available',
      image: root.querySelector('meta[property="og:image"]')?.getAttribute('content') ||
             root.querySelector('meta[name="twitter:image"]')?.getAttribute('content') || '',
      siteName: root.querySelector('meta[property="og:site_name"]')?.getAttribute('content') ||
                new URL(url).hostname,
    };

    return NextResponse.json(metadata);
  } catch (error) {
    // Zwróć podstawowe informacje zamiast błędu
    return NextResponse.json({
      title: new URL(url).hostname,
      description: 'Link preview not available',
      image: '',
      siteName: new URL(url).hostname
    });
  }
} 