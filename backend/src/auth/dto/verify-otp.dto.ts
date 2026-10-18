import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  @MaxLength(30)
  phone!: string;

  @Matches(/^\d{6}$/, { message: 'Le code doit contenir 6 chiffres.' })
  code!: string;

  /** Obligatoire à la première connexion (création du compte). */
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  device?: string;
}
