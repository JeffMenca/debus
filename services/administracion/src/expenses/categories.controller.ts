import {
  type CreateExpenseCategoryRequest,
  type ExpenseCategory,
  type ExpenseCategoryListQuery,
  type ExpenseCategoryPage,
  type UpdateExpenseCategoryRequest,
  createExpenseCategoryRequestSchema,
  expenseCategoryListQuerySchema,
  updateExpenseCategoryRequestSchema,
} from '@debus/contracts';
import { Roles, ZodBody, apiBody, apiErrors, apiQuery, apiSuccess } from '@debus/server';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';

@ApiTags('expense-categories')
@ApiBearerAuth()
@Roles('SYSTEM_ADMIN')
@Controller('expense-categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @Roles('SYSTEM_ADMIN', 'BRANCH_ADMIN')
  @apiSuccess(200)
  @apiErrors(400)
  @apiQuery(expenseCategoryListQuerySchema)
  list(
    @Query(new ZodBody(expenseCategoryListQuerySchema)) query: ExpenseCategoryListQuery,
  ): Promise<ExpenseCategoryPage> {
    return this.categories.list(query);
  }

  @Post()
  @apiSuccess(201)
  @apiErrors(400, 409)
  @apiBody(createExpenseCategoryRequestSchema)
  create(
    @Body(new ZodBody(createExpenseCategoryRequestSchema)) body: CreateExpenseCategoryRequest,
  ): Promise<ExpenseCategory> {
    return this.categories.create(body);
  }

  @Patch(':id')
  @apiSuccess(200)
  @apiErrors(400, 404, 409)
  @apiBody(updateExpenseCategoryRequestSchema)
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodBody(updateExpenseCategoryRequestSchema)) body: UpdateExpenseCategoryRequest,
  ): Promise<ExpenseCategory> {
    return this.categories.update(id, body);
  }

  @Delete(':id')
  @apiSuccess(204)
  @apiErrors(400, 404, 409)
  remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.categories.remove(id);
  }
}
