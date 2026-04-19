/**
 * Optional ClamAV virus scanning for uploaded files.
 * Set ENABLE_CLAMAV_SCAN=true and install ClamAV (brew install clamav / apt install clamav) to enable.
 * When disabled, scans are skipped (no-op).
 */
import fs from 'fs';
import path from 'path';
import config from '../config';

let clamscanInstance: { isInfected: (p: string) => Promise<{ file: string; isInfected: boolean; viruses: string[] }> } | null | undefined = undefined;

async function getClamScan(): Promise<{ isInfected: (p: string) => Promise<{ file: string; isInfected: boolean; viruses: string[] }> } | null> {
    if (!(config as any).upload?.enableClamavScan) return null;
    if (clamscanInstance !== undefined) return clamscanInstance;
    try {
        const NodeClam = (await import('clamscan')).default;
        const clamscan = await new NodeClam().init({
            clamdscan: {
                socket: null,
                host: config.upload.clamavHost,
                port: config.upload.clamavPort,
                timeout: 60000,
                localFallback: true,
            },
            preference: 'clamdscan',
        });
        clamscanInstance = clamscan;
        return clamscan;
    } catch (err) {
        if (config.env === 'development') {
            console.warn('[VirusScan] ClamAV not available. Install with: brew install clamav (macOS) or apt install clamav clamav-daemon (Linux). Set ENABLE_CLAMAV_SCAN=true to enable.');
        }
        clamscanInstance = null;
        return null;
    }
}

export interface ScanResult {
    ok: boolean;
    infected: boolean;
    path?: string;
    message?: string;
}

/**
 * Scan a file for malware. Returns { ok: true, infected: false } if clean or scan skipped.
 * Returns { ok: false, infected: true, message } if virus found.
 */
export async function scanFile(filePath: string): Promise<ScanResult> {
    if (!filePath || !fs.existsSync(filePath)) {
        return { ok: false, infected: false, message: 'File not found' };
    }
    const absPath = path.resolve(filePath);
    const clam = await getClamScan();
    if (!clam) {
        return { ok: true, infected: false };
    }
    try {
        const result = await clam.isInfected(absPath);
        const { isInfected, viruses } = result;
        if (isInfected && viruses && viruses.length > 0) {
            return {
                ok: false,
                infected: true,
                path: absPath,
                message: `Malware detected: ${viruses.join(', ')}`,
            };
        }
        return { ok: true, infected: false };
    } catch (err: any) {
        console.error('[VirusScan] Scan error:', err?.message);
        return { ok: false, infected: false, message: err?.message || 'Scan failed' };
    }
}

/**
 * Scan multiple files. If any is infected, returns the first infected result.
 */
export async function scanFiles(filePaths: string[]): Promise<ScanResult> {
    for (const p of filePaths) {
        const result = await scanFile(p);
        if (!result.ok || result.infected) return result;
    }
    return { ok: true, infected: false };
}
