import { UseGuards } from '@nestjs/common';
import { Args, Context, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
  MemberAccessGuard,
  type AuthenticatedRequest,
} from '../auth/guards/member-access.guard.js';
import {
  MyNotificationsInput,
  NotificationOutput,
  NotificationPage,
  NotificationDeliveryStatus,
} from '../../libs/dto/notification/notification.js';
import { NotificationService } from './notification.service.js';
@Resolver(() => NotificationOutput)
@UseGuards(MemberAccessGuard)
export class NotificationResolver {
  constructor(private readonly notifications: NotificationService) {}
  @Query(() => NotificationPage)
  myNotifications(
    @Args('input', { defaultValue: {} }) input: MyNotificationsInput,
    @Context('req') req: AuthenticatedRequest,
  ) {
    return this.notifications.list(input, req.member);
  }
  @Query(() => NotificationDeliveryStatus)
  notificationDeliveryStatus(@Context('req') req: AuthenticatedRequest) {
    return this.notifications.deliveryStatus(req.member);
  }
  @Mutation(() => NotificationOutput)
  markNotificationRead(
    @Args('id', { type: () => ID }) id: string,
    @Context('req') req: AuthenticatedRequest,
  ) {
    return this.notifications.read(id, req.member);
  }
}
