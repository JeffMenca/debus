'use client';

import Image from 'next/image';
import type { ReactNode } from 'react';
import { usePhoto } from '@/hooks/use-photo';

interface FleetPhotoProps {
  // Where the gateway serves the picture; null when there is none.
  path: string | null;
  alt: string;
  // What shows until the picture loads, or when there is none.
  fallback: ReactNode;
}

// Fills the box that holds it (the parent must be `relative`).
export function FleetPhoto({ path, alt, fallback }: FleetPhotoProps) {
  const url = usePhoto(path);
  // The picture is a blob of our own: there is nothing for the image optimizer to fetch.
  return url ? (
    <Image src={url} alt={alt} fill unoptimized sizes="96px" className="object-cover" />
  ) : (
    fallback
  );
}
