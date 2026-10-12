import type { Metadata } from 'next';
import { pageMeta } from '../../../utils/pageMeta';
import NetworkThemeSync from '../../NetworkThemeSync';
import SphereShell from '../SphereShell';
import SphereAbout from './SphereAbout';

export const metadata: Metadata = pageMeta({
  title: 'Startpad · $SPHERE · How it works',
  description: 'Tokenomics, fee flows and the honest split between contract guarantees and team-run policy.',
  image: '/startpad/sphere/opengraph-image',
});

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
