import type { Metadata } from 'next';
import NetworkThemeSync from '../../NetworkThemeSync';
import SphereShell from '../SphereShell';
import SphereRewardsPanel from './SphereRewardsPanel';

export const metadata: Metadata = {
  title: 'Startpad · $SPHERE rewards',
  description: 'SPHERE rewards vault: balance, fee deliveries and pull history.',
};

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
