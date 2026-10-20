'use client';

import { UnexpectedError, type UnexpectedErrorProps } from '@/components/system/unexpected-error';

// Shown in place of a screen that threw while it was drawn.
export default function ErrorPage(props: UnexpectedErrorProps) {
  return <UnexpectedError {...props} />;
}
