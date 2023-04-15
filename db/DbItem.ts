import mongoose, { Schema, model } from "mongoose";

const DbItemSchema = new Schema({
    title: String,
    description: String,
    parent_id: String,
    user_id: mongoose.Schema.Types.ObjectId,
    checked: Boolean,
    created_at: Date
})

export const DbItem = model('Item', DbItemSchema, 'items')