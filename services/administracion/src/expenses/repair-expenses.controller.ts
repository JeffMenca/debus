import {
  CORRELATION_HEADER,
  type CreateRepairExpenseRequest,
  type RepairExpense,
  type RepairExpenseListQuery,
  type RepairExpensePage,
  createRepairExpenseRequestSchema,
  repairExpenseListQuerySchema,
} from '@debus/contracts';
import {
  CurrentIdentity,
  type Identity,
  Roles,
  ZodBody,
  apiBody,
  apiErrors,
  apiQuery,
  apiSuccess,
  requireBranch,
} from '@debus/server';
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RepairExpensesService } from './repair-expenses.service';

// The part of the HTTP response this controller needs: the service has no express types of its own.
interface StatusSetter {
  status(code: number): unknown;
}

@ApiTags('repair-expenses')
@ApiBearerAuth()
@Roles('BRANCH_ADMIN')
@Controller('repair-expenses')
export class RepairExpensesController {
  constructor(private readonly expenses: RepairExpensesService) {}

  @Get()
  @apiSuccess(200)
  @apiErrors(400)
  @apiQuery(repairExpenseListQuerySchema)
  list(
    @CurrentIdentity() actor: Identity,
    @Query(new ZodBody(repairExpenseListQuerySchema)) query: RepairExpenseListQuery,
  ): Promise<RepairExpensePage> {
    return this.expenses.list(requireBranch(actor), query);
  }

  @Get(':id')
  @apiSuccess(200)
  @apiErrors(400, 404)
  get(
    @CurrentIdentity() actor: Identity,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<RepairExpense> {
    return this.expenses.get(requireBranch(actor), id);
  }

  // 201 when the expense is new, 200 with the saved one when the same id was already registered.
  @Post()
  @apiSuccess(201)
  @ApiResponse({ status: 200, description: 'The expense was already registered with that id.' })
  @apiErrors(400, 404, 409)
  @apiBody(createRepairExpenseRequestSchema)
  async create(
    @CurrentIdentity() actor: Identity,
    @Body(new ZodBody(createRepairExpenseRequestSchema)) body: CreateRepairExpenseRequest,
    @Res({ passthrough: true }) response: StatusSetter,
    @Headers(CORRELATION_HEADER) correlationId?: string,
  ): Promise<RepairExpense> {
    const { expense, created } = await this.expenses.create(actor, body, correlationId);
    response.status(created ? 201 : 200);
    return expense;
  }
}
