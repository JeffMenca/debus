'use client';

import { Eye, EyeOff, Lock } from 'lucide-react';
import { type ComponentProps, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type PasswordInputProps = Omit<ComponentProps<typeof Input>, 'type' | 'icon' | 'trailing'>;

export function PasswordInput(props: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const Toggle = visible ? EyeOff : Eye;
  return (
    <Input
      {...props}
      type={visible ? 'text' : 'password'}
      icon={Lock}
      trailing={
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          onClick={() => setVisible((value) => !value)}
          className="absolute top-0 right-0.5 text-muted-foreground"
        >
          <Toggle aria-hidden strokeWidth={1.75} className="size-5" />
        </Button>
      }
    />
  );
}
