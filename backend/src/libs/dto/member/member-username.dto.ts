import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength } from 'class-validator';

export class UsernameAvailabilityInput {
  @ApiProperty({
    description: 'Username text without a display-only @ prefix.',
    maxLength: 256,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(256)
  memberNick: string;
}

export class UsernameAvailability {
  @ApiProperty({ enum: ['AVAILABLE', 'TAKEN', 'INVALID'] })
  status: 'AVAILABLE' | 'TAKEN' | 'INVALID';

  @ApiProperty({ description: 'Advisory only; does not reserve the username.' })
  available: boolean;
}
