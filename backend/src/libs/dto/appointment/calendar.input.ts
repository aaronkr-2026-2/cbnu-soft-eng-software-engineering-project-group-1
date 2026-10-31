import { Field, GraphQLISODateTime, ID, InputType, Int } from '@nestjs/graphql';
import {
  IsDate,
  IsInt,
  IsMongoId,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';
@InputType()
export class CalendarRangeInput {
  @Field(() => GraphQLISODateTime) @IsDate() from: Date;
  @Field(() => GraphQLISODateTime) @IsDate() to: Date;
  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsMongoId()
  doctorId?: string;
}
@InputType()
export class CalendarInput extends CalendarRangeInput {
  @Field(() => Int, { defaultValue: 100 }) @IsInt() @Min(1) @Max(100) limit =
    100;
  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsMongoId()
  after?: string;
  @Field(() => String, { nullable: true })
  @IsOptional()
  @Matches(/^[a-f\d]{64}$/)
  revision?: string;
}
@InputType()
export class CalendarUpdatesInput extends CalendarRangeInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @Matches(/^[a-f\d]{64}$/)
  knownRevision?: string;
}
