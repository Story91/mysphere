import { NextResponse } from 'next/server';
import { parse } from 'node-html-parser';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  try {
    const response = await fetch(url);
    const html = await response.text();
    const root = parse(html);

    // Pobierz metadane
    const metadata = {
      title: root.querySelector('title')?.text || '',
      description: root.querySelector('meta[name="description"]')?.getAttribute('content') || 
                  root.querySelector('meta[property="og:description"]')?.getAttribute('content') || '',
      image: root.querySelector('meta[property="og:image"]')?.getAttribute('content') || 
             root.querySelector('meta[name="twitter:image"]')?.getAttribute('content') || '',
      siteName: root.querySelector('meta[property="og:site_name"]')?.getAttribute('content') || 
                new URL(url).hostname,
    };

    return NextResponse.json(metadata);
  } catch (error) {
    console.error('Error fetching link preview:', error);
    return NextResponse.json({ error: 'Failed to fetch link preview' }, { status: 500 });
  }
} 