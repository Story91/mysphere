'use client';

import Image from 'next/image';
import { SOFT_NETWORKS } from './SoftStoryRail';

/**
 * Ekran logowania - wg projektu wlasciciela (wariant 1b, prawy panel).
 *
 * === ELEMENT SYGNATUROWY: ORBITA ===
 * Wielki znak marki w srodku, wokol niego przerywana orbita, a na niej awatary
 * ludzi. To NIE jest ozdoba: cala teza tego produktu brzmi "wiele sieci, jeden
 * feed", a orbita mowi to jednym obrazem, zanim ktokolwiek przeczyta naglowek.
 * Znak stoi w miejscu, ludzie kraza dookola.
 *
 * Ruch jest wolny (28 s na obrot) i `linear`. Ruch ciagly to jedyny przypadek,
 * w ktorym easing byloby bledem - przyspieszanie i zwalnianie orbity wyglada
 * jak zacinanie. Awatary obracaja sie PRZECIWNIE do orbity, wiec zostaja
 * pionowo, zamiast koziolkowac.
 *
 * `prefers-reduced-motion` zatrzymuje orbite calkowicie. Uklad zostaje - to
 * dekoracja, wiec jej bezruch niczego nie odbiera.
 *
 * === DLACZEGO DWA PRZYCISKI, A NIE JEDEN ===
 * Base Account jest wyzej, bo dla kogos BEZ portfela to jedyna sciezka
 * konczaca sie sukcesem - zaklada sie go passkeyem, bez rozszerzenia.
 * Ale to nie jest jedyna opcja i przycisk nie moze tak wygladac: w configu
 * siedzi osiem konektorow. Rzad znakow sieci pod spodem mowi to samo
 * o lancuchach: jest ich wiecej, niz widac.
 */

/** Awatary na orbicie. Pozycje w stopniach - rozlozone nierowno, celowo:
 *  rowny rozstaw czyta sie jak diagram, nierowny jak grupa ludzi. */
const ORBIT = [
  { label: 'Y', deg: 200, bg: '#D9EBFF', color: '#2465D6' },
  { label: 'W', deg: 340, bg: '#FDE4CC', color: '#C2410C' },
  { label: 'D', deg: 100, bg: '#FFE4EF', color: '#BE185D' },
];

export default function SoftSignInHero({
  onContinueWithBase,
  onUseAnotherWallet,
  isBusy,
  statusMessage,
  signedInAs,
}: {
  onContinueWithBase: () => void;
  onUseAnotherWallet: () => void;
  isBusy?: boolean;
  statusMessage?: string | null;
  signedInAs?: string | null;
}) {
  const visibleNetworks = SOFT_NETWORKS.slice(0, 4);
  const hiddenCount = SOFT_NETWORKS.length - visibleNetworks.length;

  return (
    <section className="relative overflow-hidden rounded-card bg-gradient-to-b from-[#8E7BE8] via-[#7C6BDA] to-[#6656BE] px-6 py-10 text-center font-soft">
      {/* ===== ORBITA ===== */}
      <div className="relative mx-auto mb-8 h-[210px] w-[210px]">
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full border border-dashed border-white/45"
        />

        {/* Znak marki. Stoi nieruchomo - to on jest srodkiem ciezkosci. */}
        <span className="absolute left-1/2 top-1/2 flex h-[132px] w-[132px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#F5A73B] shadow-[0_12px_36px_rgba(60,44,120,0.35)]">
          <Image
            src="/android-chrome-192x192.png"
            alt=""
            width={78}
            height={78}
            className="h-[78px] w-[78px] rounded-full object-contain"
            priority
          />
        </span>

        {/* Awatary. Kazdy siedzi na wlasnym promieniu i obraca sie razem
            z orbita, a wewnetrzny element odkreca go z powrotem do pionu. */}
        <div className="soft-orbit absolute inset-0" aria-hidden="true">
          {ORBIT.map((item) => (
            <span
              key={item.label}
              className="absolute left-1/2 top-1/2 h-0 w-0"
              style={{ transform: `rotate(${item.deg}deg) translateX(105px)` }}
            >
              <span
                className="soft-orbit-counter flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full font-soft-display text-[13px] font-bold shadow-chip"
                style={{
                  background: item.bg,
                  color: item.color,
                  // Odkrecenie o wlasny kat orbity - inaczej awatar lezalby
                  // na boku po drugiej stronie kola.
                  ['--orbit-deg' as string]: `${-item.deg}deg`,
                }}
              >
                {item.label}
              </span>
            </span>
          ))}
        </div>
      </div>

      <h1 className="mb-3 font-soft-display text-[26px] font-bold leading-[1.15] text-white sm:text-[30px]">
        Post, tip &amp; connect
        <br />
        onchain
      </h1>

      <p className="mx-auto mb-7 max-w-[36ch] text-[13.5px] font-semibold leading-[1.5] text-white/80">
        One feed across Base, Camp, Linea, Celo, Ethereum, World Chain and Robinhood.
      </p>

      <div className="mx-auto flex max-w-[320px] flex-col gap-2.5">
        <button
          type="button"
          onClick={onContinueWithBase}
          disabled={isBusy}
          className="rounded-pill bg-white px-5 py-3.5 font-soft text-[14.5px] font-bold text-soft-primary-deep shadow-float transition-transform duration-[--dur-press] ease-out-strong active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-70 disabled:active:scale-100"
        >
          {isBusy ? 'Check your wallet…' : 'Continue with Base Account'}
        </button>

        <button
          type="button"
          onClick={onUseAnotherWallet}
          disabled={isBusy}
          className="rounded-pill border border-white/45 px-5 py-3.5 font-soft text-[14.5px] font-semibold text-white transition-[background-color,transform] duration-[--dur-press] ease-out-strong hover:bg-white/10 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-70 disabled:active:scale-100"
        >
          Use another wallet
        </button>
      </div>

      {/* Znaki sieci. Mowia to samo co zdanie wyzej, ale szybciej - i wprost
          przyznaja, ze jest ich wiecej, niz widac. */}
      <div className="mt-6 flex items-center justify-center gap-2">
        {visibleNetworks.map((network) => (
          <span
            key={network.id}
            title={network.label}
            className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-white/90 shadow-chip"
          >
            <Image
              src={network.iconSrc}
              alt={network.label}
              width={16}
              height={16}
              className="h-4 w-4 object-contain"
            />
          </span>
        ))}
        <span className="ml-1 text-[12px] font-semibold text-white/75">+{hiddenCount} more</span>
      </div>

      {signedInAs && (
        <p className="mt-5 text-[12.5px] font-semibold text-white/90">Signed in as {signedInAs}</p>
      )}

      {statusMessage && (
        <p role="alert" className="mt-5 text-[12.5px] font-semibold text-[#FFD9C2]">
          {statusMessage}
        </p>
      )}
    </section>
  );
}
