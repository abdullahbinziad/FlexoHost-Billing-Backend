import dotenv from 'dotenv';
import path from 'path';
import emailService from '../modules/email/email.service';

// Load env vars explicitly since we aren't running through server.ts
dotenv.config({ path: path.join(process.cwd(), '.env') });

const testEmail = async () => {
    const targetEmail = process.argv[2];

    if (!targetEmail) {
        console.error('Please provide an email address as an argument.');
        console.error('Usage: npx ts-node src/scripts/test_email.ts <your-email>');
        process.exit(1);
    }

    console.log(`Attempting to send test email to: ${targetEmail}`);
    console.log('Using SMTP Host:', process.env.SMTP_HOST);
    console.log('Using SMTP User:', process.env.SMTP_USER);

    try {
        await emailService.sendWelcomeEmail(targetEmail, 'Test User');
        console.log('✅ Success! Test email sent successfully.');
        console.log('Check your inbox (and spam folder) for a "Welcome to FlexoHost" email.');
    } catch (error) {
        console.error('❌ Failed to send email:', error);
    } finally {
        // Force exit because mongoose/email connection might keep process alive
        process.exit(0);
    }
};

testEmail();
