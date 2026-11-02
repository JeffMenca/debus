import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { queryWrapper } from '../../test-support/query-wrapper';
import { TRIP_ID, mockVentasApi, seatMap, soldTicket } from '../../test-support/tickets';
import { CounterSale } from './counter-sale';

afterEach(() => jest.restoreAllMocks());

const TODAY = '2026-10-18';

function setup(answer: () => Response = () => Response.json(soldTicket(), { status: 201 })) {
  const sent: { key: string; body: unknown }[] = [];
  let seatReads = 0;
  mockVentasApi({
    [`GET /trips/${TRIP_ID}/seats`]: () => {
      seatReads += 1;
      return Response.json(seatMap());
    },
    'POST /counter/tickets': (init) => {
      const headers = init.headers as Record<string, string>;
      sent.push({ key: headers['idempotency-key']!, body: JSON.parse(String(init.body)) });
      return answer();
    },
  });
  const onBack = jest.fn();
  render(<CounterSale tripId={TRIP_ID} today={TODAY} onBack={onBack} />, {
    wrapper: queryWrapper().wrapper,
  });
  return { sent, onBack, seatReads: () => seatReads };
}

const choose = async (...seats: number[]) => {
  for (const seat of seats) {
    await userEvent.click(await screen.findByRole('button', { name: `Asiento ${seat}` }));
  }
};

