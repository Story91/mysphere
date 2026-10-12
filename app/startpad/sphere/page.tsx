import type { Metadata } from 'next';
import { pageMeta } from '../../utils/pageMeta';
import NetworkThemeSync from '../NetworkThemeSync';
import SphereShell from './SphereShell';
import SphereOverview from './SphereOverview';

export const metadata: Metadata = pageMeta({
  title: 'Startpad · $SPHERE',
  description: 'SPHERE - the Startpad platform token: burns, buybacks, creator rewards and treasury management.',
  socialTitle: '$SPHERE - the token behind MySphere Startpad',
});

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
