import mongoose from 'mongoose';
import dotenv from 'dotenv'

dotenv.config()
mongoose.set('autoIndex', false)
const cxn = process.env.MONGO_CXN
console.log(`Connecting to mongo with ${cxn}`)
export const MongooseConnect = mongoose.connect(cxn, { dbName: 'nulist-production' });
