import { IsString, Matches } from 'class-validator';

export class ClaimPickupRequestDto {
  @IsString()
  @Matches(/\S/)
  driverId: string;
}