const COMPANY_NAME = 'FlexoHost'; // You can change this or pull from config
const PRIMARY_COLOR = '#4F46E5'; // Indigo 600
const BACKGROUND_COLOR = '#F3F4F6'; // Gray 100
const TEXT_COLOR = '#1F2937'; // Gray 800
const FOOTER_COLOR = '#6B7280'; // Gray 500

const getLayout = (title: string, content: string) => {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1.6; color: ${TEXT_COLOR}; background-color: ${BACKGROUND_COLOR}; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #ffffff; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background-color: #ffffff; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); }
        .button { display: inline-block; padding: 12px 24px; background-color: ${PRIMARY_COLOR}; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 20px; }
        .footer { text-align: center; margin-top: 20px; color: ${FOOTER_COLOR}; font-size: 12px; }
        h1 { color: #111827; font-size: 24px; font-weight: 700; margin-bottom: 20px; }
        p { margin-bottom: 16px; font-size: 16px; }
        .logo { font-size: 24px; font-weight: 800; color: ${PRIMARY_COLOR}; text-decoration: none; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <a href="#" class="logo">${COMPANY_NAME}</a>
        </div>
        <div class="content">
            ${content}
        </div>
        <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ${COMPANY_NAME}. All rights reserved.</p>
            <p>123 Hosting Street, Cloud City, Server State 12345</p>
        </div>
    </div>
</body>
</html>
    `;
};

export const getWelcomeEmailTemplate = (name: string) => {
    const title = 'Welcome to ' + COMPANY_NAME;
    const content = `
        <h1>Welcome, ${name}!</h1>
        <p>We are thrilled to have you on board. content to ${COMPANY_NAME}, your premium hosting solution.</p>
        <p>Your account has been successfully created. You can now access your dashboard to manage your services, view invoices, and update your profile.</p>
        <p>If you have any questions, our support team is available 24/7 to assist you.</p>
        <div style="text-align: center;">
            <a href="#" class="button">Go to Dashboard</a>
        </div>
    `;
    return {
        subject: title,
        html: getLayout(title, content)
    };
};

export const getVerificationEmailTemplate = (name: string, verifyUrl: string) => {
    const title = 'Verify Your Email Address';
    const content = `
        <h1>Verify Your Email</h1>
        <p>Hi ${name},</p>
        <p>Please verify your email address to secure your account and access all features of ${COMPANY_NAME}.</p>
        <p>Click the button below to verify your email:</p>
        <div style="text-align: center;">
            <a href="${verifyUrl}" class="button">Verify Email Address</a>
        </div>
        <p style="margin-top: 20px; font-size: 14px; color: #6B7280;">If the button doesn't work, you can scan copy and paste the following link into your browser:</p>
        <p style="font-size: 14px; color: ${PRIMARY_COLOR}; word-break: break-all;">${verifyUrl}</p>
        <p>If you didn't create an account with us, you can safely ignore this email.</p>
    `;
    return {
        subject: title,
        html: getLayout(title, content)
    };
};
