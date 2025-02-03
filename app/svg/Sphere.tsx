import Image from 'next/image';
import { FC } from 'react';

interface SphereSvgProps {
  className?: string;
}

const SphereSvg: FC<SphereSvgProps> = ({ className = '' }) => {
  return (
    <div className={className}>
      <Image
        src="/elo2.png"
        alt="Sphere Logo"
        width={200}
        height={34}
        className="object-contain"
        priority
      />
    </div>
  );
};

export default SphereSvg; 