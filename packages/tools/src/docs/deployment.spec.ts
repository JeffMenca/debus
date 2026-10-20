import { deploymentDiagram } from './deployment';

describe('deploymentDiagram of a service', () => {
  const diagram = deploymentDiagram('flota');

  it('is a Mermaid flowchart', () => {
    expect(diagram.startsWith('flowchart LR')).toBe(true);
  });

  it('puts the service in Cloud Run and its own database in Cloud SQL', () => {
    expect(diagram).toContain('Cloud Run flota');
    expect(diagram).toContain('Cloud SQL flota');
  });

  it('has its topic and one subscription for each service that listens to it', () => {
    expect(diagram).toContain('flota-events');
    for (const consumer of ['viajes', 'reportes', 'administracion', 'notificaciones']) {
      expect(diagram).toContain(`${consumer}-from-flota`);
    }
    expect(diagram).not.toContain('clientes-from-flota');
  });

  it('has a subscription for each service it listens to', () => {
    for (const producer of ['administracion', 'viajes', 'gateway']) {
      expect(diagram).toContain(`flota-from-${producer}`);
    }
    expect(diagram).not.toContain('flota-from-ventas');
  });

  it('has the dead letter queue and the job that flushes the outbox', () => {
    expect(diagram).toContain('flota-dlq');
    expect(diagram).toContain('flota-outbox-flush');
    expect(diagram).toContain('Cloud Run flota');
  });

  it('shows the synchronous call that viajes makes to flota', () => {
    expect(diagram).toMatch(/viajes.*-->.*flota/);
    expect(diagram).toContain('Ver si el bus y el chofer están disponibles');
  });

  it('draws the calls that are in use solid, whoever makes them', () => {
    const viajes = deploymentDiagram('viajes');
    expect(viajes).toMatch(/n_viajes -->\|"HTTP: Ver si el bus y el chofer/);
    expect(viajes).toMatch(
      /n_ventas -->\|"HTTP: Ver si el viaje está abierto a la venta"\| n_viajes/,
    );
    const ventas = deploymentDiagram('ventas');
    expect(ventas).toMatch(/n_ventas -->\|"HTTP: Ver si el viaje está abierto a la venta"\|/);
    expect(ventas).toMatch(/n_ventas -->\|"HTTP: Cobrar con la cartera del cliente"\|/);
    for (const unit of ['flota', 'viajes', 'ventas', 'clientes'] as const) {
      expect(deploymentDiagram(unit)).not.toMatch(/HTTP prevista/);
    }
  });

  it('shows the job that settles the purchases in doubt only on ventas', () => {
    expect(deploymentDiagram('ventas')).toMatch(
      /Cloud Scheduler ventas-purchase-recovery.*-->\|POST \/internal\/purchases\/recover\| n_ventas/,
    );
    expect(deploymentDiagram('clientes')).not.toContain('purchase-recovery');
  });

  it('writes every label in Spanish', () => {
    for (const unit of ['flota', 'viajes', 'administracion', 'notificaciones'] as const) {
      const text = deploymentDiagram(unit);
      expect(text).not.toMatch(/failed|Check |Debit|deliver/i);
    }
    expect(diagram).toContain('tras 5 entregas fallidas');
  });

  it('does not repeat a node or a subscription', () => {
    const subscriptions = diagram.match(/\w+-from-\w+/g) ?? [];
    expect(subscriptions.length).toBeGreaterThan(0);
    const labels = [...diagram.matchAll(/\["([^"]+)"\]/g)].map((match) => match[1]);
    expect(labels.length).toBeGreaterThan(5);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('shows what a service that makes the calls has to reach', () => {
    const calls = deploymentDiagram('viajes');
    expect(calls).toMatch(/viajes.*-->.*flota/);
    expect(calls).toMatch(/ventas.*-->.*viajes/);
  });

  it('gives a service that publishes nothing no topic', () => {
    const quiet = deploymentDiagram('notificaciones');
    expect(quiet).not.toContain('notificaciones-events');
    expect(quiet).toContain('notificaciones-dlq');
  });
});

describe('deploymentDiagram of the gateway', () => {
  const diagram = deploymentDiagram('gateway');

  it('goes from the web to the gateway to the seven services, with no database', () => {
    expect(diagram).toContain('Cloud Run web');
    expect(diagram).toContain('Cloud Run gateway');
    for (const service of [
      'administracion',
      'flota',
      'viajes',
      'ventas',
      'clientes',
      'reportes',
      'notificaciones',
    ]) {
      expect(diagram).toContain(`Cloud Run ${service}`);
    }
    expect(diagram).not.toContain('Cloud SQL');
  });

  it('publishes the diagnostic probe', () => {
    expect(diagram).toContain('gateway-events');
  });
});
