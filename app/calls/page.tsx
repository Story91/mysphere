import type { Metadata } from 'next';
import CallsBoard from '../startpad/calls/CallsBoard';

export const metadata: Metadata = {
  title: 'Calls · MySphere',
  description: 'Onchain calls: every buy with a message, scored by price since the buy. Verified humans marked.',
};

export default function CallsPage() {
  return <CallsBoard />;
}
