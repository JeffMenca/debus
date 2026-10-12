'use client';

import { ImagePlus, X } from 'lucide-react';
import Image from 'next/image';
import { type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { useObjectUrl } from '@/hooks/use-object-url';
import { PHOTO_ACCEPT, photoError } from '@/lib/fleet/photo';
import { FleetPhoto } from './fleet-photo';

interface PhotoFieldProps {
  id: string;
  label: string;
  // The picture chosen now, not yet uploaded.
  value: File | null;
  onChange: (file: File | null) => void;
  // Where the picture already saved is served, when there is one.
  currentPath?: string | null;
  fallback: ReactNode;
}

// A picture of the bus or the driver: it shows what will be saved and refuses what the service would.
export function PhotoField({
  id,
  label,
  value,
  onChange,
  currentPath = null,
  fallback,
}: PhotoFieldProps) {
  const [error, setError] = useState<string | undefined>();
  const preview = useObjectUrl(value);

  const hasPhoto = Boolean(value) || Boolean(currentPath);

  return (
    <Field id={id} label={label} error={error}>
      <div className="flex items-center gap-4">
        <div className="relative flex h-[72px] w-24 shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-muted">
          {value && preview ? (
            <Image
              src={preview}
              alt="Vista previa de la foto"
              fill
              unoptimized
              sizes="96px"
              className="object-cover"
            />
          ) : (
            <FleetPhoto path={currentPath} alt={label} fallback={fallback} />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-lg has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring">
            <Button asChild variant="secondary">
              <label htmlFor={id}>
                <ImagePlus aria-hidden strokeWidth={1.75} className="size-4.5" />
                {hasPhoto ? 'Cambiar foto' : 'Elegir foto'}
              </label>
            </Button>
            <input
              id={id}
              type="file"
              accept={PHOTO_ACCEPT}
              aria-label={label}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                const problem = photoError(file);
                setError(problem);
                if (!problem) onChange(file);
              }}
            />
          </span>
          {value && (
            <Button type="button" variant="ghost" onClick={() => onChange(null)}>
              <X aria-hidden strokeWidth={1.75} className="size-4.5" />
              Quitar foto
            </Button>
          )}
        </div>
      </div>
    </Field>
  );
}
