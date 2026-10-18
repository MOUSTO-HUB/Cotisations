import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Route accessible sans être connecté. Toutes les autres exigent une session. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
