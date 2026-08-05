import { ImageResponse } from 'next/og';
import { getPostForShare, shortAddress } from '../../utils/posts/getPostForShare';

/**
 * Karta OG generowana per post.
 *
 * Bylo to niewykonalne, dopoki root layout byl komponentem klienckim - metadane
 * powstawaly dopiero po hydracji, wiec crawlery i podglady linkow widzialy pusty
 * dokument. Po przejsciu layoutu na serwer mozemy generowac obrazek na zadanie.
 *
 * Base App od 9 kwietnia 2026 traktuje aplikacje jak zwykle strony www, wiec
 * bogaty embed jest realna powierzchnia dystrybucji, a nie ozdobnikiem.
 */

export const runtime = 'nodejs';
export const alt = 'Post on MySphere';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: { id: string } }) {
  const post = await getPostForShare(params.id);

  const author = post?.authorName || shortAddress(post?.author ?? '');
  // Tresc przycieta tak, zeby zmiescila sie bez lamania layoutu obrazka.
  const raw = post?.content?.trim() ?? '';
  const content = raw.length > 220 ? `${raw.slice(0, 220)}…` : raw || 'Post on MySphere';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#0A1024',
          padding: '72px',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Pasek marki. Blekit Base jest jedynym akcentem - reszta jest cicha,
            zeby czytelna byla tresc posta, a nie ramka wokol niej. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: '14px',
              height: '14px',
              borderRadius: '999px',
              background: '#0052FF',
            }}
          />
          <div
            style={{
              fontSize: '26px',
              fontWeight: 600,
              color: '#EEF3FF',
              letterSpacing: '-0.01em',
            }}
          >
            MySphere
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: content.length > 120 ? '44px' : '56px',
            lineHeight: 1.25,
            color: '#EEF3FF',
            fontWeight: 600,
            letterSpacing: '-0.02em',
          }}
        >
          {content}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '24px',
            color: '#93A5C9',
          }}
        >
          <div style={{ display: 'flex' }}>{author}</div>
          {post && (
            <div style={{ display: 'flex', gap: '28px' }}>
              <div style={{ display: 'flex' }}>{post.likes} likes</div>
              <div style={{ display: 'flex' }}>{post.commentCount} comments</div>
            </div>
          )}
        </div>
      </div>
    ),
    size
  );
}
