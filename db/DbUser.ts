import { Schema, model } from "mongoose";

const DbUserSchema = new Schema({
    username: String,
    password: String
})

export const DbUser = model('User', DbUserSchema, 'users')