import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import ApiResponse from '../../utils/apiResponse';
import domainService from './domain.service';

class DomainController {
    searchDomain = catchAsync(async (req: Request, res: Response) => {
        const { domain } = req.query;
        if (!domain || typeof domain !== 'string') {
            throw new Error('Domain query parameter is required');
        }

        const result = await domainService.searchDomain(domain);
        return ApiResponse.ok(res, 'Domain search result', result);
    });

    registerDomain = catchAsync(async (req: Request, res: Response) => {
        const result = await domainService.registerDomain(req.body);
        return ApiResponse.created(res, 'Domain registration initiated', result);
    });

    renewDomain = catchAsync(async (req: Request, res: Response) => {
        const { domain } = req.params;
        const { duration } = req.body;

        const result = await domainService.renewDomain(domain, duration);
        return ApiResponse.ok(res, 'Domain renewal initiated', result);
    });

    transferDomain = catchAsync(async (req: Request, res: Response) => {
        const result = await domainService.transferDomain(req.body);
        return ApiResponse.ok(res, 'Domain transfer initiated', result);
    });

    getDomainDetails = catchAsync(async (req: Request, res: Response) => {
        const { domain } = req.params;
        const result = await domainService.getDomainDetails(domain);
        return ApiResponse.ok(res, 'Domain details retrieved', result);
    });

    updateNameservers = catchAsync(async (req: Request, res: Response) => {
        const { domain } = req.params;
        const { nameservers } = req.body;

        await domainService.updateNameservers(domain, nameservers);
        return ApiResponse.ok(res, 'Nameservers updated successfully');
    });
}

export default new DomainController();
