'use client';

import { OptionSelect } from '@/components/forms/option-select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMediaQuery } from '@/hooks/use-media-query';

const MAX_TABS = 4;
const PHONE = '(max-width: 767px)';
const noSearch = () => undefined;

interface OriginSelectorProps {
  branches: { id: string; name: string }[];
  value: string | null;
  onChange: (branchId: string) => void;
}

// The branch the routes start from: tabs while they fit, a select with five or more and on a phone.
export function OriginSelector({ branches, value, onChange }: OriginSelectorProps) {
  const onPhone = useMediaQuery(PHONE);
  if (branches.length === 0) return null;

  if (onPhone || branches.length > MAX_TABS) {
    return (
      <div className="max-w-sm">
        <OptionSelect
          id="routes-map-origin"
          label="Sucursal de origen"
          placeholder="Elige una sucursal"
          options={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
          total={branches.length}
          value={value ?? ''}
          onChange={onChange}
          search=""
          onSearchChange={noSearch}
          searchLabel="Buscar sucursal"
          emptyMessage="No hay sucursales registradas."
        />
      </div>
    );
  }

  return (
    <Tabs value={value ?? ''} onValueChange={onChange}>
      <TabsList
        aria-label="Sucursal de origen"
        className="w-full max-w-[720px] rounded-2xl bg-muted p-1 group-data-horizontal/tabs:h-auto"
      >
        {branches.map((branch) => (
          <TabsTrigger key={branch.id} value={branch.id} className="h-11 rounded-xl px-3 text-sm">
            {branch.name}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
