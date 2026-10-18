import { IsString, MaxLength } from 'class-validator';

export class RequestOtpDto {
  /** Numéro avec ou sans indicatif (ex. "620 00 00 00" ou "+224620000000"). */
  @IsString()
  @MaxLength(30)
  phone!: string;
}
