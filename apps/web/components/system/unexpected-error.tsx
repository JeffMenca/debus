'use client';

import { useEffect } from 'react';
import { HomeLink, ProblemPage } from '@/components/system/problem-page';
import { Button } from '@/components/ui/button';

export interface UnexpectedErrorProps {
  error: Error & { digest?: string };
  retry: () => void;
}

// What both error files show: the error goes to the console so it can be traced, never to the person.
export function UnexpectedError({ error, retry }: UnexpectedErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ProblemPage
      title="Algo salió mal al mostrar esta pantalla"
      actions={
        <>
          <Button onClick={retry}>Intentar de nuevo</Button>
          <HomeLink quiet />
        </>
      }
    >
      No es culpa tuya. Intenta de nuevo; si sigue pasando, vuelve al inicio.
    </ProblemPage>
  );
}
