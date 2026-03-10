'use client'

import { CheckCircle, AlertCircle, XCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ImagePreview } from './image-preview'

interface ResultCardProps {
  imagePreview: string
  detectedItem: string
  matchScore: number
  status: string
  txHash: string
  timestamp: string
}

export function ResultCard({
  imagePreview,
  detectedItem,
  matchScore,
  status,
  txHash,
  timestamp,
}: ResultCardProps) {
  const getStatusIcon = () => {
    if (status === 'High Match Found') {
      return <CheckCircle className="h-8 w-8 text-green-500" />
    }
    if (status === 'Possible Match') {
      return <AlertCircle className="h-8 w-8 text-yellow-500" />
    }
    return <XCircle className="h-8 w-8 text-red-500" />
  }

  const getStatusColor = () => {
    if (status === 'High Match Found') return 'text-green-600 dark:text-green-400'
    if (status === 'Possible Match') return 'text-yellow-600 dark:text-yellow-400'
    return 'text-red-600 dark:text-red-400'
  }

  return (
    <div className="w-full max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Uploaded Image</CardTitle>
        </CardHeader>
        <CardContent>
          <ImagePreview src={imagePreview || "/placeholder.svg"} alt="Uploaded item" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Analysis Results</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              Detected Item Type
            </p>
            <p className="text-2xl font-bold capitalize">{detectedItem}</p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              Similarity Score
            </p>
            <div className="space-y-2">
              <div className="flex items-end gap-2">
                <span className="text-3xl font-bold">{matchScore}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-gradient-to-r from-primary to-primary/60"
                  style={{ width: `${matchScore}%` }}
                />
              </div>
            </div>
          </div>

          <div className="space-y-3 border-t pt-6">
            <div className="flex items-center gap-3">
              {getStatusIcon()}
              <div className="flex-1">
                <p className={`text-lg font-semibold ${getStatusColor()}`}>
                  {status}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Blockchain Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              Transaction Hash
            </p>
            <p className="break-all rounded-lg bg-muted px-3 py-2 font-mono text-sm">
              {txHash}
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              Timestamp
            </p>
            <p className="text-sm">{new Date(timestamp).toLocaleString()}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
