import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { CryptoService } from './crypto.service';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';
import { MailService } from '../modules/mail/mail.service';

@Global()
@Module({ providers: [PrismaService, CryptoService, AuditService, RedisService, MailService], exports: [PrismaService, CryptoService, AuditService, RedisService, MailService] })
export class CommonModule {}
