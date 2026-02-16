import httpCall from '../utils/http.util';
import paymentInitDataProcess from '../utils/payment-process.util';
import { IPaymentGateway, IPaymentInitData } from '../payment.interface';

class SslCommerzPayment implements IPaymentGateway {
    private store_id: string;
    private store_passwd: string;
    private baseURL: string;
    private initURL: string;
    private validationURL: string;
    private refundURL: string;
    private refundQueryURL: string;
    private transactionQueryBySessionIdURL: string;
    private transactionQueryByTransactionIdURL: string;

    name = 'SslCommerz';

    constructor(store_id: string, store_passwd: string, live: boolean = false) {
        this.store_id = store_id;
        this.store_passwd = store_passwd;
        this.baseURL = `https://${live ? 'securepay' : 'sandbox'}.sslcommerz.com`;
        this.initURL = this.baseURL + '/gwprocess/v4/api.php';
        this.validationURL = this.baseURL + '/validator/api/validationserverAPI.php?';
        this.refundURL = this.baseURL + '/validator/api/merchantTransIDvalidationAPI.php?';
        this.refundQueryURL = this.baseURL + '/validator/api/merchantTransIDvalidationAPI.php?';
        this.transactionQueryBySessionIdURL = this.baseURL + '/validator/api/merchantTransIDvalidationAPI.php?';
        this.transactionQueryByTransactionIdURL = this.baseURL + '/validator/api/merchantTransIDvalidationAPI.php?';
    }

    async init(data: IPaymentInitData & Record<string, any>, url: string | false = false, method: string = "POST"): Promise<any> {
        data.store_id = this.store_id;
        data.store_passwd = this.store_passwd;

        // Ensure required fields for the processor
        return httpCall({
            url: url || this.initURL,
            method: method || "POST",
            data: paymentInitDataProcess(data)
        });
    }

    async validate(data: { val_id: string }, url: string | false = false, method: string = "GET"): Promise<any> {
        return httpCall({
            url: url || this.validationURL + `val_id=${data.val_id}&store_id=${this.store_id}&store_passwd=${this.store_passwd}&v=1&format=json`,
            method: method || "GET"
        });
    }

    async initiateRefund(data: { refund_amount: number; refund_remarks: string; bank_tran_id: string; refe_id: string }, url: string | false = false, method: string = "GET"): Promise<any> {
        return httpCall({
            url: url || this.refundURL + `refund_amount=${data.refund_amount}&refund_remarks=${data.refund_remarks}&bank_tran_id=${data.bank_tran_id}&refe_id=${data.refe_id}&store_id=${this.store_id}&store_passwd=${this.store_passwd}&v=1&format=json`,
            method: method || "GET"
        });
    }

    async refundQuery(data: { refund_ref_id: string }, url: string | false = false, method: string = "GET"): Promise<any> {
        return httpCall({
            url: url || this.refundQueryURL + `refund_ref_id=${data.refund_ref_id}&store_id=${this.store_id}&store_passwd=${this.store_passwd}&v=1&format=json`,
            method: method || "GET"
        });
    }

    async transactionQueryBySessionId(data: { sessionkey: string }, url: string | false = false, method: string = "GET"): Promise<any> {
        return httpCall({
            url: url || this.transactionQueryBySessionIdURL + `sessionkey=${data.sessionkey}&store_id=${this.store_id}&store_passwd=${this.store_passwd}&v=1&format=json`,
            method: method || "GET"
        });
    }

    async transactionQueryByTransactionId(data: { tran_id: string }, url: string | false = false, method: string = "GET"): Promise<any> {
        return httpCall({
            url: url || this.transactionQueryByTransactionIdURL + `tran_id=${data.tran_id}&store_id=${this.store_id}&store_passwd=${this.store_passwd}&v=1&format=json`,
            method: method || "GET"
        });
    }
}

export default SslCommerzPayment;
