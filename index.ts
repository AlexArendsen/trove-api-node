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
import { GroupByFirst } from './util/Arrays';

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

const recapitate = async (userId: string) => {

    console.log('>> Checking if need root')

    const existingRoot = await DbItem.exists({ isRoot: true, user_id: userId })
    if (existingRoot !== null) {
        const fullRoot = await DbItem.findOne({ isRoot: true, user_id: userId })
        console.log(`>> No root needed, found`, fullRoot)
        return;
    }
    console.log('>> Root needed, creating one...')

    // Create new root
    const root = await DbItem.create({
        checked: false,
        created_at: new Date(),
        title: 'Home',
        isRoot: true,
        user_id: userId,
        parent_id: null
    })
    console.log(`>> New root established! ID is ${root._id}`)

    // Reparent all null-parent items to new root
    await DbItem.updateMany({ parent_id: null, isRoot: false, user_id: userId }, { '$set': { parent_id: root._id } })

    // Make sure we didn't just connect our new root to itself
    await DbItem.updateOne({ isRoot: true, user_id: userId }, { '$set': { parent_id: null } })

}

const installRoutes = () => {

    app.get('/api/items', CheckJwt, asyncHandler(async (req, res) => {

        const user = await getUser(req);
        if (!user) TrThrow.NotAllowed('Not registered')
        await recapitate(user.id)
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
            .filter(([key, value]) => (!!value || value === '') && editableFields.has(key))
            .forEach(([key, value]) => existing[key] = value);

        if (existing.isRoot && existing.parent_id != null) TrThrow.NotAllowed('Root item cannot be moved')

        await DbItem.findByIdAndUpdate(body._id, existing)
        res.send(existing)
    }))

    // Mass Move Items
    type ItemMassMove = { ids: string[], new_parent: string }
    app.put('/api/items/move', CheckJwt, asyncHandler(async (req, res) => {

        const user = await getUser(req);
        const body = req.body as ItemMassMove
        const items = await DbItem.find({
            _id: { $in: body.ids },
            user_id: user._id
        })

        if (!items.length) TrThrow.NotAllowed('None of the indicated items are permitted to the current user')
        if (items.some(i => i.isRoot)) TrThrow.NotAllowed('Root item cannot be moved')

        const parent = await DbItem.findOne({
            _id: body.new_parent,
            user_id: user._id
        })

        if (!parent) TrThrow.NotAllowed('Cannot move to indicated new parent')

        for(let i of items) {
            i.parent_id = body.new_parent
            await DbItem.findOneAndUpdate(i._id, i)
        }

        res.sendStatus(204)

    }))

    // Sort Items
    type ItemSort = { itemId: string, newRank: number, newParent?: string }
    app.put('/api/items/sort', CheckJwt, asyncHandler(async (req, res) => {
        const user = await getUser(req);
        const body = req.body as ItemSort[]
        const itemIds = body.map(x => x.itemId)
        const items = await DbItem.find({
            _id: { $in: itemIds },
            user_id: user._id
        })

        const updateLookup = GroupByFirst(body, x => x.itemId)
        
        for (let i of items) {
            const update = updateLookup[i._id?.toString()]
            i.rank = update.newRank
            console.log(`Update item ${ i.title } to rank ${ i.rank }`)
            if (update.newParent) {
                console.log('ALSO move it to its new parent')
                i.parent_id = update.newParent
            }
            await DbItem.findOneAndUpdate(i._id, i)
        }

        res.send(items)
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
        if (existing.isRoot) TrThrow.NotAllowed('Root item cannot be deleted')

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
