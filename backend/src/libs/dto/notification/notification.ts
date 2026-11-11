import {
  Field,
  GraphQLISODateTime,
  ID,
  InputType,
  Int,
  ObjectType,
} from '@nestjs/graphql';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';
@InputType()
export class MyNotificationsInput {
  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  unreadOnly?: boolean;
  @Field({ nullable: true })
  @IsOptional()
  @Matches(/^[a-f\d]{64}$/)
  after?: string;
  @Field(() => Int, { defaultValue: 20 }) @IsInt() @Min(1) @Max(100) limit = 20;
}
@ObjectType()
export class NotificationOutput {
  @Field(() => ID) _id: string;
  @Field() type: string;
  @Field() message: string;
  @Field(() => ID) waitlistId: string;
  @Field(() => ID) doctorId: string;
  @Field(() => ID) clinicId: string;
  @Field(() => ID, { nullable: true }) appointmentId?: string;
  @Field(() => GraphQLISODateTime) startsAt: Date;
  @Field(() => GraphQLISODateTime) endsAt: Date;
  @Field(() => GraphQLISODateTime) occurredAt: Date;
  @Field(() => GraphQLISODateTime, { nullable: true }) readAt?: Date;
}
@ObjectType()
export class NotificationPage {
  @Field(() => [NotificationOutput]) entries: NotificationOutput[];
  @Field(() => String, { nullable: true }) nextCursor?: string;
  @Field(() => Int) unreadCount: number;
}

@ObjectType()
export class NotificationDeliveryStatus {
  @Field(() => Int) pending: number;
  @Field(() => Int) processing: number;
  @Field(() => Int) delivered: number;
  @Field(() => Int) retrying: number;
  @Field(() => Int) expiredClaims: number;
}
