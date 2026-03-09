import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationChain } from 'express-validator';
import ApiError from '../utils/apiError';

export const validate = (validations: ValidationChain[]) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            void res;
            // Run all validations
            await Promise.all(validations.map((validation) => validation.run(req)));

            const errors = validationResult(req);

            if (errors.isEmpty()) {
                return next();
            }

            // Format errors
            const extractedErrors: any[] = [];
            errors.array().map((err: any) =>
                extractedErrors.push({
                    field: err.path || err.param,
                    message: err.msg
                })
            );

            return next(
                ApiError.validationError(
                    `Validation failed: ${extractedErrors.map(e => e.message).join(', ')}`
                )
            );
        } catch (err) {
            return next(err);
        }
    };
};
