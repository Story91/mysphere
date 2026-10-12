import type { Metadata } from 'next';
import { pageMeta } from '../../../utils/pageMeta';
import NetworkThemeSync from '../../NetworkThemeSync';
import SphereShell from '../SphereShell';
import SphereSeasonPanel from './SphereSeasonPanel';

export const metadata: Metadata = pageMeta({
  title: 'Startpad · $SPHERE season',
  description: 'Weekly creator rewards season: live volume, leaderboard and the public reward formula.',
  image: '/startpad/sphere/opengraph-image',
});

export default function SphereSeasonPage() {
  return (
    <>
      <NetworkThemeSync />
      <SphereShell>
        <SphereSeasonPanel />
      </SphereShell>
    </>
  );
}
