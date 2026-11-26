import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** SMTP email. When SMTP_HOST is unset (development), messages are logged as "not sent" — never reported as delivered. */
@Injectable()
export class MailService {
  private log = new Logger('Mail');
  private transport: Transporter | null = process.env.SMTP_HOST
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT ?? 587), secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      })
    : null;

  get configured() { return !!this.transport; }

  /** Sends a simple branded email. `paragraphs` are escaped; `action` renders a button. Returns whether it was sent. */
  async send(to: string, subject: string, paragraphs: string[], action?: { label: string; url: string }, attachments?: { filename: string; content: Buffer }[]): Promise<boolean> {
    if (!this.transport) { this.log.warn(`SMTP not configured — email "${subject}" to ${to.replace(/(.).*@/, '$1***@')} not sent`); return false; }
    const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;color:#111">
      <p style="font-weight:700;font-size:18px">AppGrowth AI</p>${paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}
      ${action ? `<p><a href="${esc(action.url)}" style="background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">${esc(action.label)}</a></p>` : ''}
      <p style="color:#666;font-size:12px">Nous Healthcare Solutions · AppGrowth AI</p></div>`;
    try {
      await this.transport.sendMail({ from: process.env.SMTP_FROM ?? 'AppGrowth AI <no-reply@noushealthcare.online>', to, subject, html,
        text: [...paragraphs, action ? `${action.label}: ${action.url}` : ''].join('\n\n'), attachments });
      return true;
    } catch (e) {
      this.log.error(`send failed: ${(e as Error).message}`);
      return false;
    }
  }
}
