import type { Metadata } from 'next';
import { pageMeta } from '../../../utils/pageMeta';
import NetworkThemeSync from '../../NetworkThemeSync';
import SphereShell from '../SphereShell';
import SphereEscrowPanel from './SphereEscrowPanel';

export const metadata: Metadata = pageMeta({
  title: 'Startpad · $SPHERE escrow',
  description: 'Creator escrow of SPHERE: fee deliveries, ETH split release, token release into vesting.',
  image: '/startpad/sphere/opengraph-image',
});

export default function SphereEscrowPage() {
  return (
    <>
      <NetworkThemeSync />
      <SphereShell>
        <SphereEscrowPanel />
      </SphereShell>
    </>
  );
}
