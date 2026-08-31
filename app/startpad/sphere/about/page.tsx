import type { Metadata } from 'next';
import NetworkThemeSync from '../../NetworkThemeSync';
import SphereShell from '../SphereShell';
import SphereAbout from './SphereAbout';

export const metadata: Metadata = {
  title: 'Startpad · $SPHERE · How it works',
  description: 'Tokenomics, fee flows and the honest split between contract guarantees and team-run policy.',
};

export default function SphereAboutPage() {
  return (
    <>
      <NetworkThemeSync />
      <SphereShell>
        <SphereAbout />
      </SphereShell>
    </>
  );
}
