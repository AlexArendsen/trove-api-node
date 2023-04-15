export class TrException extends Error {

    httpCode: number;
    code: string;
    publicMessage: string;
    debug: any;

    constructor(httpCode: number, code: string, publicMessage: string, debug: any) {
        super();
        this.httpCode = httpCode;
        this.code = code;
        this.publicMessage = publicMessage
        this.debug = debug
    }
}

export const TrThrow = {
    NotFound: (what: string, extras?: any) => { throw new TrException(404, 'NOT_FOUND', `${what} not found`, extras) },
    InvalidState: (publicMessage: string, extras?: any) => { throw new TrException(400, 'INVALID_STATE', publicMessage, extras) },
    InvalidInput: (what: string, extras?: any) => { throw new TrException(400, 'INVALID_INPUT', `Input for ${what} was invalid`, extras) },
    NotAllowed: (publicMessage: string, extras?: any) => { throw new TrException(403, 'NOT_ALLOWED', publicMessage, extras) },
    NotAuthenticated: (publicMessage: string, extras?: any) => { throw new TrException(401, 'AUTH_REQUIRED', publicMessage, extras) },
    InternalError: (publicMessage: string, extras?: any) => { throw new TrException(500, 'INTERNAL_SERVER_ERROR', publicMessage, extras) }
}