import { ValidationPipe, type Type } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
  type ValidationArguments,
} from 'class-validator';
import { recoveryError } from '../../../components/auth/password-recovery-error.js';

export class RecoveryRequestDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @ApiProperty({ maxLength: 254 })
  @IsEmail()
  @MaxLength(254)
  memberEmail: string;

  @ApiProperty({
    format: 'uuid',
    description: 'UUID v4; reuse for retries of one send action.',
  })
  @IsUUID('4')
  requestId: string;
}

@ValidatorConstraint({ name: 'recoveryPasswordsMatch', async: false })
class RecoveryPasswordsMatch implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments) {
    return value === (args.object as RecoveryResetDto).newPassword;
  }
}

export class RecoveryResetDto {
  @ApiProperty({ pattern: '^[A-Za-z0-9_-]{43}$' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  token: string;

  @ApiProperty({ minLength: 8, maxLength: 100 })
  @IsString()
  @Length(8, 100)
  newPassword: string;

  @ApiProperty({ minLength: 8, maxLength: 100 })
  @IsString()
  @Length(8, 100)
  @Validate(RecoveryPasswordsMatch)
  confirmPassword: string;
}

export class RecoveryValidationPipe extends ValidationPipe {
  constructor(expectedType: Type) {
    super({
      expectedType,
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: () => recoveryError(400, 'INVALID_REQUEST'),
    });
  }
}
