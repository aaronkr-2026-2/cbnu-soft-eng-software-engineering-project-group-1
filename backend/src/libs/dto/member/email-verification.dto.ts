import { ValidationPipe, type Type } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { verificationError } from '../../../components/auth/email-verification-error.js';
export class EmailVerificationRequestDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @ApiProperty({ example: 'user@example.com', maxLength: 254 })
  @IsEmail()
  @MaxLength(254)
  memberEmail: string;

  @ApiProperty({
    format: 'uuid',
    description: 'UUID v4; reuse only for retries of one send action.',
  })
  @IsUUID('4')
  requestId: string;
}
export class EmailVerificationVerifyDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @ApiProperty({ example: 'user@example.com', maxLength: 254 })
  @IsEmail()
  @MaxLength(254)
  memberEmail: string;

  @ApiProperty({
    pattern: '^[A-Za-z0-9_-]{43}$',
    description: 'Opaque identity returned by request.',
  })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  challengeId: string;

  @ApiProperty({ example: '000123', pattern: '^[0-9]{6}$' })
  @IsString()
  @Matches(/^[0-9]{6}$/)
  code: string;
}
// Controllers use unknown metadata so the global pipe defers to this scoped
// pipe; expectedType retains strict DTO validation and the verification markers.
export class VerificationValidationPipe extends ValidationPipe {
  constructor(expectedType: Type, signup = false) {
    super({
      expectedType,
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) =>
        signup &&
        errors.length === 1 &&
        errors[0].property === 'emailVerificationToken' &&
        errors[0].value === undefined
          ? verificationError(400, 'EMAIL_VERIFICATION_REQUIRED')
          : verificationError(400, 'INVALID_REQUEST'),
    });
  }
}
