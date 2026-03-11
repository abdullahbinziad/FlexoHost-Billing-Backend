import { Response } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import catchAsync from '../../utils/catchAsync';
import ApiResponse from '../../utils/apiResponse';
import config from '../../config';

class UploadController {
    upload = catchAsync(async (req: AuthRequest, res: Response) => {
        const file = req.file;
        if (!file) {
            return ApiResponse.badRequest(res, 'No file uploaded');
        }
        const url = `/${config.upload.uploadPath}/${file.filename}`;
        return ApiResponse.ok(res, 'File uploaded', { url, filename: file.originalname });
    });
}

export default new UploadController();
