import httpCall from '../utils/http.util';
import { IPaymentGateway, IPaymentInitData } from '../payment.interface';
// @ts-ignore
import SSLCommerz from 'ssl-commerz-node';

class SslCommerzPayment implements IPaymentGateway {
    private store_id: string;
    private store_passwd: string;
    private baseURL: string;
    private validationURL: string;
    private refundURL: string;
    private refundQueryURL: string;
    private transactionQueryBySessionIdURL: string;
    private transactionQueryByTransactionIdURL: string;
    private is_live: boolean;

    name = 'sslcommerz'; // Should match gateway target names

    constructor(store_id: string, store_passwd: string, live: boolean = false) {
        this.store_id = store_id;
        this.store_passwd = store_passwd;
        this.is_live = live;
        this.baseURL = `https://${live ? 'securepay' : 'sandbox'}.sslcommerz.com`;
        this.validationURL = this.baseURL + '/validator/api/validationserverAPI.php?';
        this.refundURL = this.baseURL + '/validator/api/merchantTransIDvalidationAPI.php?';
        this.refundQueryURL = this.baseURL + '/validator/api/merchantTransIDvalidationAPI.php?';
        this.transactionQueryBySessionIdURL = this.baseURL + '/validator/api/merchantTransIDvalidationAPI.php?';
        this.transactionQueryByTransactionIdURL = this.baseURL + '/validator/api/merchantTransIDvalidationAPI.php?';
    }

    async init(data: IPaymentInitData & Record<string, any>): Promise<any> {
        const payment = new SSLCommerz.PaymentSession(
            !this.is_live, // `ssl-commerz-node` expects `true` for sandbox, so we negate `is_live`
            this.store_id,
            this.store_passwd
        );

        // Set the urls
        payment.setUrls({
            success: data.success_url,
            fail: data.fail_url,
            cancel: data.cancel_url,
            ipn: data.ipn_url,
        });

        // Set order details
        payment.setOrderInfo({
            total_amount: data.total_amount,
            currency: data.currency,
            tran_id: data.tran_id,
            emi_option: data.emi_option || 0,
        });

        // The ssl-commerz-node package does not support value_a, value_b, etc. in setOrderInfo.
        // We must push them manually to its internal postData object.
        if (data.value_a) payment.postData['value_a'] = data.value_a;
        if (data.value_b) payment.postData['value_b'] = data.value_b;
        if (data.value_c) payment.postData['value_c'] = data.value_c;
        if (data.value_d) payment.postData['value_d'] = data.value_d;

        // Set customer info
        payment.setCusInfo({
            name: data.cus_name,
            email: data.cus_email,
            add1: data.cus_add1,
            add2: data.cus_add2,
            city: data.cus_city,
            state: data.cus_state || 'Optional',
            postcode: data.cus_postcode || 1000,
            country: data.cus_country,
            phone: data.cus_phone,
            fax: data.cus_fax,
        });

        // Set shipping info
        payment.setShippingInfo({
            method: data.shipping_method || 'NO',
            num_item: data.num_of_item || 1,
            name: data.ship_name || data.cus_name,
            add1: data.ship_add1 || data.cus_add1,
            add2: data.ship_add2 || data.cus_add2,
            city: data.ship_city || data.cus_city,
            state: data.ship_state || data.cus_state || 'Optional',
            postcode: data.ship_postcode || data.cus_postcode || 1000,
            country: data.ship_country || data.cus_country || 'Bangladesh',
        });

        // Set Product Profile
        payment.setProductInfo({
            product_name: data.product_name,
            product_category: data.product_category,
            product_profile: data.product_profile,
        });

        // Initiate Payment
        return await payment.paymentInit();
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
