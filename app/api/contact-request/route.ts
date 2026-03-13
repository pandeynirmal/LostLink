import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db'
import ContactRequest from '@/lib/models/ContactRequest'
import Item from '@/lib/models/Item'
import '@/lib/models/User'
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";

const MIN_CLAIM_MATCH_SCORE = 50;

const tokenize = (value: unknown): string[] => {
    if (typeof value !== "string") return [];
    return value
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((token) => token.length > 2);
};

const similarityPercent = (
    aDescription: unknown,
    bDescription: unknown,
    aImageUrl?: unknown,
    bImageUrl?: unknown
): number => {
    if (
        typeof aImageUrl === "string" &&
        typeof bImageUrl === "string" &&
        aImageUrl.trim() &&
        aImageUrl.trim() === bImageUrl.trim()
    ) {
        return 100;
    }

    const aTokens = new Set(tokenize(aDescription));
    const bTokens = new Set(tokenize(bDescription));
    if (aTokens.size === 0 || bTokens.size === 0) return 0;

    let intersection = 0;
    for (const token of aTokens) {
        if (bTokens.has(token)) intersection += 1;
    }
    const union = new Set([...aTokens, ...bTokens]).size;
    if (union === 0) return 0;
    return Math.round((intersection / union) * 10000) / 100;
};

//  Get user from cookie (NEW SYSTEM)
async function getUserIdFromCookie() {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;

    if (!token) return null;

    const decoded = verifyToken(token);
    if (!decoded) return null;

    return decoded.userId;
}

export async function POST(request: NextRequest) {
    try {
        const userId = await getUserIdFromCookie();

        if (!userId) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const { itemId, proposedAmount } = await request.json();

        if (!itemId) {
            return NextResponse.json(
                { error: 'Item ID is required' },
                { status: 400 }
            );
        }

        await connectDB();

        const item = await Item.findById(itemId);

        if (!item) {
            return NextResponse.json(
                { error: 'Item not found' },
                { status: 404 }
            );
        }

        // Prevent owner from requesting their own item
        if (item.userId?.toString() === userId) {
            console.log('[Contact Request] Blocked self-request attempt. Item owner:', item.userId.toString(), 'Requester:', userId);
            return NextResponse.json(
                { error: 'You cannot request contact for your own item' },
                { status: 400 }
            );
        }

        if (item.isClaimed || item.status === "resolved") {
            return NextResponse.json(
                { error: "Item already claimed/resolved" },
                { status: 400 }
            );
        }

        // Prevent duplicate requests on the same item by same requester.
        const existingRequest = await ContactRequest.findOne({
            itemId,
            requesterId: userId,
            status: { $in: ["pending", "approved"] }
        });

        if (existingRequest) {
            const already =
                existingRequest.status === "approved"
                    ? "Request already sent and approved"
                    : "Request already sent";
            return NextResponse.json(
                { error: already },
                { status: 400 }
            );
        }

        const normalizeScore = (score: unknown): number => {
            if (typeof score !== "number" || !Number.isFinite(score)) return 0;
            return score <= 1 ? score * 100 : score;
        };

        let aiMatchScore = normalizeScore(item.matchScore);
        console.log('[Contact Request] Initial item.matchScore:', item.matchScore, '-> normalized to:', aiMatchScore);

        // Fallback for legacy or partial records where only the counterpart item has score.
        if (aiMatchScore <= 0) {
            console.log('[Contact Request] Initial score is 0, checking counterpart...');
            const counterpart = await Item.findOne({ matchedItemId: item._id })
                .sort({ matchScore: -1 })
                .select("matchScore");
            aiMatchScore = normalizeScore(counterpart?.matchScore);
            console.log('[Contact Request] Counterpart matchScore:', counterpart?.matchScore, '-> normalized to:', aiMatchScore);
        }

        // Last fallback: compare this target item with requester's opposite-type items.
        if (aiMatchScore <= 0) {
            console.log('[Contact Request] Score still 0, using fallback comparison...');
            const requesterType = item.type === "lost" ? "found" : "lost";
            const requesterCandidates = await Item.find({
                userId,
                type: requesterType,
                removedByAdmin: { $ne: true },
                isClaimed: { $ne: true },
            })
                .select("description imageUrl matchScore")
                .sort({ createdAt: -1 })
                .limit(75)
                .lean();

            let fallbackScore = 0;
            for (const candidate of requesterCandidates) {
                const simScore = similarityPercent(
                    item.description,
                    candidate.description,
                    item.imageUrl,
                    candidate.imageUrl
                );
                const candidateScore = normalizeScore((candidate as any)?.matchScore);
                fallbackScore = Math.max(fallbackScore, simScore, candidateScore);
            }
            aiMatchScore = fallbackScore;
            console.log('[Contact Request] Fallback score calculated:', aiMatchScore);
        }

        console.log('[Contact Request] Final aiMatchScore:', aiMatchScore, 'MIN_CLAIM_MATCH_SCORE:', MIN_CLAIM_MATCH_SCORE);

        if (!aiMatchScore || aiMatchScore < MIN_CLAIM_MATCH_SCORE) {
            console.log('[Contact Request] REJECTED: aiMatchScore', aiMatchScore, 'is less than MIN_CLAIM_MATCH_SCORE', MIN_CLAIM_MATCH_SCORE);
            return NextResponse.json(
                {
                    error: `Claim request rejected. Match score: ${aiMatchScore || 0}%. Minimum required: ${MIN_CLAIM_MATCH_SCORE}%.`,
                },
                { status: 400 }
            );
        }

        let normalizedProposedAmount = Number(item.rewardAmount || 0);

        if (proposedAmount !== undefined && proposedAmount !== null && `${proposedAmount}`.trim() !== '') {
            const parsed = Number(proposedAmount);
            if (!Number.isFinite(parsed) || parsed < 0) {
                return NextResponse.json(
                    { error: 'Proposed amount must be a valid number greater than or equal to 0' },
                    { status: 400 }
                );
            }
            normalizedProposedAmount = parsed;
        }

        await ContactRequest.create({
            itemId,
            requesterId: userId,
            ownerId: item.userId,
            aiMatchScore,
            proposedAmount: normalizedProposedAmount,
        });

        return NextResponse.json({
            success: true,
            message: 'Claim request sent successfully'
        });

    } catch (error) {
        console.error('Contact Request Error:', error);

        return NextResponse.json(
            { error: 'Server error' },
            { status: 500 }
        );
    }
}

