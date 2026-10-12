import type { Metadata } from 'next';
import { pageMeta } from '../../../utils/pageMeta';
import NetworkThemeSync from '../../NetworkThemeSync';
import SphereShell from '../SphereShell';
import SphereVestingPanel from './SphereVestingPanel';

export const metadata: Metadata = pageMeta({
  title: 'Startpad · $SPHERE vesting',
  description: 'Treasury vesting of SPHERE: frozen schedule, unlock progress, permissionless release.',
  image: '/startpad/sphere/opengraph-image',
});

export default function SphereVestingPage() {
  return (
    <>
      <NetworkThemeSync />
      <SphereShell>
        <SphereVestingPanel />
      </SphereShell>
    </>
  );
}
