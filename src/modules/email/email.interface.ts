export interface IEmailOptions {
    to: string;
    subject: string;
    text?: string;
    html: string;
}

export interface IEmailTemplate {
    subject: string;
    html: string;
}
