import dotenv from 'dotenv';
dotenv.config();

import * as appInsights from "applicationinsights";
if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) appInsights.setup().start();

import bodyParser from 'body-parser';
import express, { NextFunction } from 'express';
import { Log } from './util/Logging';
import cors from 'cors';
import asyncHandler from 'express-async-handler'
import { MongooseConnect } from './providers/Mongoose';
import { DbUser } from './db/DbUser';
import { TrThrow } from './models/TrException';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken'
import { DbItem } from './db/DbItem';


// Initialize the express engine
const app: express.Application = express();
const proto: string = process.env.PROTOCOL;
const hostname: string = process.env.HOSTNAME;
const port: number = parseInt(process.env.PORT);
const domain: string = (() => {
    const needsPort = (proto === 'https' && port !== 443) || (proto === 'http' && port !== 80)
    const base = `${proto}://${hostname}`
    return needsPort ? `${base}:${port}` : base
})()
const iface: string = process.env.INTERFACE;
const env: string = process.env.ENV;

const installMiddleware = () => {

    // Request logging

    app.use((req, res, next) => {
        console.log(`[REQUEST] ${req.method} ${req.path}`)
        next()
    })

    // CORS
    let originSettings = [ new RegExp(`${hostname}$`) ]
    if (env === 'dev') originSettings = [/localhost:\d{4}/, /192\.168\.0/, /172\.10\.20/, /127\.0\.0\.1/, /ecstatic-saha-cbbb0e\.netlify\.app/, ...originSettings];

    const corsOptions = {
        origin: originSettings,
        methods: ['GET', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'Content-Length', 'X-Requested-With', 'rid' ],
        credentials: true,
        optionsSuccessStatus: 200
    };

    app.disable('x-powered-by');
    app.set('trust proxy', true);
    app.options('/*', cors(corsOptions));
    app.use(cors(corsOptions));
    app.use(bodyParser.json());

    // app.use(session({
    //     store: MongoStore.create({
    //         mongoUrl: process.env.COSMOS_CXN,
    //         dbName: 'Default',
    //         collectionName: 'AuthSessions',
    //         autoRemove: 'interval',
    //         autoRemoveInterval: 10,
    //         crypto: {
    //             secret: process.env.COOKIE_CRYPTO_SECRET
    //         }
    //     }),
    //     resave: false, 
    //     saveUninitialized: false,
    //     secret: process.env.COOKIE_SECRET,
    //     cookie: {
    //         // Only set secure cookies in production
    //         // In dev, allow cookies over http
    //         secure: app.get('env') === 'production',
    //         httpOnly: true,
    //         maxAge: 2592000000, // 30 days in miliseconds
    //         sameSite: 'lax',
    //         domain: process.env.HOSTNAME !== 'localhost' ? `.${process.env.HOSTNAME}` : undefined
    //     },
    //     name: 'sid'
    // }));
};

const installRoutes = () => {

    app.post('/api/login', asyncHandler(async (req, res) => {

        const username = req.body.username
        const password = req.body.password

        const user = await DbUser.findOne({ username })
        if (user == null) TrThrow.NotAuthenticated('Invalid login')

        const okay = await bcrypt.compare(password, user.password)
        if (!okay) TrThrow.NotAuthenticated('Invalid login')

        const token = jwt.sign({ username }, process.env.JWT_SECRET);
        res.send({ token })

    }))

    app.get('/api/items', asyncHandler(async (req, res) => {

        const user = await getUser(req);
        if (!user) TrThrow.NotAllowed('Not registered')
        const items = await DbItem.find({ user_id: user.id }).exec()

        res.send(items)

    }))

    // Create Item
    type ItemUpsert = Partial<{
        _id: string,
        title: string,
        description: string,
        props: object,
        parent_id?: string
    }>
    app.post('/api/item', asyncHandler(async (req, res) => {
        const user = await getUser(req);
        const body = req.body as ItemUpsert

        const toCreate = {
            title: body.title,
            description: body.description,
            parent_id: body.parent_id,
            created_at: new Date(),
            user_id: user._id
        }

        const created = await DbItem.create(toCreate)
        console.log('created object', created)
        res.send(created)
    }))

    const editableFields = new Set(['title', 'description', 'parent_id'])
    app.put('/api/item', asyncHandler(async (req, res) => {
        const user = await getUser(req);
        const body = req.body as ItemUpsert
        const existing = await DbItem.findById(body._id)
        if (!existing.user_id.equals(user._id)) TrThrow.NotAllowed('Item not authorized for current user')

        Object.entries(body)
            .filter(([key, value]) => !!value && editableFields.has(key))
            .forEach(([key, value]) => existing[key] = value);

        await DbItem.findByIdAndUpdate(body._id, existing)
        res.send(existing)
    }))

    app.put('/api/item/:id/check', asyncHandler(async (req, res) => {
        const item = await checkItem(req, req.params.id, true)
        res.send(item)
    }))

    app.put('/api/item/:id/uncheck', asyncHandler(async (req, res) => {
        const item = await checkItem(req, req.params.id, false)
        res.send(item)
    }))

    app.delete('/api/item/:id', asyncHandler(async (req, res) => {
        const user = await getUser(req);
        const itemId = req.params.id
        const existing = await DbItem.findById(itemId)
        if (!existing.user_id.equals(user._id)) TrThrow.NotAllowed('Item not authorized for current user')

        await DbItem.findByIdAndDelete(itemId)
        res.send(existing)
    }))

    // TODO -- Middleware
    const getUser = async (req: express.Request) => {
        const token = req.headers.authorization.replace(/^Bearer /, '')
        const userOk = await jwt.verify(token, process.env.JWT_SECRET, {
            ignoreExpiration: true,
            ignoreNotBefore: true
        })
        const payload = userOk as { username: string }

        if (!userOk) TrThrow.NotAuthenticated('Not authenticated')
        return await DbUser.findOne({ username: payload.username })
    }

    const checkItem = async (req: express.Request, itemId: string, checked: boolean) => {
        const user = await getUser(req);
        const existing = await DbItem.findById(itemId)
        if (!existing.user_id.equals(user._id)) TrThrow.NotAllowed('Item not authorized for current user')
        existing.checked = checked
        await DbItem.findByIdAndUpdate(itemId, existing)
        return existing;
    }


}

installMiddleware()
installRoutes()

// Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: NextFunction) => {

    // We might not have to do this, app insights SDK might do this already
    Log.Error(err)

    if (err?.httpCode) {
        res.status(err.httpCode).json({ code: err.code, message: err.publicMessage })
    } else {
        res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An internal error ocurred' })
    }
})

const start = async () => {

    // Wait for mongoose to be configured
    await MongooseConnect

    // Server setup
    app.listen(port, iface, () => { console.log(`TREASURE TROVING ON ${iface}:${port}/`); });
}

start();
