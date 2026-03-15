import { Router } from 'express';
import { roleController } from './role.controller';
import { protect, restrictTo } from '../../middlewares/auth';
import { requirePermission } from '../../middlewares/requirePermission';
import { validate } from '../../middlewares/validate';
import {
    createRoleValidation,
    updateRoleValidation,
    getRoleByIdValidation,
    importRoleValidation,
    listRolesValidation,
    compareRolesValidation,
} from './role.validation';

const router = Router();

const rolesAccess = ['admin', 'superadmin', 'staff'];

router.use(protect);
router.use(restrictTo(...rolesAccess));

router.get('/', requirePermission('roles:list'), validate(listRolesValidation), roleController.getAll);
router.get('/permissions', requirePermission('roles:list'), roleController.getPermissions);
router.get('/presets', requirePermission('roles:list'), roleController.getPresets);
router.get('/compare', requirePermission('roles:list'), validate(compareRolesValidation), roleController.compare);

router.post('/', requirePermission('roles:create'), validate(createRoleValidation), roleController.create);
router.post('/import', requirePermission('roles:create'), validate(importRoleValidation), roleController.importRole);

router.get('/:id', requirePermission('roles:read'), validate(getRoleByIdValidation), roleController.getById);
router.get('/:id/export', requirePermission('roles:read'), validate(getRoleByIdValidation), roleController.exportRole);

router.patch('/:id', requirePermission('roles:update'), validate(updateRoleValidation), roleController.update);
router.patch('/:id/archive', requirePermission('roles:update'), validate(getRoleByIdValidation), roleController.archive);
router.patch('/:id/restore', requirePermission('roles:update'), validate(getRoleByIdValidation), roleController.restore);

router.post('/:id/duplicate', requirePermission('roles:create'), validate(getRoleByIdValidation), roleController.duplicate);

router.delete('/:id', requirePermission('roles:delete'), validate(getRoleByIdValidation), roleController.delete);

export default router;
