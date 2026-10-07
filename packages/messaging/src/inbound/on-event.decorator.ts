import type { EventType } from '@debus/contracts';
import { Reflector } from '@nestjs/core';

export const OnEvent = Reflector.createDecorator<EventType>();
