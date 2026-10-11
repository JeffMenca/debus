'use client';

import { todayInGuatemala } from '@debus/contracts';
import { Bus, Route, Users, Wallet } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { toast } from 'sonner';
import { StatusDot, type StatusTone } from '@/components/brand/status-dot';
import { DataTable, columnHelperFor } from '@/components/data/data-table';
import { KpiCard } from '@/components/data/kpi-card';
import { StatusTabs } from '@/components/data/status-tabs';
import { ConfirmDialog } from '@/components/forms/confirm-dialog';
import { DateField } from '@/components/forms/date-field';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatQuetzales } from '@/lib/format';

interface ExampleBus {
  id: string;
  plate: string;
  model: string;
  state: string;
}

const helper = columnHelperFor<ExampleBus>();
const BUS_COLUMNS = helper.columns([
  helper.accessor('plate', {
    header: 'Placa',
    cell: (info) => <span className="font-mono tabular-nums">{info.getValue()}</span>,
  }),
  helper.accessor('model', { header: 'Modelo' }),
  helper.accessor('state', { header: 'Estado' }),
]);
const BUSES: ExampleBus[] = [
  { id: '1', plate: 'C 421 BQR', model: 'Volvo B8R', state: 'Disponible' },
  { id: '2', plate: 'C 118 TLK', model: 'Scania K360', state: 'En tránsito' },
  { id: '3', plate: 'C 902 HMN', model: 'Mercedes O500', state: 'En taller' },
];

const TONES: { tone: StatusTone; label: string }[] = [
  { tone: 'mint', label: 'Disponible' },
  { tone: 'sky', label: 'En tránsito' },
  { tone: 'mango', label: 'En taller' },
  { tone: 'rose', label: 'Programado' },
  { tone: 'muted', label: 'Inactivo' },
];

type TabValue = 'all' | 'active' | 'inactive';

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = `ds-${title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z]/g, '')}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h2 id={id} className="font-display text-2xl font-bold">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function DesignSystemShowcase() {
  const [date, setDate] = useState(todayInGuatemala);
  const [tab, setTab] = useState<TabValue>('all');
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-[40px] leading-none font-bold">Sistema de diseño</h1>
        <p className="text-muted-foreground">
          Las piezas de base que usan todas las pantallas, con datos de ejemplo.
        </p>
      </header>

      <Section title="Botones">
        <div className="flex flex-wrap gap-3 rounded-[26px] bg-card p-6">
          <Button>Primario</Button>
          <Button variant="secondary">Secundario</Button>
          <Button variant="accent">Destacado</Button>
          <Button variant="ghost">Sutil</Button>
          <Button variant="destructive">Peligro</Button>
          <Button variant="coral">Alquiler</Button>
        </div>
      </Section>

      <Section title="Campos">
        <div className="grid gap-4 rounded-[26px] bg-card p-6 md:grid-cols-3">
          <Field id="ds-name" label="Nombre completo">
            <Input id="ds-name" placeholder="Ana López" />
          </Field>
          <Field id="ds-role" label="Rol">
            <Select defaultValue="cashier">
              <SelectTrigger id="ds-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cashier">Cajero</SelectItem>
                <SelectItem value="driver">Chofer</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <DateField id="ds-date" label="Fecha de pago" value={date} onChange={setDate} />
        </div>
      </Section>

      <Section title="Estados">
        <div className="flex flex-wrap gap-6 rounded-[26px] bg-card p-6">
          {TONES.map(({ tone, label }) => (
            <StatusDot key={label} tone={tone} label={label} live={tone === 'sky'} />
          ))}
        </div>
      </Section>

      <Section title="Indicadores">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard tone="indigo" value={12} label="Sucursales activas" icon={Route} />
          <KpiCard tone="mint" value={248} label="Usuarios activos" icon={Users} />
          <KpiCard tone="coral" value={5} label="Invitaciones pendientes" icon={Bus} />
          <KpiCard
            tone="mango"
            value={1.25}
            label="Depreciación por km"
            format={formatQuetzales}
            icon={Wallet}
          />
        </div>
      </Section>

      <Section title="Pestañas">
        <StatusTabs
          label="Estado de los buses"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'all', label: 'Todos', count: 3 },
            { value: 'active', label: 'Activos', count: 2 },
            { value: 'inactive', label: 'Inactivos', count: 1 },
          ]}
        />
      </Section>

      <Section title="Tabla">
        <DataTable
          caption="Buses de ejemplo"
          columns={BUS_COLUMNS}
          data={BUSES}
          getRowId={(bus) => bus.id}
          emptyMessage="Aún no hay buses."
          summary="Mostrando 3 de 3 buses"
        />
      </Section>

      <Section title="Diálogo">
        <div className="flex flex-wrap gap-3 rounded-[26px] bg-card p-6">
          <Button variant="secondary" onClick={() => setDialogOpen(true)}>
            Abrir diálogo de ejemplo
          </Button>
          <Button variant="secondary" onClick={() => toast.success('Guardamos los cambios.')}>
            Mostrar aviso
          </Button>
        </div>
        <ConfirmDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title="¿Registrar la llegada del bus?"
          description="Después de registrarla ya no se puede cambiar."
          confirmLabel="Registrar llegada"
          checkLabel="Revisé los datos y son correctos"
          onConfirm={async () => undefined}
        />
      </Section>
    </>
  );
}
