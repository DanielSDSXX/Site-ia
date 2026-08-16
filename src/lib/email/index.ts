import { z } from 'zod';
import { env } from '@/lib/env';

/**
 * Interface para envio de emails.
 * Implementações concretas lidam com diferentes provedores.
 */
export interface EmailProvider {
  send(options: SendEmailOptions): Promise<void>;
  sendTemplate(options: SendTemplateOptions): Promise<void>;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface SendTemplateOptions {
  to: string;
  template: 'invite' | 'welcome' | 'password-reset';
  variables: Record<string, string | number | boolean>;
}

let providerCache: EmailProvider | null = null;

/**
 * Resolve o provedor de email configurado.
 *
 * Provedores disponíveis:
 *   - none: modo desenvolvimento (escreve no console)
 *   - resend: API do Resend
 *   - sendgrid: API do SendGrid
 *   - smtp: servidor SMTP genérico
 */
export function emailProvider(): EmailProvider {
  if (providerCache) return providerCache;

  const e = env();

  switch (e.EMAIL_PROVIDER) {
    case 'resend':
      providerCache = new ResendEmailProvider();
      break;
    case 'sendgrid':
      providerCache = new SendgridEmailProvider();
      break;
    case 'smtp':
      providerCache = new SMTPEmailProvider();
      break;
    default:
      providerCache = new DemoEmailProvider();
  }

  return providerCache;
}

/**
 * Provedor de email de demonstração (apenas console.log).
 * Usado quando EMAIL_PROVIDER=none ou não configurado.
 */
export class DemoEmailProvider implements EmailProvider {
  async send(options: SendEmailOptions): Promise<void> {
    console.log(`📧 [DEMO EMAIL] → ${options.to}`);
    console.log(`   Subject: ${options.subject}`);
    console.log(`   Body:\n${options.html}\n`);
  }

  async sendTemplate(options: SendTemplateOptions): Promise<void> {
    console.log(`📧 [DEMO EMAIL] → ${options.to}`);
    console.log(`   Template: ${options.template}`);
    console.log(`   Variables:`, options.variables, '\n');
  }
}

/**
 * Provedor de email Resend (https://resend.com).
 * Requer RESEND_API_KEY configurada.
 */
export class ResendEmailProvider implements EmailProvider {
  private apiKey: string;
  private fromEmail: string;
  private fromName: string;

  constructor() {
    const e = env();
    this.apiKey = e.RESEND_API_KEY || '';
    this.fromEmail = e.EMAIL_FROM;
    this.fromName = e.EMAIL_FROM_NAME;

    if (!this.apiKey) {
      throw new Error('RESEND_API_KEY não está configurada');
    }
  }

  async send(options: SendEmailOptions): Promise<void> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        from: `${this.fromName} <${this.fromEmail}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || options.html.replace(/<[^>]*>/g, ''),
        reply_to: options.replyTo,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Falha ao enviar email via Resend: ${error.message}`);
    }
  }

  async sendTemplate(options: SendTemplateOptions): Promise<void> {
    const templates: Record<string, (vars: Record<string, any>) => { subject: string; html: string }> = {
      invite: (v) => ({
        subject: `${v.senderName} te convidou para LegalMind AI`,
        html: this.renderInviteTemplate(v),
      }),
      welcome: (v) => ({
        subject: 'Bem-vindo ao LegalMind AI',
        html: this.renderWelcomeTemplate(v),
      }),
      'password-reset': (v) => ({
        subject: 'Resetar sua senha no LegalMind AI',
        html: this.renderPasswordResetTemplate(v),
      }),
    };

    const template = templates[options.template];
    if (!template) throw new Error(`Template ${options.template} não encontrado`);

    const { subject, html } = template(options.variables);
    await this.send({
      to: options.to,
      subject,
      html,
    });
  }

  private renderInviteTemplate(v: Record<string, any>): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.5; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f9fafb; }
            .card { background: white; border-radius: 8px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
            .header { text-align: center; margin-bottom: 30px; }
            .header h1 { margin: 0; color: #1f2937; font-size: 24px; }
            .content { margin: 20px 0; color: #4b5563; }
            .button { display: inline-block; margin-top: 20px; padding: 12px 24px; background: #0066cc; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; }
            .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #9ca3af; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="card">
              <div class="header">
                <h1>Você foi convidado!</h1>
              </div>
              <div class="content">
                <p><strong>${v.senderName}</strong> te convidou para se juntar à organização <strong>${v.organizationName}</strong> no <strong>LegalMind AI</strong> como <strong>${v.role}</strong>.</p>
                <p>Clique no botão abaixo para aceitar o convite:</p>
              </div>
              <a href="${v.inviteLink}" class="button">Aceitar Convite</a>
              <div class="footer">
                <p>Se não reconhece este convite, ignore este email.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private renderWelcomeTemplate(v: Record<string, any>): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.5; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .card { background: white; border-radius: 8px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="card">
              <h1>Bem-vindo, ${v.userName}!</h1>
              <p>Sua conta no LegalMind AI foi criada com sucesso.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private renderPasswordResetTemplate(v: Record<string, any>): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.5; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .card { background: white; border-radius: 8px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="card">
              <h1>Resetar Senha</h1>
              <p>Clique no link abaixo para resetar sua senha:</p>
              <a href="${v.resetLink}">Resetar Senha</a>
            </div>
          </div>
        </body>
      </html>
    `;
  }
}

/**
 * Provedor de email SendGrid.
 * Requer SENDGRID_API_KEY configurada.
 */
export class SendgridEmailProvider implements EmailProvider {
  private apiKey: string;
  private fromEmail: string;
  private fromName: string;

  constructor() {
    const e = env();
    this.apiKey = e.SENDGRID_API_KEY || '';
    this.fromEmail = e.EMAIL_FROM;
    this.fromName = e.EMAIL_FROM_NAME;

    if (!this.apiKey) {
      throw new Error('SENDGRID_API_KEY não está configurada');
    }
  }

  async send(options: SendEmailOptions): Promise<void> {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: options.to }],
          },
        ],
        from: { email: this.fromEmail, name: this.fromName },
        subject: options.subject,
        content: [{ type: 'text/html', value: options.html }],
        reply_to: options.replyTo ? { email: options.replyTo } : undefined,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Falha ao enviar email via SendGrid: ${error}`);
    }
  }

  async sendTemplate(options: SendTemplateOptions): Promise<void> {
    // SendGrid tem sistema de templates próprio
    // Por enquanto, fallback para send()
    throw new Error('SendGrid templates não implementado ainda');
  }
}

/**
 * Provedor de email SMTP genérico.
 * Requer configuração de servidor SMTP.
 */
export class SMTPEmailProvider implements EmailProvider {
  async send(options: SendEmailOptions): Promise<void> {
    throw new Error('SMTP não implementado ainda. Use resend ou sendgrid.');
  }

  async sendTemplate(options: SendTemplateOptions): Promise<void> {
    throw new Error('SMTP não implementado ainda. Use resend ou sendgrid.');
  }
}

/** Para testes: injeta provedor alternativo. */
export function setEmailProvider(provider: EmailProvider) {
  providerCache = provider;
}

/** Para testes: limpa cache. */
export function resetEmailProvider() {
  providerCache = null;
}
