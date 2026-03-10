'use client'

import { useEffect, useRef, memo } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { MapItem } from '../types/map'

// Fix for default marker icons in Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

interface MapViewProps {
    items: MapItem[]
    center?: [number, number]
    zoom?: number
    onMarkerClick?: (item: MapItem) => void
}

function MapViewComponent({ items, center = [37.7749, -122.4194], zoom = 12, onMarkerClick }: MapViewProps) {
    const mapRef = useRef<L.Map | null>(null)
    const mapContainerRef = useRef<HTMLDivElement>(null)
    const markersRef = useRef<L.Marker[]>([])
    const isInitializedRef = useRef(false)

    // Initialize map only once
    useEffect(() => {
        if (isInitializedRef.current || !mapContainerRef.current) return

        const map = L.map(mapContainerRef.current).setView(center, zoom)

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: ' OpenStreetMap contributors',
            maxZoom: 19,
        }).addTo(map)

        mapRef.current = map
        isInitializedRef.current = true

        return () => {
            map.remove()
            mapRef.current = null
            isInitializedRef.current = false
        }
    }, [center, zoom])

    // Update markers efficiently
    useEffect(() => {
        if (!mapRef.current || !items.length) return

        // Clear existing markers
        markersRef.current.forEach(marker => marker.remove())
        markersRef.current = []

        // Batch marker creation for better performance
        const markers: L.Marker[] = []
        
        items.forEach(item => {
           if (item.latitude == null || item.longitude == null) return

            // Create custom icon based on type
            const iconHtml = item.type === 'lost'
                ? '<div style="background-color: #ef4444; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>'
                : '<div style="background-color: #22c55e; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>'

            const customIcon = L.divIcon({
                html: iconHtml,
                className: 'custom-marker',
                iconSize: [30, 30],
                iconAnchor: [15, 15],
            })

            const marker = L.marker([item.latitude, item.longitude], { icon: customIcon })
                .addTo(mapRef.current!)

            // Create popup content
            const popupContent = `
        <div style="min-width: 200px;">
          <h3 style="font-weight: bold; margin-bottom: 8px; color: ${item.type === 'lost' ? '#ef4444' : '#22c55e'};">
            ${item.type === 'lost' ? ' Lost Item' : ' Found Item'}
          </h3>
          <p style="margin-bottom: 4px;"><strong>Description:</strong> ${item.description}</p>
          ${item.rewardAmount && item.rewardAmount > 0 ? `<p style="margin-bottom: 4px;"><strong>Reward:</strong> ${item.rewardAmount} ETH</p>` : ''}
          <p style="font-size: 12px; color: #666;">
            ${new Date(item.timestamp).toLocaleDateString()}
          </p>
        </div>
      `

            marker.bindPopup(popupContent)

            if (onMarkerClick) {
                marker.on('click', () => onMarkerClick(item))
            }

            markers.push(marker)
        })

        markersRef.current = markers

        // Fit bounds to show all markers only if we have items
        if (items.length > 0 && mapRef.current) {
            const bounds = L.latLngBounds(
                items
                    .filter(item => item.latitude != null && item.longitude != null)
                    .map(item => [item.latitude!, item.longitude!])
            )
            if (bounds.isValid()) {
                mapRef.current.fitBounds(bounds, { padding: [50, 50] })
            }
        }
    }, [items, onMarkerClick])

    return (
        <div
            ref={mapContainerRef}
            style={{
                width: '100%',
                height: '100%',
                minHeight: '400px',
            }}
        />
    )
}

export const MapView = memo(MapViewComponent)

