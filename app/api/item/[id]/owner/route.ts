import { NextResponse } from 'next/server'
import connectDB from '@/lib/db'
import Item from '@/lib/models/Item'

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB()
    const { id } = await context.params
    const item = await Item.findById(id).select('userId')
    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }
    return NextResponse.json({ ownerId: item.userId?.toString() || null })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
