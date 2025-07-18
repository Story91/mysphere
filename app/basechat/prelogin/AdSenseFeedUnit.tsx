'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    adsbygoogle: any;
  }
}

const AdSenseFeedUnit = () => {
  useEffect(() => {
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (err) {
      console.error('AdSense error:', err);
    }
  }, []);

  return (
    <ins
      className="adsbygoogle"
      style={{ display: 'block' }}
      data-ad-format="fluid"
      data-ad-layout-key="-gs-3+1f-3d+2z"
      data-ad-client="ca-pub-3796065666088205"
      data-ad-slot="5196466210"
    ></ins>
  );
};

export default AdSenseFeedUnit; 