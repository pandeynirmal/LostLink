'use client'

import { useState, useEffect } from 'react'
import { Html5QrcodeScanner } from 'html5-qrcode'
import Image from 'next/image'
import { Navbar } from '@/components/navbar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, QrCode, MapPin, Coins } from 'lucide-react'

interface ScannedItem {
    id: string
    type: string
    description: string
    image?: string
    latitude?: number
    longitude?: number
    rewardAmount?: string | number
    isClaimed?: boolean
    reporter?: string
    timestamp?: string
    blockchain?: string
}

export default function QRScannerPage() {
    const [scanning, setScanning] = useState(false)
    const [scannedItem, setScannedItem] = useState<ScannedItem | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (scanning) {
            const scanner = new Html5QrcodeScanner(
                'qr-reader',
                {
                    fps: 10,
                    qrbox: { width: 250, height: 250 },
                    aspectRatio: 1.0
                },
                false
            )

            scanner.render(onScanSuccess, onScanError)

            return () => {
                scanner.clear().catch(console.error)
            }
        }
    }, [scanning])

    const onScanSuccess = async (decodedText: string) => {
        setLoading(true)
        setError(null)

        try {
            // Check if the decoded text is JSON (our new format)
            try {
                const parsedData = JSON.parse(decodedText);
                if (parsedData.id && parsedData.type) {
                    setScannedItem(parsedData);
                    setScanning(false);
                    setLoading(false);
                    return;
                }
            } catch (e) {
                // Not JSON, continue with normal API lookup
            }

            // If QR contains a URL to an item page, open it directly
            try {
                const url = new URL(decodedText);
                const match = url.pathname.match(/^\/item\/([^/]+)$/);
                if (match?.[1]) {
                    window.location.href = `/item/${match[1]}`;
                    return;
                }
            } catch {
                // Not a URL, continue
            }

            const response = await fetch('/api/scan-qr', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ qrData: decodedText }),
            })

            const data = await response.json()

            if (data.success) {
                setScannedItem(data.item)
                setScanning(false)
            } else {
                setError(data.error || 'Failed to scan QR code')
            }
        } catch (err) {
            setError('Error connecting to server')
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const onScanError = (errorMessage: string) => {
        // Ignore continuous scan errors
        if (!errorMessage.includes('NotFoundException')) {
            console.warn(errorMessage)
        }
    }

    const startScanning = () => {
        setScanning(true)
        setScannedItem(null)
        setError(null)
    }

    const stopScanning = () => {
        setScanning(false)
    }

    return (
        <div className="min-h-screen bg-background">
            <Navbar />
            <main className="container mx-auto px-4 py-8 max-w-4xl">
                <div className="mb-6">
                    <h1 className="text-3xl font-bold mb-2">QR Code Scanner</h1>
                    <p className="text-muted-foreground">
                        Scan QR codes to view item details from the blockchain
                    </p>
                </div>

                <div className="grid gap-6">
                    {/* Scanner Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <QrCode className="h-5 w-5" />
                                Scanner
                            </CardTitle>
                            <CardDescription>
                                Position the QR code within the camera frame
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {!scanning && !scannedItem && (
                                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                                    <QrCode className="h-16 w-16 text-muted-foreground" />
                                    <p className="text-muted-foreground">Ready to scan</p>
                                    <Button onClick={startScanning} size="lg">
                                        Start Scanning
                                    </Button>
                                </div>
                            )}

                            {scanning && (
                                <div className="space-y-4">
                                    <div id="qr-reader" className="w-full"></div>
                                    {loading && (
                                        <div className="flex items-center justify-center gap-2 text-muted-foreground">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            <span>Processing QR code...</span>
                                        </div>
                                    )}
                                    <Button onClick={stopScanning} variant="outline" className="w-full">
                                        Stop Scanning
                                    </Button>
                                </div>
                            )}

                            {error && (
                                <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
                                    {error}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Scanned Item Details */}
                    {scannedItem && (
                        <Card className="border-2 border-primary">
                            <CardHeader>
                                <CardTitle className="flex items-center justify-between">
                                    <span>Item Details</span>
                                    <Badge variant={scannedItem.type === 'lost' ? 'destructive' : 'default'}>
                                        {scannedItem.type === 'lost' ? ' Lost' : ' Found'}
                                    </Badge>
                                </CardTitle>
                                <CardDescription>Retrieved from blockchain</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {scannedItem.image && (
                                    <div className="relative aspect-video rounded-lg overflow-hidden bg-muted border">
                                        <Image
                                            src={scannedItem.image}
                                            alt="Scanned item"
                                            fill
                                            className="object-contain"
                                        />
                                    </div>
                                )}
                                <div className="grid gap-3">
                                    <div>
                                        <label className="text-sm font-medium text-muted-foreground">Item ID</label>
                                        <p className="font-mono text-sm bg-muted px-2 py-1 rounded mt-1">
                                            {scannedItem.id}
                                        </p>
                                    </div>

                                    <div>
                                        <label className="text-sm font-medium text-muted-foreground">Description</label>
                                        <p className="mt-1">{scannedItem.description}</p>
                                    </div>

                                    {scannedItem.latitude !== undefined && scannedItem.longitude !== undefined && (
                                        <div>
                                            <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                                                <MapPin className="h-4 w-4" />
                                                Location
                                            </label>
                                            <p className="mt-1 font-mono text-sm">
                                                {scannedItem.latitude.toFixed(6)}, {scannedItem.longitude.toFixed(6)}
                                            </p>
                                        </div>
                                    )}

                                    {scannedItem.rewardAmount !== undefined && parseFloat(scannedItem.rewardAmount.toString()) > 0 && (
                                        <div>
                                            <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                                                <Coins className="h-4 w-4" />
                                                Reward
                                            </label>
                                            <p className="mt-1 text-lg font-semibold text-green-600">
                                                {scannedItem.rewardAmount} ETH
                                            </p>
                                            {scannedItem.isClaimed && (
                                                <Badge variant="secondary" className="mt-1">Claimed</Badge>
                                            )}
                                        </div>
                                    )}

                                    {scannedItem.timestamp && (
                                        <div>
                                            <label className="text-sm font-medium text-muted-foreground">Reported On</label>
                                            <p className="mt-1 text-sm">
                                                {new Date(scannedItem.timestamp).toLocaleString()}
                                            </p>
                                        </div>
                                    )}

                                    {scannedItem.blockchain && (
                                        <div>
                                            <label className="text-sm font-medium text-muted-foreground">Blockchain Hash</label>
                                            <p className="mt-1 font-mono text-xs bg-muted px-2 py-1 rounded break-all text-blue-600">
                                                {scannedItem.blockchain}
                                            </p>
                                        </div>
                                    )}

                                    {scannedItem.reporter && (
                                        <div>
                                            <label className="text-sm font-medium text-muted-foreground">Reporter Address</label>
                                            <p className="mt-1 font-mono text-xs bg-muted px-2 py-1 rounded break-all">
                                                {scannedItem.reporter}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-col gap-2 pt-4">
                                    <Button
                                        className="w-full"
                                        onClick={() => window.location.href = `/item/${scannedItem.id}`}
                                    >
                                        View Full Details & Claim
                                    </Button>
                                    <div className="flex gap-2">
                                        <Button onClick={startScanning} variant="outline" className="flex-1">
                                            Scan Another
                                        </Button>
                                        {scannedItem.latitude !== undefined && scannedItem.longitude !== undefined && (
                                            <Button
                                                onClick={() => window.open(`https://www.google.com/maps?q=${scannedItem.latitude},${scannedItem.longitude}`, '_blank')}
                                                className="flex-1"
                                            >
                                                View on Map
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </main>
        </div>
    )
}

