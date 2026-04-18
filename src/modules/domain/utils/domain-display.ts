/**
 * Resolve FQDN for UI and registrar APIs from DomainServiceDetails and/or order item snapshot.
 * Single source of truth to avoid duplicated fallback logic across list/detail endpoints.
 */
export function normalizeDomainFqdn(value: string | undefined | null): string {
    return String(value || '')
        .trim()
        .toLowerCase();
}

/**
 * Best-effort domain label from persisted details, then order configSnapshot, then nameSnapshot.
 */
export function resolveDomainFqdnFromDetailsAndOrderItem(
    details: { domainName?: string } | null | undefined,
    orderItem: { configSnapshot?: Record<string, unknown>; nameSnapshot?: string } | null | undefined
): string {
    const fromDetails = normalizeDomainFqdn(details?.domainName);
    if (fromDetails) return fromDetails;

    const cfg = (orderItem?.configSnapshot || {}) as Record<string, unknown>;
    const fromConfig = normalizeDomainFqdn(
        (cfg.domainName as string) || (cfg.domain as string) || (cfg.primaryDomain as string)
    );
    if (fromConfig) return fromConfig;

    const snap = String(orderItem?.nameSnapshot || '').trim();
    if (snap && /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(snap)) {
        return snap.toLowerCase();
    }

    return '';
}
