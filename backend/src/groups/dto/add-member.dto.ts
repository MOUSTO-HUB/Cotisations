import { Role } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class AddMemberDto {
  @IsString()
  @MaxLength(30)
  phone!: string;

  /** Obligatoire si la personne n'a pas encore de compte (membre sans smartphone). */
  @IsOptional()
  @IsString()
  @Length(2, 100)
  fullName?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  /** Catégorie libre : résident, diaspora, retraité… */
  @IsOptional()
  @IsString()
  @Length(1, 50)
  category?: string;
}
