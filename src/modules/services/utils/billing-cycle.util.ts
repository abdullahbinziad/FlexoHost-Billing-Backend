import { BillingCycle } from '../types/enums';

export function addBillingCycleToDate(date: Date, cycle: BillingCycle): Date {
    const next = new Date(date);
    switch (cycle) {
        case BillingCycle.MONTHLY:
            next.setMonth(next.getMonth() + 1);
            break;
        case BillingCycle.QUARTERLY:
            next.setMonth(next.getMonth() + 3);
            break;
        case BillingCycle.SEMIANNUALLY:
            next.setMonth(next.getMonth() + 6);
            break;
        case BillingCycle.ANNUALLY:
            next.setFullYear(next.getFullYear() + 1);
            break;
        case BillingCycle.BIENNIALLY:
            next.setFullYear(next.getFullYear() + 2);
            break;
        case BillingCycle.TRIENNIALLY:
            next.setFullYear(next.getFullYear() + 3);
            break;
        case BillingCycle.ONE_TIME:
        default:
            break;
    }
    return next;
}

export function computeInitialNextDueDate(startDate: Date, cycle: BillingCycle): Date {
    return addBillingCycleToDate(startDate, cycle);
}
