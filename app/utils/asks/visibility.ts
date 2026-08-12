/**
 * Zdania o tym, kto moze czytac zapieczetowane odpowiedzi i dlaczego ten
 * konkretny widz ich nie widzi.
 *
 * Dotad kazdy dostawal to samo "Sealed. It exists" bez slowa o powodzie.
 * Tworca, ktory wszedl z innego portfela niz ten, ktorym zakladal Aska,
 * widzial swoje wlasne pytanie jako cudze i nie mial zadnej wskazowki, ze
 * problem jest w tozsamosci, a nie w aplikacji. Ten modul mowi powod wprost,
 * dla kazdej roli osobno.
 *
 * Czysty TS bez Reacta i bez importow, wiec testuje sie pod mocha bez
 * przegladarki - patrz test/AskVisibility.test.ts.
 */

export type SealedContext = {
  /** Czy patrzacy ma podpisana sesje SIWE (to ona jest tozsamoscia dla API). */
  signedIn: boolean;
  /** Adres z sesji SIWE, gdy jest. */
  sessionAddress: string | null;
  /** Adres podlaczonego portfela z wagmi, gdy jest. */
  walletAddress: string | null;
  /** Tworca Aska. */
  askAuthor: string;
};

const lower = (value: string | null | undefined) => (value ? value.toLowerCase() : null);

/** `0x1234…abcd` - lokalna kopia, zeby modul nie ciagnal zaleznosci UI. */
function short(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

/**
 * Zdanie pod zapieczetowana odpowiedzia. Wolane tylko wtedy, gdy serwer oddal
 * `sealed: true`, czyli widz NIE jest tworca i Ask nie jest rozstrzygniety.
 */
export function sealedAnswerNotice(ctx: SealedContext): string {
  if (!ctx.signedIn) {
    return `Sealed until the author resolves. If you wrote one of these answers, or this is your Ask, sign in with your wallet to read yours.`;
  }
  const session = lower(ctx.sessionAddress);
  const author = lower(ctx.askAuthor);
  if (session && author && session !== author) {
    return `Sealed. Until this Ask is resolved only its author ${short(ctx.askAuthor)} can read the answers, and you are signed in as ${short(ctx.sessionAddress as string)}.`;
  }
  return 'Sealed until the author resolves.';
}

/**
 * Portfel tworcy jest podlaczony, ale sesja nalezy do INNEGO adresu.
 *
 * To jest dokladnie pulapka "wszedlem ze zlego konta": API patrzy wylacznie na
 * sesje, wiec tworca z cudza sesja jest dla serwera obcym czlowiekiem. Baner
 * z tego predykatu ma mu powiedziec, ze wystarczy podpisac sesje portfelem,
 * ktory juz ma podlaczony.
 */
export function authorIdentityMismatch(ctx: SealedContext): boolean {
  const wallet = lower(ctx.walletAddress);
  const session = lower(ctx.sessionAddress);
  const author = lower(ctx.askAuthor);
  return Boolean(ctx.signedIn && wallet && session && author && wallet === author && session !== author);
}
