import type { Metadata } from 'next';
import NetworkThemeSync from '../NetworkThemeSync';
import SphereShell from './SphereShell';
import SphereOverview from './SphereOverview';

export const metadata: Metadata = {
  title: 'Startpad · $SPHERE',
  description: 'SPHERE - the Startpad platform token: burns, buybacks, creator rewards and treasury management.',
};

export default function SpherePage() {
  return (
    <>
      <NetworkThemeSync />
      <SphereShell>
        <SphereOverview />
      </SphereShell>
    </>
  );
}
