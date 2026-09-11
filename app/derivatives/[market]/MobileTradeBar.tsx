'use client';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { fmtPrice } from '../format';
import { Val } from '../ui';

/**
 * Belka na dole ekranu (tylko < lg): mark plus Long/Short. Klikniecie
 * otwiera panel zlecenia jako dolny arkusz. Na telefonie panel z prawej
 * kolumny ladowalby pod calym wykresem i zakladkami - trader scrollowalby
 * przez pol strony, zeby dojsc do przycisku.
 */
export default function MobileTradeBar({
  mark,
  open,
  onOpenChange,
  onPick,
  children,
}: {
  mark: bigint | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (side: 'long' | 'short') => void;
  children: React.ReactNode;
}) {
  return (
    <>
      {/* `bottom-[72px]`: nad dolna nawigacja aplikacji (MobileBottomNav, ~72 px,
          na tabletach zwinieta do 14 px). Belka pod nawigacja bylaby niewidoczna. */}
      <div className="fixed inset-x-0 bottom-[72px] z-30 border-t border-sp-shade/10 bg-sp-surface/95 px-4 py-2.5 backdrop-blur md:bottom-[14px] lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-sp-ink-soft">Mark</p>
            <p className="text-sm font-extrabold tabular-nums text-sp-ink">
              <Val v={mark} fmt={fmtPrice} />
            </p>
          </div>
          <button type="button" onClick={() => onPick('long')} className="ml-auto rounded-full bg-sp-up px-5 py-2.5 text-sm font-bold text-white">
            Long
          </button>
          <button type="button" onClick={() => onPick('short')} className="rounded-full bg-sp-down px-5 py-2.5 text-sm font-bold text-white">
            Short
          </button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="inset-x-0 bottom-0 left-0 top-auto max-h-[92vh] w-full max-w-full translate-x-0 translate-y-0 overflow-y-auto rounded-t-[22px] rounded-b-none border-0 bg-sp-bg p-3 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom sm:max-w-full">
          <DialogTitle className="sr-only">Open a position</DialogTitle>
          {children}
        </DialogContent>
      </Dialog>
    </>
  );
}
