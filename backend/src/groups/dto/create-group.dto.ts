import { Currency, GroupType } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString, Length } from 'class-validator';

export const GROUP_CURRENCIES = [Currency.GNF, Currency.XOF] as const;

export class CreateGroupDto {
  @IsEnum(GroupType)
  type!: GroupType;

  @IsString()
  @Length(2, 100)
  name!: string;

  /** Par défaut : GNF pour un créateur guinéen, XOF pour le Sénégal et la Côte d'Ivoire. */
  @IsOptional()
  @IsIn(GROUP_CURRENCIES)
  currency?: (typeof GROUP_CURRENCIES)[number];
}
