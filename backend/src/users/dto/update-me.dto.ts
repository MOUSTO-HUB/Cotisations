import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export const SUPPORTED_LANGUAGES = ['fr', 'en'] as const;

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName?: string;

  @IsOptional()
  @IsIn(SUPPORTED_LANGUAGES)
  language?: (typeof SUPPORTED_LANGUAGES)[number];

  /** Numéro Mobile Money, normalisé comme un numéro de téléphone. */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  mobileMoneyNumber?: string;
}
