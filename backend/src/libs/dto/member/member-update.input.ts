import { Field, InputType } from '@nestjs/graphql';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { Location } from '../../enum/location.enum.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const passwordFields = (data: MemberUpdateInput) =>
  data.currentPassword !== undefined ||
  data.newPassword !== undefined ||
  data.confirmPassword !== undefined;

@InputType()
export class MemberUpdateInput {
  @Field(() => String, { nullable: true })
  @ValidateIf((_data, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  memberFullName?: string;

  @Field(() => String, { nullable: true })
  @ValidateIf((_data, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @Length(2, 40)
  memberNick?: string;

  @Field(() => String, { nullable: true })
  @ValidateIf((_data, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  memberPhone?: string;

  @Field(() => String, { nullable: true })
  @ValidateIf((_data, value) => value !== undefined)
  @IsString()
  @MaxLength(250)
  memberImage?: string;

  @Field(() => String, { nullable: true })
  @ValidateIf((_data, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  memberAddress?: string;

  @Field(() => String, { nullable: true })
  @ValidateIf((_data, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  memberDesc?: string;

  @Field(() => String, { nullable: true })
  @ValidateIf((_data, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @Length(1, 150)
  clinicName?: string;

  @Field(() => Location, { nullable: true })
  @ValidateIf((_data, value) => value !== undefined)
  @IsEnum(Location)
  location?: Location;

  @Field(() => String, { nullable: true })
  @ValidateIf(passwordFields)
  @IsString()
  @Length(1, 128)
  currentPassword?: string;

  @Field(() => String, { nullable: true })
  @ValidateIf(passwordFields)
  @IsString()
  @Length(8, 100)
  newPassword?: string;

  @Field(() => String, { nullable: true })
  @ValidateIf(passwordFields)
  @IsString()
  @Length(8, 100)
  confirmPassword?: string;
}
