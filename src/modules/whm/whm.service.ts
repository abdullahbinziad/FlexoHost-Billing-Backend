import { whmRequest } from './whm.client';

export interface CreateAccountPayload {
    username: string;
    domain: string;
    plan: string;
    email: string;
}

/* Create cPanel Account */
export async function createAccount(payload: CreateAccountPayload) {
    return whmRequest('createacct', {
        username: payload.username,
        domain: payload.domain,
        plan: payload.plan,
        contactemail: payload.email,
        spf: 1,
        dkim: 1,
        spamassassin: 1,
        hasshell: 0,
        ip: 'n'
    });
}

/* Suspend Account */
export async function suspendAccount(username: string, reason: string = 'Overdue Invoice') {
    return whmRequest('suspendacct', {
        user: username,
        reason
    });
}

/* Unsuspend Account */
export async function unsuspendAccount(username: string) {
    return whmRequest('unsuspendacct', {
        user: username
    });
}

/* Terminate Account */
export async function terminateAccount(username: string) {
    return whmRequest('removeacct', {
        user: username
    });
}

/* Change Password */
export async function changePassword(username: string, password: string) {
    return whmRequest('passwd', {
        user: username,
        password: password
    });
}

/* Change Package */
export async function changePackage(username: string, plan: string) {
    return whmRequest('changepackage', {
        user: username,
        pkg: plan
    });
}

/* Validate Username */
export async function verifyUsername(username: string) {
    return whmRequest('verify_new_username', {
        user: username
    });
}

/* Account Summary */
export async function accountSummary(username: string) {
    return whmRequest('accountsummary', {
        user: username
    });
}
