import { PDF_CONTENT_TYPE } from '@debus/contracts';
import { applyDecorators } from '@nestjs/common';
import { ApiOkResponse, ApiProduces } from '@nestjs/swagger';

export const apiPdf = (): MethodDecorator =>
  applyDecorators(
    ApiProduces(PDF_CONTENT_TYPE),
    ApiOkResponse({
      content: { [PDF_CONTENT_TYPE]: { schema: { type: 'string', format: 'binary' } } },
    }),
  );
