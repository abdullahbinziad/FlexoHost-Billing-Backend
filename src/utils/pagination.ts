export interface PaginationInput {
    page?: number | string;
    limit?: number | string;
    maxLimit?: number;
}

export interface PaginationResult {
    page: number;
    limit: number;
    skip: number;
}

export const getPagination = ({
    page = 1,
    limit = 10,
    maxLimit = 100,
}: PaginationInput = {}): PaginationResult => {
    const normalizedPage = Number(page) || 1;
    const safePage = normalizedPage < 1 ? 1 : normalizedPage;

    const normalizedLimit = Number(limit) || 10;
    const safeLimit =
        normalizedLimit < 1 ? 10 : Math.min(normalizedLimit, maxLimit);

    const skip = (safePage - 1) * safeLimit;

    return {
        page: safePage,
        limit: safeLimit,
        skip,
    };
};

export type SortOrder = 'asc' | 'desc';

export const buildSort = (
    sortBy?: string,
    sortOrder: SortOrder = 'desc'
): Record<string, 1 | -1> => {
    if (!sortBy) {
        return {};
    }

    return {
        [sortBy]: sortOrder === 'desc' ? -1 : 1,
    };
};

