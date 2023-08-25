import mongoose, { Schema, model } from "mongoose";

const DbItemSchema = new Schema({
    title: String,
    description: String,
    data: Object,
    parent_id: String,
    user_id: mongoose.Schema.Types.ObjectId,
    checked: Boolean,
    rank: Number,
    created_at: Date
})

export const DbItem = model('Item', DbItemSchema, 'items')