import { NextRequest, NextResponse } from 'next/server';
import { createPost } from '../../../utils/firebase';
import { getSessionFromCookies } from '../../../utils/auth/session';

// getSessionFromCookies uzywa node:crypto
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Autor bierze sie WYLACZNIE z podpisanej sesji SIWE.
 *
 * Poprzednio trasa czytala adres z naglowka `x-user-address` i nic go nie
 * weryfikowala - dowolny klient mogl wyslac cudzy adres i opublikowac post w
 * jego imieniu, razem z podbiciem `postsCount` na cudzym profilu. Naglowek nie
 * jest tozsamoscia; jedyna tozsamoscia w tym projekcie jest cookie sesji
 * wystawione przez /api/auth/verify po weryfikacji podpisu on-chain.
 *
 * Blad odczytu sesji (najczesciej brak AUTH_SESSION_SECRET) traktujemy jak brak
 * sesji - failujemy zamknieto.
 */
function sessionAddress(request: NextRequest): string | null {
  try {
    return getSessionFromCookies(request.cookies)?.address ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: { content?: unknown; musicTrack?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { content, musicTrack } = body;

    if (typeof content !== 'string' || !content.trim()) {
      return NextResponse.json(
        { error: 'Post content is required' },
        { status: 400 }
      );
    }

    const userAddress = sessionAddress(request);

    if (!userAddress) {
      return NextResponse.json(
        { error: 'Sign in with your wallet to post' },
        { status: 401 }
      );
    }

    // Create the post with music track if provided
    const postId = await createPost({
      author: userAddress,
      content: content.trim(),
      timestamp: Date.now(),
      musicTrack: (musicTrack as any) || null,
      network: 'base'
    });

    return NextResponse.json(
      { 
        success: true, 
        postId,
        message: 'Post created successfully'
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('Error creating post via API:', error);
    return NextResponse.json(
      { error: 'Failed to create post' },
      { status: 500 }
    );
  }
}