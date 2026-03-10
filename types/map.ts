export interface MapItem {
    id: string
    type: 'lost' | 'found'
    description: string
    latitude: number
    longitude: number
    rewardAmount?: number
    timestamp: string | number | Date
}