import dotenv from 'dotenv';
dotenv.config();

import bodyParser from 'body-parser';
import express, { NextFunction } from 'express';
import { Log } from './util/Logging';
import cors from 'cors';
import asyncHandler from 'express-async-handler'
import { MongooseConnect } from './providers/Mongoose';
import { DbUser } from './db/DbUser';
import { TrThrow } from './models/TrException';
import jwt from 'jsonwebtoken'
import { DbItem } from './db/DbItem';
import { ConfigureAppInsights } from './startup/ConfigureAppInsights';
import { CheckJwt, ConfigureAuthentication } from './startup/ConfigureAuthentication';
import { ShapeQuery } from './util/ShapeQuery';

ConfigureAuthentication();
ConfigureAppInsights();

// Initialize the express engine
const app: express.Application = express();
const proto: string = process.env.PROTOCOL;
const hostname: string = process.env.HOSTNAME;
const port: number = parseInt(process.env.PORT);
const iface: string = process.env.INTERFACE; // Network interface to bind to e.g., 0.0.0.0
const env: string = process.env.ENV; // dev, prod

const installMiddleware = () => {

    // Request logging
    app.use((req, res, next) => {
        console.log(`[REQUEST] ${req.method} ${req.path}`)
        next()
    })

    // CORS
    const envCorsOrigins = process.env.CORS_ORIGINS?.split(' ').map(o => new RegExp(o))
    let originSettings = envCorsOrigins
    if (env === 'dev') originSettings = [/localhost:\d{4,5}/, /192\.168\.0/, /172\.10\.20/, /127\.0\.0\.1/, /ecstatic-saha-cbbb0e\.netlify\.app/, ...originSettings];

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

    // JSON bodies
    app.use(bodyParser.json());

};

const installRoutes = () => {

    app.get('/api/items', CheckJwt, asyncHandler(async (req, res) => {

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
        data: any,
        props: object,
        parent_id?: string
    }>
    app.post('/api/item', CheckJwt, asyncHandler(async (req, res) => {
        const user = await getUser(req);
        const body = req.body as ItemUpsert

        if ((body.description?.length || 0) > 2048) TrThrow.InvalidInput('Item description')
        if (body.data && JSON.stringify(body.data).length > 2048) TrThrow.InvalidInput('Item data payload')

        const toCreate = {
            title: body.title,
            description: body.description,
            data: body.data,
            parent_id: body.parent_id,
            created_at: new Date(),
            user_id: user._id
        }

        const created = await DbItem.create(toCreate)
        res.send(created)
    }))

    // Edit Item
    const editableFields = new Set(['title', 'description', 'data', 'parent_id'])
    app.put('/api/item', CheckJwt, asyncHandler(async (req, res) => {
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

    // Check / Uncheck Item
    app.put('/api/item/:id/check', CheckJwt, asyncHandler(async (req, res) => {
        const item = await checkItem(req, req.params.id, true)
        res.send(item)
    }))

    app.put('/api/item/:id/uncheck', CheckJwt, asyncHandler(async (req, res) => {
        const item = await checkItem(req, req.params.id, false)
        res.send(item)
    }))

    // Delete Item
    app.delete('/api/item/:id', CheckJwt, asyncHandler(async (req, res) => {
        const user = await getUser(req);
        const itemId = req.params.id
        const existing = await DbItem.findById(itemId)
        if (!existing) TrThrow.NotFound('Item not found')
        if (!existing.user_id.equals(user._id)) TrThrow.NotAllowed('Item not authorized for current user')

        await DbItem.findByIdAndDelete(itemId)
        res.send(existing)
    }))

    app.delete('/api/items', CheckJwt, asyncHandler(async (req, res) => {
        const user = await getUser(req);
        const itemIds = ShapeQuery.List(req.query, 'ids');
        const query = { _id: { $in: itemIds } }
        const existing = await DbItem.find(query)
        if (!existing?.length) TrThrow.NotFound('Item not found')
        if (existing.some(e => !e.user_id.equals(user._id))) TrThrow.NotAllowed('Item not authorized for current user')

        await DbItem.deleteMany(query)
        res.send(existing)
    }))

    // TODO -- Middleware, maybe integrate with CheckJwt
    const getUser = async (req: express.Request) => {

        const token = req.headers.authorization.replace(/^Bearer /, '')
        const payload = jwt.decode(token)
        if (typeof payload === 'string') throw TrThrow.NotAuthenticated('Invalid token')
        const existing = await DbUser.findOne({ auth0id: payload.sub })

        // Auto-onboard new user
        if (!existing) 
            return await DbUser.create({ auth0id: payload.sub, username: payload.sub })

        return existing;
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
