import { Schema, model } from "mongoose";

const DbUserSchema = new Schema({
    auth0id: String,
    username: String,
    password: String
})

export const DbUser = model('User', DbUserSchema, 'users')