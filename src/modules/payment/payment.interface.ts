export interface IPaymentGateway {
    name: string;
    init(data: any): Promise<any>;
    validate(data: any): Promise<any>;
    // Optional methods can be added later as needed
}

export interface IPaymentInitData {
    total_amount: number;
    currency: string;
    tran_id: string;
    success_url: string;
    fail_url: string;
    cancel_url: string;
    ipn_url?: string;
    multi_card_name?: string;
    allowed_bin?: string;
    emi_option?: number;
    emi_max_inst_option?: number;
    emi_selected_inst?: number;
    cus_name: string;
    cus_email: string;
    cus_add1: string;
    cus_add2?: string;
    cus_city: string;
    cus_state?: string;
    cus_postcode?: string;
    cus_country: string;
    cus_phone: string;
    shipping_method: string;
    num_of_item?: number;
    product_name: string;
    product_category: string;
    product_profile: string;
    value_a?: string;
    value_b?: string;
    value_c?: string;
    value_d?: string;
    // Add other fields as necessary
}
