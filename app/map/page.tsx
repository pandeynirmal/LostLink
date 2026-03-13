'use client'

import { useState, useEffect } from 'react'
import { Navbar } from '@/components/navbar'
import dynamic from 'next/dynamic'

const MapView = dynamic(
  () => import('@/components/map-view').then(mod => mod.MapView),
  { ssr: false }
)
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'
import type { MapItem } from '../../types/map'

export default function MapPage() {
    const [items, setItems] = useState<MapItem[]>([])
    const [filteredItems, setFilteredItems] = useState<MapItem[]>([])
    const [filter, setFilter] = useState<'all' | 'lost' | 'found'>('all')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        fetchItems()
    }, [])

    useEffect(() => {
        if (filter === 'all') {
            setFilteredItems(items)
        } else {
            setFilteredItems(items.filter(item => item.type === filter))
        }
    }, [filter, items])

    const fetchItems = async () => {
        try {
            setLoading(true)
            setError(null)

            // First try the public uploads feed
            let response = await fetch('/api/uploads', {
                credentials: 'include',
                cache: 'no-store',
            })

            let data: any = null

            if (response.ok) {
                data = await response.json().catch(() => null)
                if (!data || !data.success) {
                    throw new Error(data?.error || 'Failed to load public uploads')
                }
            } else {
                // If the public endpoint fails (e.g. not configured in deployment),
                // fall back to the authenticated "my uploads" endpoint so that the
                // map still works for the signed-in user.
                response = await fetch('/api/uploads/my', {
                    credentials: 'include',
                    cache: 'no-store',
                })

                if (!response.ok) {
                    const errorBody = await response.json().catch(() => null)
                    throw new Error(errorBody?.error || 'Failed to load items')
                }

                data = await response.json().catch(() => null)
                if (!data || !data.success) {
                    throw new Error(data?.error || 'Failed to load items')
                }

                // Normalize shape to reuse mapping logic
                if (Array.isArray(data.items) && !data.uploads) {
                    data.uploads = data.items
                }
            }

            const sourceArray = Array.isArray(data.uploads) ? data.uploads : []

            const mappedItems = sourceArray
                .filter((item: any) =>
                    typeof item.latitude === 'number' &&
                    typeof item.longitude === 'number'
                )
                .map((item: any) => ({
                    id: item.id || item._id,
                    type: item.type,
                    description: item.description,
                    latitude: item.latitude,
                    longitude: item.longitude,
                    rewardAmount: item.rewardAmount,
                    timestamp: item.createdAt
                }))

            setItems(mappedItems)
            setFilteredItems(mappedItems)

        } catch (err) {
            console.error(err)
            setError(
                err instanceof Error
                    ? err.message || 'Failed to load items'
                    : 'Failed to load items'
            )
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-background">
            <Navbar />
            <main className="container mx-auto px-4 py-8">
                <div className="mb-6">
                    <h1 className="text-3xl font-bold mb-2">Map View</h1>
                    <p className="text-muted-foreground">
                        Browse lost and found items by location
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

                    {/* Sidebar */}
                    <Card className="lg:col-span-1">
                        <CardHeader>
                            <CardTitle>Filters</CardTitle>
                            <CardDescription>Filter items by type</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Item Type</label>
                                <Select value={filter} onValueChange={(value: any) => setFilter(value)}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Items</SelectItem>
                                        <SelectItem value="lost">Lost Items</SelectItem>
                                        <SelectItem value="found">Found Items</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="pt-4 border-t">
                                <h3 className="font-semibold mb-2">Statistics</h3>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-muted-foreground">Total Items</span>
                                        <Badge variant="secondary">{items.length}</Badge>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-muted-foreground">Lost Items</span>
                                        <Badge variant="destructive">
                                            {items.filter(i => i.type === 'lost').length}
                                        </Badge>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-muted-foreground">Found Items</span>
                                        <Badge className="bg-green-600">
                                            {items.filter(i => i.type === 'found').length}
                                        </Badge>
                                    </div>
                                </div>
                            </div>

                        </CardContent>
                    </Card>

                    {/* Map Section */}
                    <div className="lg:col-span-3">
                        <Card>
                            <CardHeader>
                                <CardTitle>
                                    {filter === 'all'
                                        ? 'All Items'
                                        : filter === 'lost'
                                        ? 'Lost Items'
                                        : 'Found Items'}
                                </CardTitle>
                                <CardDescription>
                                    Showing {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''} on the map
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {loading ? (
                                    <div className="flex items-center justify-center h-[600px]">
                                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                    </div>
                                ) : error ? (
                                    <div className="flex items-center justify-center h-[600px] text-destructive">
                                        {error}
                                    </div>
                                ) : filteredItems.length === 0 ? (
                                    <div className="flex items-center justify-center h-[600px] text-muted-foreground text-center px-4">
                                        {items.length === 0
                                            ? 'No items to display yet.'
                                            : 'You have uploads, but none of them have a saved map location. Edit an item and add a location to see it here.'}
                                    </div>
                                ) : (
                                    <div className="h-[600px]">
                                        <MapView items={filteredItems} />
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </main>
        </div>
    )
}
