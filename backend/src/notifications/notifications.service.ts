import { Injectable, Logger } from '@nestjs/common';
import { SmsSender } from '../auth/sms/sms-sender';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsSender,
  ) {}

  /**
   * Prévient par SMS tous les membres actifs d'un groupe. Un échec d'envoi
   * est journalisé mais n'annule jamais l'action qui l'a déclenché.
   * Les notifications push et WhatsApp viendront avec l'application mobile.
   */
  async notifyActiveMembers(
    groupId: string,
    message: string,
    options: { excludeUserIds?: string[] } = {},
  ): Promise<number> {
    const memberships = await this.prisma.membership.findMany({
      where: {
        groupId,
        status: 'ACTIVE',
        userId: { notIn: options.excludeUserIds ?? [] },
      },
      include: { user: true },
    });
    let sent = 0;
    for (const m of memberships) {
      try {
        await this.sms.send(m.user.phone, message);
        sent++;
      } catch (error) {
        this.logger.warn(
          `SMS non envoyé à ${m.user.phone} : ${(error as Error).message}`,
        );
      }
    }
    return sent;
  }
}
