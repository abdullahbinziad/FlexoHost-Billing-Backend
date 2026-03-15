import config from '../../../config';
import emailService from '../../email/email.service';

export interface INotificationProvider {
    sendEmail(to: string, subject: string, template: string, context: Record<string, any>): Promise<boolean>;
    sendSms(to: string, message: string): Promise<boolean>;
}

class NotificationStub implements INotificationProvider {
    async sendEmail(to: string, subject: string, template: string, _context: Record<string, any>): Promise<boolean> {
        console.log(`[Notification-Stub-Email] To: ${to} | Subject: ${subject} | Template: ${template}`);
        return false;
    }

    async sendSms(to: string, message: string): Promise<boolean> {
        console.log(`[Notification-Stub-SMS] To: ${to} | Msg: ${message}`);
        return true;
    }
}

class NodemailerNotificationProvider implements INotificationProvider {
    async sendEmail(to: string, subject: string, template: string, context: Record<string, any>): Promise<boolean> {
        return emailService.sendEmailByTemplate(to, subject, template, context);
    }

    async sendSms(_to: string, _message: string): Promise<boolean> {
        console.log('[Notification] SMS not implemented - use stub or external provider');
        return false;
    }
}

const isSmtpConfigured = () =>
    !!(config.email?.smtp?.user && config.email?.smtp?.password);

export const notificationProvider: INotificationProvider = isSmtpConfigured()
    ? new NodemailerNotificationProvider()
    : new NotificationStub();
