import express, { Handler, NextFunction } from 'express'
import dotenv from 'dotenv';
dotenv.config();

import { auth } from 'express-oauth2-jwt-bearer'

let authMiddleware: Handler = null

export const ConfigureAuthentication = () => {
    authMiddleware = auth({
        audience: process.env.JWT_AUDIENCE,
        issuerBaseURL: process.env.JWT_ISSUER
    })
}

//export const 
export const CheckJwt = (req: express.Request, res: express.Response, next: NextFunction) => {
    authMiddleware(req, res, next)
}