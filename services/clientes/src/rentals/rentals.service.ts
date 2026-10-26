import { randomUUID } from 'node:crypto';
import {
  CONSUMER_NIT,
  type ConfirmRentalRequest,
  type CounterRentalRequest,
  type PayRentalRequest,
  type Rental,
  type RentalEstimate,
  type RentalListQuery,
  type RentalPage,
  type RentalRequest,
  estimateRentalPrice,
  pageArgs,
  toPage,
  todayInGuatemala,
} from '@debus/contracts';
import { Outbox, REQUEST_FLUSH } from '@debus/messaging';
import { type Identity, SERVER_MESSAGES, requireBranch } from '@debus/server';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma, Rental as RentalRow } from '../generated/prisma/client';
import { MESSAGES } from '../messages';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsCopyService } from '../settings/settings-copy.service';
import { WalletService } from '../wallet/wallet.service';
import { toRental } from './rental-mappers';
import {
  type RentalProblem,
  cancelProblem,
  confirmProblem,
  confirmedPrice,
  departurePassed,
  historyWhere,
  paymentProblem,
  paymentReplayProblem,
  rentalListWhere,
  rentalPaymentDescription,
  rentalSearchText,
  toRentalConfirmed,
  toRentalPaid,
  visibleTo,
} from './rental-rules';

// The rental row stays locked until the transaction ends, so a payment, a confirmation and a
// cancellation of the same rental are applied one after the other.
const LOCK_RENTAL = 'SELECT id FROM rentals WHERE id = $1::uuid FOR UPDATE';

const UNPROCESSABLE: readonly RentalProblem[] = ['departurePassed'];

function refuse(problem: RentalProblem | null): void {
  if (!problem) return;
  const message = MESSAGES[problem];
  throw UNPROCESSABLE.includes(problem)
    ? new UnprocessableEntityException(message)
    : new ConflictException(message);
}

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

type RentalTrip = Omit<RentalRequest, 'branchId'>;
type Party = Pick<
  Prisma.RentalUncheckedCreateInput,
  'channel' | 'status' | 'branchId' | 'clientId' | 'nit' | 'clientName' | 'email' | 'createdById'
> &
  Partial<Pick<Prisma.RentalUncheckedCreateInput, 'price' | 'confirmedAt' | 'confirmedById'>>;

