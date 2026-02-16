import { Request, Response } from 'express';
import catchAsync from '../../../utils/catchAsync';
import ApiResponse from '../../../utils/apiResponse';
import tldService from './tld.service';

class TLDController {
    createTLD = catchAsync(async (req: Request, res: Response) => {
        const tld = await tldService.createTLD(req.body);
        ApiResponse.created(res, 'TLD created successfully', tld);
    });

    getAllTLDs = catchAsync(async (req: Request, res: Response) => {
        const tlds = await tldService.getAllTLDs(req.query);
        ApiResponse.ok(res, 'TLDs retrieved successfully', tlds);
    });

    getTLD = catchAsync(async (req: Request, res: Response) => {
        const tld = await tldService.getTLDByExtension(req.params.extension);
        ApiResponse.ok(res, 'TLD retrieved successfully', tld);
    });

    getOne = catchAsync(async (req: Request, res: Response) => {
        const tld = await tldService.getTLDById(req.params.id);
        ApiResponse.ok(res, 'TLD retrieved successfully', tld);
    });

    updateTLD = catchAsync(async (req: Request, res: Response) => {
        const tld = await tldService.updateTLD(req.params.id, req.body);
        ApiResponse.ok(res, 'TLD updated successfully', tld);
    });

    deleteTLD = catchAsync(async (req: Request, res: Response) => {
        await tldService.deleteTLD(req.params.id);
        ApiResponse.ok(res, 'TLD deleted successfully');
    });
}

export default new TLDController();
