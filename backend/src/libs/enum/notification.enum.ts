import { registerEnumType } from '@nestjs/graphql';
export enum NotificationTargetKind {
  APPOINTMENT = 'APPOINTMENT',
  SLOT = 'SLOT',
  WAITLIST = 'WAITLIST',
  UNAVAILABLE = 'UNAVAILABLE',
}
registerEnumType(NotificationTargetKind, { name: 'NotificationTargetKind' });
