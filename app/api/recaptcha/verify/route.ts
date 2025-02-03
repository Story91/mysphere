import { NextResponse } from 'next/server';
import { RecaptchaEnterpriseServiceClient } from '@google-cloud/recaptcha-enterprise';
import path from 'path';

const projectID = process.env.RECAPTCHA_PROJECT_ID;
const recaptchaKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

// Konfiguracja klienta reCAPTCHA Enterprise z poświadczeniami
const client = new RecaptchaEnterpriseServiceClient({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS || '{}')
});

export async function POST(request: Request) {
  try {
    const { token, action } = await request.json();

    if (!token || !action) {
      return NextResponse.json(
        { error: 'Missing token or action' },
        { status: 400 }
      );
    }

    const projectPath = client.projectPath(projectID!);

    const [response] = await client.createAssessment({
      assessment: {
        event: {
          token: token,
          siteKey: recaptchaKey,
        },
      },
      parent: projectPath,
    });

    // Sprawdź, czy token jest prawidłowy
    if (!response.tokenProperties?.valid) {
      return NextResponse.json(
        { 
          error: 'Invalid token',
          reason: response.tokenProperties?.invalidReason 
        },
        { status: 400 }
      );
    }

    // Sprawdź, czy akcja się zgadza
    if (response.tokenProperties?.action !== action) {
      return NextResponse.json(
        { error: 'Action mismatch' },
        { status: 400 }
      );
    }

    // Zwróć wynik oceny ryzyka
    return NextResponse.json({
      score: response.riskAnalysis?.score,
      reasons: response.riskAnalysis?.reasons,
    });

  } catch (error) {
    console.error('reCAPTCHA verification error:', error);
    return NextResponse.json(
      { error: 'Verification failed' },
      { status: 500 }
    );
  }
} 