import Link from 'next/link';
import DocsSidebar from './DocsSidebar';
import DocsTopNav from './DocsTopNav';

/**
 * Rama dokumentacji: lewy sidebar (desktop) + kolumna tresci. Uzywana WPROST
 * przez kazda strone przewodnika (/Docs i /Docs/<modul>), a NIE jako
 * segmentowy layout.tsx - bo layout objalby takze /Docs/mysphere-whitepaper,
 * ktory jest samodzielna strona z wlasnymi krojami i wlasnym ukladem. Rama
 * jako komponent zostawia tamta strone nietknieta.
 */
export default function DocsShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-soft-bg font-soft">
      <div className="mx-auto flex max-w-[1120px] gap-10 px-4 py-10 sm:px-6 lg:py-14">
        <aside className="hidden w-[224px] shrink-0 lg:block">
          <div className="sticky top-24">
            <Link
              href="/Docs"
              className="mb-5 block font-soft-display text-[15px] font-bold text-soft-ink"
            >
              MySphere <span className="text-soft-primary-deep">Docs</span>
            </Link>
            <DocsSidebar />
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <DocsTopNav />
          <main className="max-w-[760px]">{children}</main>
        </div>
      </div>
    </div>
  );
}
