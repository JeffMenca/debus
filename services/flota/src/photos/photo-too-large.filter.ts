import { HttpExceptionFilter } from '@debus/server';
import {
  type ArgumentsHost,
  BadRequestException,
  Catch,
  type ExceptionFilter,
  PayloadTooLargeException,
} from '@nestjs/common';
import { FLEET_MESSAGES } from '../common/messages';

// multer rejects a file over the limit with an English message; the screen needs the Spanish one.
@Catch(PayloadTooLargeException)
export class PhotoTooLargeFilter implements ExceptionFilter {
  private readonly shared = new HttpExceptionFilter();

  catch(_exception: PayloadTooLargeException, host: ArgumentsHost): void {
    this.shared.catch(new BadRequestException(FLEET_MESSAGES.photoInvalid), host);
  }
}
