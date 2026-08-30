import type { Metadata } from 'next';
import NetworkThemeSync from '../../NetworkThemeSync';
import SphereShell from '../SphereShell';
import SphereEscrowPanel from './SphereEscrowPanel';

export const metadata: Metadata = {
  title: 'Startpad · $SPHERE escrow',
  description: 'Creator escrow of SPHERE: fee deliveries, ETH split release, token release into vesting.',
};

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
