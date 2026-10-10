import type { EventProducer } from '@debus/contracts';
import { PubSub } from '@google-cloud/pubsub';
import {
  type DynamicModule,
  type InjectionToken,
  Module,
  type Provider,
  type Type,
} from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { OAuth2Client } from 'google-auth-library';
import type { InboxStore } from './inbox/inbox-store';
import type { SqlTransactional } from './inbox/sql-inbox-store';
import { EventDispatcher } from './inbound/event-dispatcher';
import { EventsController } from './inbound/events.controller';
import { InboundEvents } from './inbound/inbound-events';
import { ProbeEventHandler } from './inbound/probe-event.handler';
import { PubSubPushGuard } from './inbound/pubsub-push.guard';
import { Outbox } from './outbox/outbox';
import { OutboxController } from './outbox/outbox.controller';
import { SqlOutboxStore } from './outbox/sql-outbox-store';
import { EventPublisher } from './publishing/event-publisher';
import { loadMessagingSettings, type MessagingSettings } from './settings';
import {
  INBOX_STORE,
  MESSAGING_SETTINGS,
  OIDC_VERIFIER,
  OUTBOX_STORE,
  PUBSUB_CLIENT,
} from './tokens';

export interface MessagingModuleOptions {
  service: EventProducer;
  inbox?: { inject?: InjectionToken[]; useFactory: (...deps: never[]) => InboxStore };
  outbox?: { inject?: InjectionToken[]; useFactory: (...deps: never[]) => SqlTransactional };
}

@Module({})
export class MessagingModule {
  static forRoot(options: MessagingModuleOptions): DynamicModule {
    const { inbox, outbox } = options;
    const imports: DynamicModule['imports'] = [];
    const controllers: Type[] = [];
    const exports: DynamicModule['exports'] = [EventPublisher];
    const providers: Provider[] = [
      {
        provide: MESSAGING_SETTINGS,
        useFactory: () => loadMessagingSettings(options.service, process.env),
      },
      {
        provide: PUBSUB_CLIENT,
        inject: [MESSAGING_SETTINGS],
        useFactory: (settings: MessagingSettings) => new PubSub({ projectId: settings.projectId }),
      },
      EventPublisher,
    ];

    if (inbox || outbox) {
      // Both inbound push and the outbox flush are called by Google with the same OIDC identity.
      providers.push({ provide: OIDC_VERIFIER, useValue: new OAuth2Client() }, PubSubPushGuard);
    }

    if (inbox) {
      imports.push(DiscoveryModule);
      controllers.push(EventsController);
      providers.push(
        { provide: INBOX_STORE, inject: inbox.inject ?? [], useFactory: inbox.useFactory },
        EventDispatcher,
        InboundEvents,
        ProbeEventHandler,
      );
    }

    if (outbox) {
      controllers.push(OutboxController);
      exports.push(Outbox);
      providers.push(
        {
          provide: OUTBOX_STORE,
          inject: outbox.inject ?? [],
          useFactory: (...deps: never[]) => new SqlOutboxStore(outbox.useFactory(...deps)),
        },
        Outbox,
      );
    }

    return { module: MessagingModule, global: true, imports, controllers, exports, providers };
  }
}
