import nodemailer from 'nodemailer';
import config from '../../config';
import logger from '../../utils/logger';
import { IEmailOptions } from './email.interface';
import { getWelcomeEmailTemplate, getVerificationEmailTemplate } from './email.templates';

class EmailService {
    private transporter: nodemailer.Transporter;

    constructor() {
        this.transporter = nodemailer.createTransport({
            host: config.email.smtp.host,
            port: config.email.smtp.port,
            secure: config.email.smtp.port === 465, // true for 465, false for other ports
            auth: {
                user: config.email.smtp.user,
                pass: config.email.smtp.password
            }
        });

        if (config.env !== 'test') {
            this.transporter
                .verify()
                .then(() => logger.info('Connected to email server'))
                .catch((err) => logger.warn('Unable to connect to email server. Make sure you have configured the SMTP options in .env', err));
        }
    }

    /**
     * Send an email
     * @param options Email options
     * @returns Promise<void>
     */
    async sendEmail(options: IEmailOptions): Promise<void> {
        const msg = {
            from: config.email.from,
            to: options.to,
            subject: options.subject,
            html: options.html,
            text: options.text
        };
        await this.transporter.sendMail(msg);
    }

    /**
     * Send welcome email
     * @param to Recipient email
     * @param name Recipient name
     */
    async sendWelcomeEmail(to: string, name: string): Promise<void> {
        const template = getWelcomeEmailTemplate(name);
        await this.sendEmail({
            to,
            subject: template.subject,
            html: template.html
        });
    }

    /**
     * Send verification email
     * @param to Recipient email
     * @param name Recipient name
     * @param token Verification token
     */
    async sendVerificationEmail(to: string, name: string, token: string): Promise<void> {
        const verifyUrl = `${config.cors.origin}/verify-email?token=${token}`;
        const template = getVerificationEmailTemplate(name, verifyUrl);
        await this.sendEmail({
            to,
            subject: template.subject,
            html: template.html
        });
    }
}

export default new EmailService();
