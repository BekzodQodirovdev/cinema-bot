import { ConfigService } from '@nestjs/config';

export const getTelegramConfig = (configService: ConfigService) => {
  return {
    botToken: configService.get<string>('TELEGRAM_BOT_TOKEN'),
    superAdminId: parseInt(
      configService.get<string>('SUPER_ADMIN_ID') ??
        (() => {
          throw new Error('SUPER_ADMIN_ID is not defined');
        })(),
    ),
  };
};
