'use client';

import './globals.css';
import { UnexpectedError, type UnexpectedErrorProps } from '@/components/system/unexpected-error';

// An error in the root layout replaces the whole document, so this page brings its own <html>.
export default function GlobalError(props: UnexpectedErrorProps) {
  return (
    <html lang="es">
      <body>
        <UnexpectedError {...props} />
      </body>
    </html>
  );
}
