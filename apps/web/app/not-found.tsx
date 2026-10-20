import { HomeLink, ProblemPage } from '@/components/system/problem-page';

export default function NotFound() {
  return (
    <ProblemPage title="No encontramos esta página" actions={<HomeLink />}>
      La dirección no existe o ya no está disponible. Revisa que esté bien escrita o vuelve al
      inicio.
    </ProblemPage>
  );
}
