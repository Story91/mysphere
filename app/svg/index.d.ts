declare module '../svg/Sphere' {
  import { FC } from 'react';
  
  interface SphereSvgProps {
    className?: string;
  }
  
  const SphereSvg: FC<SphereSvgProps>;
  export default SphereSvg;
} 