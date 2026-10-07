import type { EventProducer } from '@debus/contracts';
import { PubSub } from '@google-cloud/pubsub';
import { type DynamicModule, type InjectionToken, Module, type Provider } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { OAuth2Client } from 'google-auth-library';
import type { InboxStore } from './inbox/inbox-store';
import { EventDispatcher } from './inbound/event-dispatcher';
import { EventsController } from './inbound/events.controller';
import { InboundEvents } from './inbound/inbound-events';
import { ProbeEventHandler } from './inbound/probe-event.handler';
import { PubSubPushGuard } from './inbound/pubsub-push.guard';
import { EventPublisher } from './publishing/event-publisher';
import { loadMessagingSettings, type MessagingSettings } from './settings';
import { INBOX_STORE, MESSAGING_SETTINGS, OIDC_VERIFIER, PUBSUB_CLIENT } from './tokens';

export interface MessagingModuleOptions {
  service: EventProducer;
  inbox?: { inject?: InjectionToken[]; useFactory: (...deps: never[]) => InboxStore };
}

@Module({})
export class MessagingModule {
  static forRoot(options: MessagingModuleOptions): DynamicModule {
    const publishing: Provider[] = [
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
    const base = { module: MessagingModule, global: true, exports: [EventPublisher] };
    if (!options.inbox) return { ...base, providers: publishing };

    return {
      ...base,
      imports: [DiscoveryModule],
      controllers: [EventsController],
      providers: [
        ...publishing,
        {
          provide: INBOX_STORE,
          inject: options.inbox.inject ?? [],
          useFactory: options.inbox.useFactory,
        },
        { provide: OIDC_VERIFIER, useValue: new OAuth2Client() },
        PubSubPushGuard,
        EventDispatcher,
        InboundEvents,
        ProbeEventHandler,
      ],
    };
  }
}
