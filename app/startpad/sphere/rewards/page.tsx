import type { Metadata } from 'next';
import { pageMeta } from '../../../utils/pageMeta';
import NetworkThemeSync from '../../NetworkThemeSync';
import SphereShell from '../SphereShell';
import SphereRewardsPanel from './SphereRewardsPanel';

export const metadata: Metadata = pageMeta({
  title: 'Startpad · $SPHERE rewards',
  description: 'SPHERE rewards vault: balance, fee deliveries and pull history.',
  image: '/startpad/sphere/opengraph-image',
});

export default function SphereRewardsPage() {
  return (
    <>
      <NetworkThemeSync />
      <SphereShell>
        <SphereRewardsPanel />
      </SphereShell>
    </>
  );
}
