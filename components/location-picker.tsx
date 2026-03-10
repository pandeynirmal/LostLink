'use client'

import { useState, useEffect } from 'react'
import { MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface LocationPickerProps {
    onLocationSelect: (latitude: number, longitude: number) => void
    initialLatitude?: number
    initialLongitude?: number
}

export function LocationPicker({ onLocationSelect, initialLatitude, initialLongitude }: LocationPickerProps) {
    const [latitude, setLatitude] = useState<string>(initialLatitude?.toString() || '')
    const [longitude, setLongitude] = useState<string>(initialLongitude?.toString() || '')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const getCurrentLocation = () => {
        setLoading(true)
        setError(null)

        if (!navigator.geolocation) {
            setError('Geolocation is not supported by your browser')
            setLoading(false)
            return
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude
                const lon = position.coords.longitude
                setLatitude(lat.toFixed(6))
                setLongitude(lon.toFixed(6))
                onLocationSelect(lat, lon)
                setLoading(false)
            },
            (error) => {
                setError(`Error getting location: ${error.message}`)
                setLoading(false)
            },
            {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            }
        )
    }

    const handleManualInput = () => {
        const lat = parseFloat(latitude)
        const lon = parseFloat(longitude)

        if (isNaN(lat) || isNaN(lon)) {
            setError('Please enter valid coordinates')
            return
        }

        if (lat < -90 || lat > 90) {
            setError('Latitude must be between -90 and 90')
            return
        }

        if (lon < -180 || lon > 180) {
            setError('Longitude must be between -180 and 180')
            return
        }

        setError(null)
        onLocationSelect(lat, lon)
    }

    useEffect(() => {
        if (latitude && longitude) {
            const lat = parseFloat(latitude)
            const lon = parseFloat(longitude)
            if (!isNaN(lat) && !isNaN(lon)) {
                handleManualInput()
            }
        }
    }, [latitude, longitude])

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Item Location</Label>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={getCurrentLocation}
                    disabled={loading}
                    className="gap-2"
                >
                    <MapPin className="h-4 w-4" />
                    {loading ? 'Getting Location...' : 'Use Current Location'}
                </Button>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="latitude">Latitude</Label>
                    <Input
                        id="latitude"
                        type="number"
                        step="any"
                        placeholder="37.7749"
                        value={latitude}
                        onChange={(e) => setLatitude(e.target.value)}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="longitude">Longitude</Label>
                    <Input
                        id="longitude"
                        type="number"
                        step="any"
                        placeholder="-122.4194"
                        value={longitude}
                        onChange={(e) => setLongitude(e.target.value)}
                    />
                </div>
            </div>

            {error && (
                <p className="text-sm text-destructive">{error}</p>
            )}

            {latitude && longitude && !error && (
                <p className="text-sm text-muted-foreground">
                     Location: {parseFloat(latitude).toFixed(6)}, {parseFloat(longitude).toFixed(6)}
                </p>
            )}
        </div>
    )
}

