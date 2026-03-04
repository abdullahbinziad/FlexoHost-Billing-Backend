export interface INotificationProvider {
    sendEmail(to: string, subject: string, template: string, context: Record<string, any>): Promise<boolean>;
    sendSms(to: string, message: string): Promise<boolean>;
}

class NotificationStub implements INotificationProvider {
    async sendEmail(to: string, subject: string, template: string, _context: Record<string, any>): Promise<boolean> {
        console.log(`[Notification-Stub-Email] To: ${to} | Subject: ${subject} | Template: ${template}`);
        // Simulate networking delay
        return true;
    }

    async sendSms(to: string, message: string): Promise<boolean> {
        console.log(`[Notification-Stub-SMS] To: ${to} | Msg: ${message}`);
        return true;
    }
}

export const notificationProvider = new NotificationStub();
