import { CORRELATION_HEADER } from '@debus/contracts';
import { Controller, Get, Headers } from '@nestjs/common';
import { ApiExcludeController, type OpenAPIObject } from '@nestjs/swagger';
import { DocsService } from './docs.service';

@ApiExcludeController()
@Controller()
export class DocsController {
  constructor(private readonly docs: DocsService) {}

  @Get('docs-json')
  document(@Headers(CORRELATION_HEADER) correlationId: string): Promise<OpenAPIObject> {
    return this.docs.document(correlationId);
  }
}
