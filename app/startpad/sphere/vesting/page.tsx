import type { Metadata } from 'next';
import NetworkThemeSync from '../../NetworkThemeSync';
import SphereShell from '../SphereShell';
import SphereVestingPanel from './SphereVestingPanel';

export const metadata: Metadata = {
  title: 'Startpad · $SPHERE vesting',
  description: 'Treasury vesting of SPHERE: frozen schedule, unlock progress, permissionless release.',
};

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
