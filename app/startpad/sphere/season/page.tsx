import type { Metadata } from 'next';
import NetworkThemeSync from '../../NetworkThemeSync';
import SphereShell from '../SphereShell';
import SphereSeasonPanel from './SphereSeasonPanel';

export const metadata: Metadata = {
  title: 'Startpad · $SPHERE season',
  description: 'Weekly creator rewards season: live volume, leaderboard and the public reward formula.',
};

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
