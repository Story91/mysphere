export {};

const { expect } = require('chai');
const {
  parseSpotifyTrackId,
  extractEmbedEntity,
  buildTrackFromSources,
} = require('../app/basechat/components/spotifyLink');

/**
 * UTWOR Z WKLEJONEGO LINKU - jedyna droga, ktora dzis dziala.
 *
 * Camp Network nie zaciagnal historii Spotify nikomu (sprawdzone 2026-09-11
 * na 40 portfelach: lastSynced null, puste tablice, 401 na zapisanych).
 * Kompozytor zamienia wiec link na utwor sam, ze strony osadzenia Spotify.
 * Te testy pilnuja dwoch rzeczy: ze rozpoznajemy WSZYSTKIE ksztalty linku,
 * ktore ludzie wklejaja, i ze wynik ma ksztalt `musicTrack` z postow - feed
 * i odtwarzacz nie wiedza, skad utwor przyszedl.
 *
 * Uruchomienie: node scripts/test-spotify-link.cjs
 */

const ID = '4uLU6hMCjMI75M1A2tKUQC';

describe('parseSpotifyTrackId', () => {
  it('zwykly link z udostepniania, z parametrem si', () => {
    expect(parseSpotifyTrackId(`https://open.spotify.com/track/${ID}?si=abc123`)).to.equal(ID);
  });

  it('link z prefiksem jezyka (intl-pl) - tak kopiuje aplikacja na telefonie', () => {
    expect(parseSpotifyTrackId(`https://open.spotify.com/intl-pl/track/${ID}`)).to.equal(ID);
  });

  it('link do strony osadzenia i URI spotify:track:', () => {
    expect(parseSpotifyTrackId(`https://open.spotify.com/embed/track/${ID}`)).to.equal(ID);
    expect(parseSpotifyTrackId(`spotify:track:${ID}`)).to.equal(ID);
  });

  it('samo id i link bez protokolu', () => {
    expect(parseSpotifyTrackId(`  ${ID}  `)).to.equal(ID);
    expect(parseSpotifyTrackId(`open.spotify.com/track/${ID}`)).to.equal(ID);
  });

  it('album, playlista, obcy host i smieci oddaja null', () => {
    expect(parseSpotifyTrackId(`https://open.spotify.com/album/${ID}`)).to.equal(null);
    expect(parseSpotifyTrackId(`https://open.spotify.com/playlist/${ID}`)).to.equal(null);
    expect(parseSpotifyTrackId(`https://evil.example.com/track/${ID}`)).to.equal(null);
    expect(parseSpotifyTrackId('https://open.spotify.com/track/za-krotkie')).to.equal(null);
    expect(parseSpotifyTrackId('')).to.equal(null);
  });
});

describe('extractEmbedEntity', () => {
  it('wyciaga entity z __NEXT_DATA__ strony osadzenia', () => {
    const html = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: { pageProps: { state: { data: { entity: { id: ID, name: 'Never Gonna Give You Up' } } } } },
    })}</script></html>`;

    expect(extractEmbedEntity(html)).to.deep.equal({ id: ID, name: 'Never Gonna Give You Up' });
  });

  it('strona bez __NEXT_DATA__ albo z zepsutym JSON-em to null, nie wyjatek', () => {
    expect(extractEmbedEntity('<html>nic</html>')).to.equal(null);
    expect(extractEmbedEntity('<script id="__NEXT_DATA__" type="application/json">{zle</script>')).to.equal(null);
  });
});

describe('buildTrackFromSources', () => {
  const entity = {
    id: ID,
    name: 'Never Gonna Give You Up',
    duration: 213573,
    artists: [{ name: 'Rick Astley', uri: 'spotify:artist:0gxyHStUsqpMadRV0Di1Qt' }],
    releaseDate: { isoString: '1987-11-12T00:00:00Z' },
    audioPreview: { url: 'https://p.scdn.co/mp3-preview/b4c6' },
    visualIdentity: {
      image: [
        { url: 'https://i/64', maxHeight: 64, maxWidth: 64 },
        { url: 'https://i/300', maxHeight: 300, maxWidth: 300 },
      ],
    },
  };

  it('ze strony osadzenia sklada pelny musicTrack, z podgladem i najwieksza okladka pierwsza', () => {
    const track = buildTrackFromSources(ID, entity, null);

    expect(track).to.deep.equal({
      id: ID,
      name: 'Never Gonna Give You Up',
      artists: [{ name: 'Rick Astley', external_urls: { spotify: 'https://open.spotify.com/artist/0gxyHStUsqpMadRV0Di1Qt' } }],
      album: {
        name: '',
        images: [
          { url: 'https://i/300', height: 300, width: 300 },
          { url: 'https://i/64', height: 64, width: 64 },
        ],
        release_date: '1987-11-12',
        release_date_precision: 'day',
      },
      duration_ms: 213573,
      preview_url: 'https://p.scdn.co/mp3-preview/b4c6',
      external_urls: { spotify: `https://open.spotify.com/track/${ID}` },
    });
  });

  it('bez podgladu nie wymysla preview_url - karta pokaze osadzenie Spotify', () => {
    const track = buildTrackFromSources(ID, { ...entity, audioPreview: null }, null);

    expect(track).to.not.have.property('preview_url');
  });

  it('gdy strona osadzenia padnie, oEmbed daje tytul i miniature', () => {
    const track = buildTrackFromSources(ID, null, {
      title: 'Never Gonna Give You Up',
      thumbnail_url: 'https://i/oembed',
      thumbnail_width: 300,
      thumbnail_height: 300,
    });

    expect(track.name).to.equal('Never Gonna Give You Up');
    expect(track.artists).to.deep.equal([]);
    expect(track.album.images).to.deep.equal([{ url: 'https://i/oembed', height: 300, width: 300 }]);
    expect(track.duration_ms).to.equal(0);
  });

  it('bez zadnego zrodla nie ma utworu', () => {
    expect(buildTrackFromSources(ID, null, null)).to.equal(null);
  });
});
