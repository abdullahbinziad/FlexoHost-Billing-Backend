declare module 'clamscan' {
    interface ClamScanInstance {
        isInfected(path: string): Promise<{ file: string; isInfected: boolean; viruses: string[] }>;
    }
    interface NodeClam {
        init(options?: object): Promise<ClamScanInstance>;
    }
    const NodeClam: new () => NodeClam;
    export default NodeClam;
}
