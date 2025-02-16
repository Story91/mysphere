import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { token, action } = await request.json();
    console.log('Received request:', { token: token.substring(0, 20) + '...', action });

    // Sprawdź czy jesteśmy w środowisku deweloperskim (ngrok)
    const isDevelopment = process.env.NODE_ENV === 'development';
    const isNgrok = request.headers.get('host')?.includes('ngrok');

    // Jeśli jesteśmy w trybie dev i używamy ngrok, pomijamy weryfikację
    if (isDevelopment && isNgrok) {
      console.log('Development mode (ngrok) - skipping reCAPTCHA verification');
      return NextResponse.json({
        success: true,
        score: 1,
        reasons: []
      });
    }

    if (!token) {
      return NextResponse.json({ success: false, error: 'Token is required' }, { status: 400 });
    }

    const apiUrl = `https://www.google.com/recaptcha/api/siteverify`;
    
    const params = new URLSearchParams({
      secret: process.env.RECAPTCHA_SECRET_KEY!,
      response: token
    });

    console.log('Calling reCAPTCHA API:', {
      url: apiUrl,
      siteKey: process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY
    });

    const response = await fetch(`${apiUrl}?${params.toString()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('reCAPTCHA API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      return NextResponse.json({ 
        success: false, 
        error: 'Verification failed',
        details: errorText
      }, { status: 500 });
    }

    const result = await response.json();
    console.log('reCAPTCHA API response:', result);

    if (!result.success) {
      console.error('Invalid token:', result['error-codes']);
      return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 400 });
    }

    if (result.action !== action) {
      console.error('Action mismatch:', { expected: action, got: result.action });
      return NextResponse.json({ success: false, error: 'Action mismatch' }, { status: 400 });
    }

    const score = result.score || 0;
    console.log('reCAPTCHA score:', score);

    return NextResponse.json({
      success: true,
      score,
      reasons: []
    });

  } catch (error) {
    console.error('Error in verify-recaptcha:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Verification failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 