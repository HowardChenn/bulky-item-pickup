import { IsISO8601, IsNumber, IsPositive, IsString, Matches, ValidateIf } from 'class-validator';

const timestampWithOffset =
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

export class CreatePickupRequestDto {
  @IsString()
  @Matches(/\S/)
  pickupSuburb: string;

  @IsString()
  @Matches(/\S/)
  dropoffSuburb: string;

  @IsISO8601({ strict: true })
  @Matches(timestampWithOffset)
  windowStart: string;

  @IsISO8601({ strict: true })
  @Matches(timestampWithOffset)
  windowEnd: string;

  @IsNumber()
  @IsPositive()
  widthCm: number;

  @IsNumber()
  @IsPositive()
  heightCm: number;

  @IsNumber()
  @IsPositive()
  depthCm: number;

  @ValidateIf((_body, value) => value !== undefined)
  @IsString()
  @Matches(/\S/)
  photoKey?: string;
}