@Injectable()
export class RentalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: Outbox,
    private readonly wallet: WalletService,
    private readonly settings: SettingsCopyService,
  ) {}

  async estimate(distanceKm: number): Promise<RentalEstimate> {
    const { rentalRatePerKm, effectiveFrom } = await this.rateToday();
    return {
      ratePerKm: rentalRatePerKm,
      estimatedPrice: estimateRentalPrice(distanceKm, rentalRatePerKm),
      effectiveFrom,
    };
  }

  async request(actor: Identity, request: RentalRequest): Promise<Rental> {
    const profile = await this.prisma.clientProfile.findUnique({ where: { userId: actor.userId } });
    if (!profile) throw new NotFoundException(MESSAGES.profilePending);
    const branch = await this.prisma.branchCopy.findUnique({ where: { id: request.branchId } });
    if (!branch?.active) throw new UnprocessableEntityException(MESSAGES.branchUnavailable);
    return this.create(request, {
      channel: 'ONLINE',
      status: 'REQUESTED',
      branchId: request.branchId,
      clientId: actor.userId,
      nit: profile.nit ?? CONSUMER_NIT,
      clientName: profile.fullName,
      email: profile.email,
      createdById: actor.userId,
    });
  }

  // A walk-in rental is agreed at the counter, so it starts confirmed with the price given there.
  async registerCounter(actor: Identity, request: CounterRentalRequest): Promise<Rental> {
    if (request.branchId !== requireBranch(actor)) {
      throw new ForbiddenException(MESSAGES.otherBranch);
    }
    return this.create(request, {
      channel: 'COUNTER',
      status: 'CONFIRMED',
      branchId: request.branchId,
      clientId: null,
      nit: request.nit,
      clientName: request.clientName,
      email: request.email,
      createdById: actor.userId,
      price: request.price,
      confirmedAt: new Date(),
      confirmedById: actor.userId,
    });
  }

  async confirm(
    actor: Identity,
    rentalId: string,
    request: ConfirmRentalRequest,
    correlationId?: string,
  ): Promise<Rental> {
    const row = await this.prisma.$transaction(async (tx) => {
      const rental = await this.lock(tx, actor, rentalId);
      refuse(confirmProblem(rental, new Date()));
      const distanceKm = request.distanceKm ?? rental.distanceKm.toNumber();
      const confirmed = await tx.rental.update({
        where: { id: rentalId },
        data: {
          status: 'CONFIRMED',
          price: request.price,
          distanceKm,
          estimatedPrice: estimateRentalPrice(distanceKm, rental.ratePerKm.toNumber()),
          confirmedAt: new Date(),
          confirmedById: actor.userId,
        },
      });
      // Only an online client waits at home for the price; a walk-in one is at the counter.
      if (confirmed.channel === 'ONLINE') {
        await this.outbox.add(tx, 'RentalConfirmed', toRentalConfirmed(confirmed), correlationId);
      }
      return confirmed;
    });
    await this.outbox.flush(REQUEST_FLUSH);
    return toRental(row);
  }

  // Wallet debit, status and RentalPaid commit together: there is nothing to compensate.
  async pay(
    actor: Identity,
    rentalId: string,
    key: string,
    request: PayRentalRequest,
    correlationId?: string,
  ): Promise<Rental> {
    if (key !== rentalId) throw new BadRequestException(SERVER_MESSAGES.invalidData);
    const row = await this.prisma.$transaction(async (tx) => {
      const rental = await this.lock(tx, actor, rentalId);
      refuse(paymentProblem(rental, actor, new Date()));
      if (rental.status === 'PAID') {
        refuse(paymentReplayProblem(rental, request.paidOn));
        return rental;
      }
      if (rental.clientId) {
        await this.wallet.debitIn(tx, rental.clientId, rentalId, {
          kind: 'RENTAL',
          amount: confirmedPrice(rental),
          occurredOn: request.paidOn,
          reference: rentalId,
          description: rentalPaymentDescription(rental),
        });
      }
      const paid = await tx.rental.update({
        where: { id: rentalId },
        data: { status: 'PAID', paidOn: day(request.paidOn), paidAt: new Date() },
      });
      await this.outbox.add(tx, 'RentalPaid', toRentalPaid(paid), correlationId);
      return paid;
    });
    await this.outbox.flush(REQUEST_FLUSH);
    return toRental(row);
  }

  // Only an unpaid rental is cancelled here; viajes cancels a paid one and sends RentalCancelled.
  async cancel(actor: Identity, rentalId: string): Promise<Rental> {
    const row = await this.prisma.$transaction(async (tx) => {
      const rental = await this.lock(tx, actor, rentalId);
      refuse(cancelProblem(rental));
      if (rental.status === 'CANCELLED') return rental;
      return tx.rental.update({
        where: { id: rentalId },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
    });
    return toRental(row);
  }

  async history(actor: Identity, query: RentalListQuery): Promise<RentalPage> {
    const profile = await this.prisma.clientProfile.findUnique({ where: { userId: actor.userId } });
    if (!profile) throw new NotFoundException(MESSAGES.profilePending);
    return this.page(
      { AND: [historyWhere(profile), rentalListWhere(query)] },
      [{ requestedAt: 'desc' }, { id: 'desc' }],
      query,
    );
  }

  branchList(actor: Identity, query: RentalListQuery): Promise<RentalPage> {
    return this.page(
      { branchId: requireBranch(actor), ...rentalListWhere(query) },
      [{ departureAt: 'asc' }, { id: 'asc' }],
      query,
    );
  }

  private async page(
    where: Prisma.RentalWhereInput,
    orderBy: Prisma.RentalOrderByWithRelationInput[],
    query: RentalListQuery,
  ): Promise<RentalPage> {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.rental.findMany({ where, orderBy, ...pageArgs(query) }),
      this.prisma.rental.count({ where }),
    ]);
    return toPage(rows.map(toRental), total, query);
  }

  private async create(trip: RentalTrip, party: Party): Promise<Rental> {
    const departureAt = new Date(trip.departureAt);
    if (departurePassed(departureAt, new Date())) {
      throw new UnprocessableEntityException(MESSAGES.departurePassed);
    }
    const { rentalRatePerKm } = await this.rateToday();
    const row = await this.prisma.rental.create({
      data: {
        id: randomUUID(),
        ...party,
        originLabel: trip.originLabel,
        destinationLabel: trip.destinationLabel,
        departureAt,
        returnAt: trip.returnAt ? new Date(trip.returnAt) : null,
        passengers: trip.passengers,
        distanceKm: trip.distanceKm,
        ratePerKm: rentalRatePerKm,
        estimatedPrice: estimateRentalPrice(trip.distanceKm, rentalRatePerKm),
        searchText: rentalSearchText({ ...trip, clientName: party.clientName, nit: party.nit }),
      },
    });
    return toRental(row);
  }

  private async rateToday() {
    const settings = await this.settings.effectiveOn(todayInGuatemala());
    if (!settings) throw new UnprocessableEntityException(MESSAGES.noRentalRate);
    return settings;
  }

  private async lock(
    tx: Prisma.TransactionClient,
    actor: Identity,
    rentalId: string,
  ): Promise<RentalRow> {
    await tx.$queryRawUnsafe(LOCK_RENTAL, rentalId);
    const rental = await tx.rental.findUnique({ where: { id: rentalId } });
    if (!rental || !visibleTo(rental, actor)) throw new NotFoundException(MESSAGES.rentalNotFound);
    return rental;
  }
}
