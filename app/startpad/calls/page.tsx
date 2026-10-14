import type { Metadata } from 'next';
import CallsBoard from './CallsBoard';

export const metadata: Metadata = {
  title: 'Calls · Startpad',
  description: 'Onchain calls: every buy with a message, scored by price since the buy. Verified humans marked.',
};

export default function CallsPage() {
  return (
    <div className="board min-h-screen bg-sp-bg">
      <CallsBoard />
    </div>
  );
}
