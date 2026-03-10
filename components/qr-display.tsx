'use client'

import { QRCodeSVG } from 'qrcode.react'
import { Download, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface QRDisplayProps {
    itemId: string
    qrData: string
    qrHash: string
    description?: string
}

export function QRDisplay({ itemId, qrData, qrHash, description }: QRDisplayProps) {
    const downloadQR = () => {
        const svg = document.getElementById('qr-code-svg')
        if (!svg) return

        const svgData = new XMLSerializer().serializeToString(svg)
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        const img = new Image()

        img.onload = () => {
            canvas.width = img.width
            canvas.height = img.height
            ctx?.drawImage(img, 0, 0)

            const pngFile = canvas.toDataURL('image/png')
            const downloadLink = document.createElement('a')
            downloadLink.download = `qr-code-${itemId}.png`
            downloadLink.href = pngFile
            downloadLink.click()
        }

        img.src = 'data:image/svg+xml;base64,' + btoa(svgData)
    }

    const printQR = () => {
        const printWindow = window.open('', '_blank')
        if (!printWindow) return

        printWindow.document.write(`
      <html>
        <head>
          <title>QR Code - ${itemId}</title>
          <style>
            body {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              font-family: Arial, sans-serif;
              padding: 20px;
            }
            .qr-container {
              text-align: center;
            }
            h2 {
              margin-bottom: 10px;
            }
            p {
              color: #666;
              margin: 5px 0;
            }
            .qr-code {
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <div class="qr-container">
            <h2>Lost & Found Item QR Code</h2>
            <p><strong>Item ID:</strong> ${itemId}</p>
            ${description ? `<p><strong>Description:</strong> ${description}</p>` : ''}
            <p><strong>Hash:</strong> ${qrHash.substring(0, 16)}...</p>
            <div class="qr-code">
              ${document.getElementById('qr-code-svg')?.outerHTML || ''}
            </div>
            <p style="font-size: 12px; margin-top: 20px;">
              Scan this QR code to view item details on the blockchain
            </p>
          </div>
        </body>
      </html>
    `)
        printWindow.document.close()
        printWindow.print()
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>QR Code Generated</CardTitle>
                <CardDescription>
                    Scan this code to view item details or share it with others
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex justify-center p-6 bg-white rounded-lg">
                    <QRCodeSVG
                        id="qr-code-svg"
                        value={qrData}
                        size={256}
                        level="H"
                        includeMargin={true}
                    />
                </div>

                <div className="space-y-2">
                    <p className="text-sm">
                        <strong>Item ID:</strong> <code className="text-xs bg-muted px-2 py-1 rounded">{itemId}</code>
                    </p>
                    <p className="text-sm">
                        <strong>QR Hash:</strong> <code className="text-xs bg-muted px-2 py-1 rounded break-all">{qrHash.substring(0, 32)}...</code>
                    </p>
                </div>

                <div className="flex gap-2">
                    <Button onClick={downloadQR} variant="outline" className="flex-1 gap-2">
                        <Download className="h-4 w-4" />
                        Download PNG
                    </Button>
                    <Button onClick={printQR} variant="outline" className="flex-1 gap-2">
                        <Printer className="h-4 w-4" />
                        Print
                    </Button>
                </div>

                <p className="text-xs text-muted-foreground text-center">
                    This QR code is linked to the blockchain and can be used to verify item authenticity
                </p>
            </CardContent>
        </Card>
    )
}
