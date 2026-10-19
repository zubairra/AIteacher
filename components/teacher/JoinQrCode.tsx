'use client';

import { useEffect, useState } from 'react';

export function JoinQrCode({ value }: { value: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import('qrcode').then((qr) =>
      qr.toDataURL(value, { margin: 1, width: 220, errorCorrectionLevel: 'M' }).then((url) => {
        if (!cancelled) setSrc(url);
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [value]);

  if (!src) {
    return <div className="size-52 animate-pulse rounded-xl bg-slate-200" aria-hidden="true" />;
  }
  return (
    <img
      src={src}
      alt="QR code for the student join page"
      width={220}
      height={220}
      className="size-52 rounded-xl bg-white"
    />
  );
}
