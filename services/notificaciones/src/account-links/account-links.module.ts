import { Module } from '@nestjs/common';
import { AccountLinkHandler } from './account-link.handler';

@Module({ providers: [AccountLinkHandler] })
export class AccountLinksModule {}
