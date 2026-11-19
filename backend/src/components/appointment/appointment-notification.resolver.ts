import { UseGuards } from '@nestjs/common';
import { Args, Context, ID, Query, Resolver } from '@nestjs/graphql';
import {
  MemberAccessGuard,
  type AuthenticatedRequest,
} from '../auth/guards/member-access.guard.js';
import { NotificationContext } from '../../libs/dto/notification/notification-context.js';
import { AppointmentNotificationService } from './appointment-notification.service.js';
@Resolver()
@UseGuards(MemberAccessGuard)
export class AppointmentNotificationResolver {
  constructor(private readonly notices: AppointmentNotificationService) {}
  @Query(() => NotificationContext)
  notificationContext(
    @Args('id', { type: () => ID }) id: string,
    @Context('req') req: AuthenticatedRequest,
  ) {
    return this.notices.context(id, req.member);
  }
}
