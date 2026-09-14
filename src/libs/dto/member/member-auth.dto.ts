import { Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsEnum,
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  IsTimeZone,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  DoctorSpecialization,
  MemberType,
} from '../../enum/member.enum.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const email = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class LoginDto {
  @Transform(email)
  @IsEmail()
  @MaxLength(254)
  memberEmail: string;

  @IsString()
  @Length(1, 128)
  memberPassword: string;
}

export class SignupDto {
  @Transform(email)
  @IsEmail()
  @MaxLength(254)
  memberEmail: string;

  @IsString()
  @Length(12, 128)
  memberPassword: string;

  @Transform(trim)
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  memberPhone: string;

  @Transform(trim)
  @IsString()
  @Length(2, 40)
  memberNick: string;

  @IsIn([MemberType.USER, MemberType.CLINIC, MemberType.DOCTOR])
  memberType: MemberType = MemberType.USER;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  memberFullName?: string;

  @ValidateIf(
    (data: SignupDto) =>
      data.memberType === MemberType.CLINIC || data.clinicName !== undefined,
  )
  @Transform(trim)
  @IsString()
  @Length(1, 150)
  clinicName?: string;

  @IsOptional()
  @IsTimeZone()
  clinicTimezone?: string;

  @ValidateIf(
    (data: SignupDto) =>
      data.memberType === MemberType.DOCTOR || data.clinicId !== undefined,
  )
  @IsMongoId()
  clinicId?: string;

  @ValidateIf(
    (data: SignupDto) =>
      data.memberType === MemberType.DOCTOR ||
      data.doctorSpecializations !== undefined,
  )
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsEnum(DoctorSpecialization, { each: true })
  doctorSpecializations?: DoctorSpecialization[];

  @ValidateIf(
    (data: SignupDto) =>
      data.memberType === MemberType.DOCTOR ||
      data.professionalLicenseNumber !== undefined,
  )
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  professionalLicenseNumber?: string;
}

export class RefreshDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  refreshToken: string;
}
