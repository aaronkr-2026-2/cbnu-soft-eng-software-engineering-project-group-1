import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsMongoId, Max, Min, ValidateIf } from 'class-validator';

@InputType()
export class AccountDeletionPageInput {
  @Field(() => ID, { nullable: true })
  @ValidateIf((_data, value) => value !== undefined)
  @IsMongoId()
  appointmentAfter?: string;

  @Field(() => ID, { nullable: true })
  @ValidateIf((_data, value) => value !== undefined)
  @IsMongoId()
  waitlistAfter?: string;

  @Field(() => Int, { defaultValue: 20 })
  @IsInt()
  @Min(1)
  @Max(100)
  appointmentLimit = 20;

  @Field(() => Int, { defaultValue: 20 })
  @IsInt()
  @Min(1)
  @Max(100)
  waitlistLimit = 20;
}
