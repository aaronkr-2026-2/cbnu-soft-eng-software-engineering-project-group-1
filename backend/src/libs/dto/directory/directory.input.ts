import { Field, InputType, Int } from '@nestjs/graphql';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { DirectorySort } from '../../enum/directory.enum.js';
import { Location } from '../../enum/location.enum.js';
import { DoctorSpecialization } from '../../enum/member.enum.js';

@InputType({ isAbstract: true })
abstract class DirectoryFiltersInput {
  @Field(() => Location, { nullable: true })
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(Location)
  city?: Location;

  @Field(() => DoctorSpecialization, { nullable: true })
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(DoctorSpecialization)
  specialty?: DoctorSpecialization;
}

@InputType()
export class DirectoryNameSuggestionsInput extends DirectoryFiltersInput {
  @Field(() => String)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;
}

@InputType()
export class DirectorySearchInput extends DirectoryFiltersInput {
  @Field(() => String, { nullable: true })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(100)
  name?: string;

  @Field(() => Int, { defaultValue: 1 })
  @IsInt()
  @Min(1)
  @Max(1000)
  page: number = 1;

  @Field(() => Int, { defaultValue: 12 })
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 12;

  @Field(() => DirectorySort, { defaultValue: DirectorySort.NAME_ASC })
  @IsEnum(DirectorySort)
  sort: DirectorySort = DirectorySort.NAME_ASC;
}