describe('CounterSale', () => {
  it('shows the trip and waits for a seat before charging', async () => {
    setup();

    expect(await screen.findByText('Quetzaltenango')).toBeInTheDocument();
    expect(screen.getByText('Guatemala')).toBeInTheDocument();
    expect(screen.getByText('Toca un asiento libre en el mapa.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cobrar' })).toBeDisabled();
    expect(screen.getByLabelText('Fecha de pago')).toHaveValue(TODAY);
  });

  it('charges the chosen seats to the generic client and shows the receipt', async () => {
    const { sent } = setup();

    await choose(9, 10);
    await userEvent.click(screen.getByRole('button', { name: /Cobrar Q\s?170\.00/ }));

    expect(await screen.findByRole('heading', { name: 'Boleto vendido' })).toBeInTheDocument();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.body).toEqual({ tripId: TRIP_ID, seats: [9, 10], paidOn: TODAY, nit: 'CF' });
    expect(sent[0]!.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(screen.getByText('Consumidor final')).toBeInTheDocument();
    expect(screen.getByText('09, 10')).toBeInTheDocument();
  });

  it('sends the NIT, the name and the email the buyer gave', async () => {
    const { sent } = setup();

    await choose(5);
    await userEvent.type(screen.getByLabelText('NIT'), '4521837-6');
    expect(screen.getByLabelText('NIT')).toHaveValue('45218376');
    await userEvent.type(screen.getByLabelText(/Nombre/), 'Ana Méndez');
    await userEvent.type(screen.getByLabelText(/Correo/), 'ana@correo.com');
    await userEvent.click(screen.getByRole('button', { name: /Cobrar/ }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.body).toMatchObject({
      nit: '45218376',
      buyerName: 'Ana Méndez',
      email: 'ana@correo.com',
    });
  });

  it('points at a NIT the sale would refuse and sends nothing', async () => {
    const { sent } = setup();

    await choose(5);
    await userEvent.type(screen.getByLabelText('NIT'), 'k');
    await userEvent.click(screen.getByRole('button', { name: /Cobrar/ }));

    expect(
      await screen.findByText('Revisa el NIT o déjalo vacío para consumidor final.'),
    ).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it('keeps the same key to retry a failed sale and a new one after a change', async () => {
    const { sent } = setup(() =>
      Response.json({ statusCode: 503, message: 'Intenta de nuevo.' }, { status: 503 }),
    );

    await choose(5);
    await userEvent.click(screen.getByRole('button', { name: /Cobrar/ }));
    expect(await screen.findByText('Intenta de nuevo.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Cobrar/ }));
    await waitFor(() => expect(sent).toHaveLength(2));
    await choose(6);
    await userEvent.click(screen.getByRole('button', { name: /Cobrar/ }));

    await waitFor(() => expect(sent).toHaveLength(3));
    expect(sent[1]!.key).toBe(sent[0]!.key);
    expect(sent[2]!.key).not.toBe(sent[0]!.key);
  });

  it('keeps the chosen seats and the key when the answer of a sale is lost', async () => {
    const sent: string[] = [];
    let seatReads = 0;
    mockVentasApi({
      [`GET /trips/${TRIP_ID}/seats`]: () => {
        seatReads += 1;
        return Response.json(seatMap({ taken: seatReads > 1 ? [1, 2, 5] : [1, 2] }));
      },
      'POST /counter/tickets': (init) => {
        sent.push((init.headers as Record<string, string>)['idempotency-key']!);
        if (sent.length === 1) throw new TypeError('network');
        return Response.json(soldTicket({ seats: [5] }), { status: 201 });
      },
    });
    render(<CounterSale tripId={TRIP_ID} today={TODAY} onBack={jest.fn()} />, {
      wrapper: queryWrapper().wrapper,
    });

    await choose(5);
    await userEvent.click(screen.getByRole('button', { name: /Cobrar/ }));
    await userEvent.click(await screen.findByRole('button', { name: /Cobrar Q\s?85\.00/ }));

    expect(await screen.findByRole('heading', { name: 'Boleto vendido' })).toBeInTheDocument();
    expect(sent).toHaveLength(2);
    expect(sent[1]).toBe(sent[0]);
  });

  it('reloads the seats when one was sold in the meantime', async () => {
    const { seatReads } = setup(() =>
      Response.json(
        { statusCode: 409, message: 'Alguno de los asientos que elegiste ya fue vendido.' },
        { status: 409 },
      ),
    );

    await choose(5);
    await userEvent.click(screen.getByRole('button', { name: /Cobrar/ }));

    expect(await screen.findByText(/ya fue vendido/)).toBeInTheDocument();
    await waitFor(() => expect(seatReads()).toBe(2));
  });

  it('goes back to the trips to change it or to sell again', async () => {
    const { onBack } = setup();

    await userEvent.click(await screen.findByRole('button', { name: 'Cambiar viaje' }));
    await choose(5);
    await userEvent.click(screen.getByRole('button', { name: /Cobrar/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Vender otro boleto' }));

    expect(onBack).toHaveBeenCalledTimes(2);
  });

  it('sends the payment day the person chose', async () => {
    const { sent } = setup();

    await choose(5);
    fireEvent.change(screen.getByLabelText('Fecha de pago'), { target: { value: '2026-10-17' } });
    await userEvent.click(screen.getByRole('button', { name: /Cobrar/ }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.body).toMatchObject({ paidOn: '2026-10-17' });
  });

  it('says so when the trip cannot be loaded and lets the person try again', async () => {
    let reads = 0;
    mockVentasApi({
      [`GET /trips/${TRIP_ID}/seats`]: () => {
        reads += 1;
        return reads === 1
          ? Response.json({ statusCode: 503, message: 'Intenta de nuevo.' }, { status: 503 })
          : Response.json(seatMap());
      },
    });
    render(<CounterSale tripId={TRIP_ID} today={TODAY} onBack={jest.fn()} />, {
      wrapper: queryWrapper().wrapper,
    });

    expect(await screen.findByText('Intenta de nuevo.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('button', { name: 'Asiento 5' })).toBeInTheDocument();
  });

  it.each([
    [404, 'No encontramos ese viaje', 'No encontramos ese viaje. Puede que ya no esté a la venta.'],
    [409, 'Este viaje ya salió', 'Este viaje ya salió. Elige otro horario.'],
  ])(
    'says so when the trip answers %i and lets the person pick another',
    async (status, title, message) => {
      mockVentasApi({
        [`GET /trips/${TRIP_ID}/seats`]: () =>
          Response.json({ statusCode: status, message }, { status }),
      });
      const onBack = jest.fn();
      render(<CounterSale tripId={TRIP_ID} today={TODAY} onBack={onBack} />, {
        wrapper: queryWrapper().wrapper,
      });

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Cambiar viaje' }));

      expect(onBack).toHaveBeenCalledTimes(1);
    },
  );
});
