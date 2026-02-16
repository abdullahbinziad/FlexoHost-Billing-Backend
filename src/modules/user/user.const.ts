export const USER_ROLES = {
    SUPERADMIN: 'superadmin',
    ADMIN: 'admin',
    STAFF: 'staff',
    CLIENT: 'client',
    USER: 'user',
    MODERATOR: 'moderator',
} as const;

export const USER_STATUS = {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    SUSPENDED: 'suspended',
} as const;

export const PASSWORD_RESET_EXPIRES = 10 * 60 * 1000; // 10 minutes

export const EMAIL_VERIFICATION_EXPIRES = 24 * 60 * 60 * 1000; // 24 hours

export const MAX_LOGIN_ATTEMPTS = 5;

export const LOCK_TIME = 2 * 60 * 60 * 1000; // 2 hours
