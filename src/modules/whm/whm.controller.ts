import { Request, Response } from 'express';
import * as whmService from './whm.service';
import catchAsync from '../../utils/catchAsync';
import ApiResponse from '../../utils/apiResponse';

export const createCpanel = catchAsync(async (req: Request, res: Response) => {
    const result = await whmService.createAccount(req.body);
    ApiResponse.created(res, 'cPanel account created successfully', result);
});

export const suspend = catchAsync(async (req: Request, res: Response) => {
    await whmService.suspendAccount(req.params.username, req.body.reason);
    ApiResponse.ok(res, 'Account suspended successfully');
});

export const unsuspend = catchAsync(async (req: Request, res: Response) => {
    await whmService.unsuspendAccount(req.params.username);
    ApiResponse.ok(res, 'Account unsuspended successfully');
});

export const terminate = catchAsync(async (req: Request, res: Response) => {
    await whmService.terminateAccount(req.params.username);
    ApiResponse.ok(res, 'Account terminated successfully');
});

export const changePassword = catchAsync(async (req: Request, res: Response) => {
    await whmService.changePassword(req.params.username, req.body.password);
    ApiResponse.ok(res, 'Password changed successfully');
});

export const getAccountSummary = catchAsync(async (req: Request, res: Response) => {
    const result = await whmService.accountSummary(req.params.username);
    ApiResponse.ok(res, 'Account summary fetched successfully', result);
});

export const changePackage = catchAsync(async (req: Request, res: Response) => {
    await whmService.changePackage(req.params.username, req.body.plan);
    ApiResponse.ok(res, 'Package changed successfully');
});

export const verifyUser = catchAsync(async (req: Request, res: Response) => {
    const result = await whmService.verifyUsername(req.params.username);
    ApiResponse.ok(res, 'Username verification result', result);
});
