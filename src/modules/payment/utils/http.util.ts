import fetch, { RequestInit } from 'node-fetch';

interface IHttpCallParams {
    url: string;
    method?: string;
    data?: any;
}

const httpCall = async ({ url, method = 'POST', data = {} }: IHttpCallParams): Promise<any> => {
    // Default options are marked with *
    const options: RequestInit = {
        method: method, // *GET, POST, PUT, DELETE, etc.
        headers: {
            // Note: node-fetch usually manages Content-Type for FormData automatically
            // But if JSON is needed, uncomment the next line
            // 'Content-Type': 'application/json'
        },
        body: ["POST", 'PUT', "PATCH", "UPDATE"].includes(method) ? data : undefined,
    };

    try {
        const response = await fetch(url, options);
        return await response.json();
    } catch (err) {
        throw err;
    }
}

export default httpCall;
