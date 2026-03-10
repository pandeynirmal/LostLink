import mongoose, { Schema, Document, Model } from 'mongoose'

export interface IContactRequest extends Document {
    itemId: mongoose.Types.ObjectId
    requesterId: mongoose.Types.ObjectId
    ownerId: mongoose.Types.ObjectId
    status: 'pending' | 'approved' | 'rejected'
    adminStatus: 'pending' | 'approved' | 'rejected'
    aiMatchScore?: number
    proposedAmount?: number
    adminReviewedBy?: mongoose.Types.ObjectId
    adminReviewedAt?: Date
    adminReviewNotes?: string
    adminDecisionTxHash?: string
    createdAt: Date
}

const ContactRequestSchema = new Schema<IContactRequest>({
    itemId: {
        type: Schema.Types.ObjectId,
        ref: 'Item',
        required: true,
    },
    requesterId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    ownerId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending',
    },
    adminStatus: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending',
    },
    aiMatchScore: {
        type: Number,
    },
    proposedAmount: {
        type: Number,
        min: 0,
        default: 0,
    },
    adminReviewedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
    },
    adminReviewedAt: {
        type: Date,
    },
    adminReviewNotes: {
        type: String,
    },
    adminDecisionTxHash: {
        type: String,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
})

// Performance indexes for common queries
ContactRequestSchema.index({ itemId: 1, status: 1 })
ContactRequestSchema.index({ requesterId: 1, createdAt: -1 })
ContactRequestSchema.index({ ownerId: 1, createdAt: -1 })
ContactRequestSchema.index({ status: 1, adminStatus: 1 })
ContactRequestSchema.index({ adminStatus: 1, createdAt: -1 })

const ContactRequest: Model<IContactRequest> =
    mongoose.models.ContactRequest ||
    mongoose.model<IContactRequest>('ContactRequest', ContactRequestSchema)

export default ContactRequest
