import mongoose, { Schema, Document, models, model } from 'mongoose'

export interface IConversation extends Document {
  itemId: mongoose.Types.ObjectId
  participants: mongoose.Types.ObjectId[]
  deletedFor: mongoose.Types.ObjectId[]
  lastMessage?: string
  updatedAt?: Date
  createdAt?: Date
}

const ConversationSchema = new Schema<IConversation>(
  {
    itemId: {
      type: Schema.Types.ObjectId,
      ref: 'Item',
      required: true
    },

    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
      }
    ],

    deletedFor: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User'
      }
    ],

    lastMessage: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true
  }
)

export default models.Conversation ||
  model<IConversation>('Conversation', ConversationSchema)