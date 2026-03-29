import { ALL_PERMISSION_IDS } from '../../modules/role/permission.const';

export const defaultRoles = [
    {
        name: 'Super Admin',
        slug: 'super_admin',
        permissions: [...ALL_PERMISSION_IDS],
        description: 'Full system access. Can create/delete superadmin users.',
        isSystem: true,
        hasFullAccess: true,
    },
    {
        name: 'Admin',
        slug: 'admin',
        permissions: [] as string[],
        description: 'Full system access except creating/deleting superadmin.',
        isSystem: true,
        hasFullAccess: true,
    },
    {
        name: 'Staff',
        slug: 'staff',
        permissions: ALL_PERMISSION_IDS.filter(
            (p) => !p.startsWith('roles:')
        ),
        description:
            'Default staff role with all permissions except role management.',
        isSystem: true,
        hasFullAccess: false,
    },
];
