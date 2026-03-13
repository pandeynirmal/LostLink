import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db'
import Item from '@/lib/models/Item'
import jwt from 'jsonwebtoken'

// Get user ID from Authorization header
function getUserFromToken(request: NextRequest): string | null {
    try {
        const authHeader = request.headers.get('authorization')
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return null
        }

        const token = authHeader.replace('Bearer ', '')
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET || 'your_super_secret_jwt_key_here'
        ) as { userId: string }

        return decoded.userId
    } catch {
        return null
    }
}

export async function GET(request: NextRequest) {
    try {
        const userId = getUserFromToken(request)

        await connectDB()

        // Get pagination params
        const searchParams = request.nextUrl.searchParams
        const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
        const limit = Math.min(30, parseInt(searchParams.get('limit') || '10', 10))
        const skip = (page - 1) * limit

        //  Exclude items removed by admin
        const baseFilter = { removedByAdmin: { $ne: true } }

        const query = userId
            ? { userId, ...baseFilter }
            : baseFilter

        // Parallelize count and find queries
        const [items, total] = await Promise.all([
          Item.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .select('-embedding')
            .populate('matchedItemId', 'description imageUrl type')
            .lean(),
          Item.countDocuments(query),
        ])

        const uploads = items.map(item => ({
            id: item._id,
            type: item.type,
            description: item.description,
            imageUrl: item.imageUrl,
            status: item.status,
            matchScore: item.matchScore
                ? Math.round(item.matchScore * 100)
                : null,
            createdAt: item.createdAt,
            latitude: item.latitude,
            longitude: item.longitude,
            rewardAmount: item.rewardAmount,
            isClaimed: item.isClaimed,

            //  Blockchain structured data
            blockchain: item.blockchain
                ? {
                      txHash: item.blockchain.txHash,
                      network: item.blockchain.network,
                      contractAddress: item.blockchain.contractAddress,
                      action: item.blockchain.action,
                      verifiedAt: item.blockchain.verifiedAt,
                  }
                : null,

            matchedItem: (item.matchedItemId as any)
                ? {
                      id: (item.matchedItemId as any)._id,
                      description: (item.matchedItemId as any).description,
                      imageUrl: (item.matchedItemId as any).imageUrl,
                      type: (item.matchedItemId as any).type,
                  }
                : null,
        }))

        return NextResponse.json(
            {
                success: true,
                uploads,
                count: uploads.length,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit),
                },
            },
            {
                headers: {
                    'Cache-Control': 'private, max-age=30',
                },
            }
        )

    } catch (error) {
        console.error('Error fetching uploads:', error)
        return NextResponse.json(
            {
                error: 'Failed to fetch uploads',
                details: (error as Error).message,
            },
            { status: 500 }
        )
    }
}