export async function GET(request: NextRequest) {
    try {
        const userId = await getUserIdFromCookie();

        if (!userId) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const searchParams = request.nextUrl.searchParams
        const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
        const limit = Math.min(20, parseInt(searchParams.get('limit') || '10', 10))
        const skip = (page - 1) * limit
        const statusFilter = (searchParams.get("status") || "pending").toLowerCase()
        const scope = (searchParams.get("scope") || "owner").toLowerCase()

        const requestFilter: Record<string, unknown> = {
            ...(scope === "requester" ? { requesterId: userId } : { ownerId: userId }),
        }

        if (statusFilter === "all") {
            requestFilter.status = { $in: ["pending", "approved"] }
        } else if (statusFilter === "approved") {
            requestFilter.status = "approved"
        } else {
            requestFilter.status = "pending"
        }

        await connectDB();

        const rawRequests = await ContactRequest.find({
            ...requestFilter
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('itemId', 'description type imageUrl rewardAmount')
        .populate('requesterId', 'fullName email')
        .lean()

        // Remove orphaned requests where linked item was deleted/removed.
        const requests = rawRequests.filter((entry: any) => Boolean(entry?.itemId))

        const total = await ContactRequest.countDocuments({
            ...requestFilter
        })

        return NextResponse.json(
          {
            requests,
            pagination: {
              page,
              limit,
              total,
              pages: Math.ceil(total / limit)
            }
          },
          {
            headers: {
              'Cache-Control': 'no-store, no-cache, must-revalidate'
            }
          }
        );

    } catch (error) {
        console.error(error);

        return NextResponse.json(
            { error: 'Server error' },
            { status: 500 }
        );
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const userId = await getUserIdFromCookie();
        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const { itemId, requestId, scope = "requester", deleteAll = false } = await request.json();

        await connectDB();

        if (scope === "owner") {
            if (deleteAll === true) {
                const result = await ContactRequest.deleteMany({
                    ownerId: userId,
                    status: { $in: ["pending", "approved"] },
                });
                return NextResponse.json({
                    success: true,
                    message: "All claims deleted",
                    deletedCount: result.deletedCount || 0,
                });
            }

            if (!requestId) {
                return NextResponse.json(
                    { error: "requestId is required for owner delete" },
                    { status: 400 }
                );
            }

            const deletedByOwner = await ContactRequest.findOneAndDelete({
                _id: requestId,
                ownerId: userId,
                status: { $in: ["pending", "approved"] },
            });

            if (!deletedByOwner) {
                return NextResponse.json(
                    { error: "Claim not found or unauthorized" },
                    { status: 404 }
                );
            }

            return NextResponse.json({
                success: true,
                message: "Claim deleted",
            });
        }

        if (!itemId && !requestId) {
            return NextResponse.json(
                { error: "itemId or requestId is required" },
                { status: 400 }
            );
        }

        const filter: Record<string, unknown> = {
            requesterId: userId,
            status: "pending",
        };

        if (requestId) {
            filter._id = requestId;
        } else if (itemId) {
            filter.itemId = itemId;
        }

        const deleted = await ContactRequest.findOneAndDelete(filter);
        if (!deleted) {
            return NextResponse.json(
                { error: "No pending request found to cancel" },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            message: "Claim request canceled",
        });
    } catch (error) {
        console.error("Contact Request Cancel Error:", error);
        return NextResponse.json(
            { error: "Server error" },
            { status: 500 }
        );
    }
}

