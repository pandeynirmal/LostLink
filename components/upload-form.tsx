'use client'

import React from "react"

import { useState, useRef } from 'react'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ImagePreview } from './image-preview'

interface UploadFormProps {
  onSubmit: (
    file: File,
    itemType: string,
    description: string,
    rewardAmount?: number,
    location?: { lat: number, lng: number },
    contactPhone?: string,
    rewardPaymentMethod?: "offchain" | "onchain"
  ) => Promise<void>
  isLoading: boolean
  initialItemType?: "lost" | "found"
}

export function UploadForm({ onSubmit, isLoading, initialItemType = "lost" }: UploadFormProps) {
  const [preview, setPreview] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [description, setDescription] = useState<string>('')
  const [itemType, setItemType] = useState<string>(initialItemType)
  const [rewardAmount, setRewardAmount] = useState<string | number>('')
  const [rewardPaymentMethod, setRewardPaymentMethod] = useState<"offchain" | "onchain">("offchain")
  const [sharePhone, setSharePhone] = useState(false)
  const [contactPhone, setContactPhone] = useState('')
  const [location, setLocation] = useState<{ lat: number, lng: number } | null>(null)
  const [isDragActive, setIsDragActive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((position) => {
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        })
      }, (error) => {
        console.log("Error getting location:", error)
      })
    }
  }, [])

  React.useEffect(() => {
    setItemType(initialItemType)
  }, [initialItemType])

  React.useEffect(() => {
    if (itemType !== "lost") {
      setSharePhone(false)
      setContactPhone('')
    }
  }, [itemType])

  const handleFile = (selectedFile: File) => {
    if (selectedFile.type.startsWith('image/')) {
      setFile(selectedFile)
      const reader = new FileReader()
      reader.onloadend = () => {
        setPreview(reader.result as string)
      }
      reader.readAsDataURL(selectedFile)
    }
  }

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true)
    } else if (e.type === 'dragleave') {
      setIsDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(false)

    const files = e.dataTransfer.files
    if (files && files[0]) {
      handleFile(files[0])
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0])
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (file && description.trim()) {
      const normalizedPhone = sharePhone ? contactPhone.trim() : ''
      await onSubmit(
        file,
        itemType,
        description,
        Number(rewardAmount) || 0,
        location || undefined,
        normalizedPhone || undefined,
        rewardPaymentMethod
      )
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl space-y-6">
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors ${isDragActive
          ? 'border-primary bg-primary/5'
          : 'border-muted-foreground/30 hover:border-primary/50'
          }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleInputChange}
          className="hidden"
          disabled={isLoading}
        />
        <Upload className="mb-3 h-12 w-12 text-muted-foreground" />
        <p className="text-center text-lg font-medium">
          Drag and drop your image here
        </p>
        <p className="text-center text-sm text-muted-foreground">
          or click to select a file
        </p>
      </div>

      {preview && (
        <div className="space-y-4">
          <ImagePreview src={preview || "/placeholder.svg"} alt="Preview" />
          <div className="space-y-3">
            <label className="text-sm font-medium">Item Type</label>
            <select
              value={itemType}
              onChange={(e) => setItemType(e.target.value)}
              disabled={isLoading}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
            >
              <option value="lost">Lost Item</option>
              <option value="found">Found Item</option>
            </select>
          </div>

          {itemType === 'lost' && (
            <div className="space-y-3">
              <label className="text-sm font-medium">Reward Amount (ETH)</label>
              <input
                type="number"
                step="0.001"
                min="0"
                value={rewardAmount}
                onChange={(e) => setRewardAmount(e.target.value)}
                disabled={isLoading}
                placeholder="Optional reward (e.g. 0.1)"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
              />
              <p className="text-xs text-muted-foreground">
                Set a reward to incentivize finders. This will be locked in escrow.
              </p>

              <div className="space-y-2 pt-2">
                <label className="text-sm font-medium">Reward Payout Method</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="offchain"
                      checked={rewardPaymentMethod === "offchain"}
                      onChange={() => setRewardPaymentMethod("offchain")}
                      disabled={isLoading}
                      className="accent-violet-600"
                    />
                    <span className="text-xs">Off-chain (System Wallet)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="onchain"
                      checked={rewardPaymentMethod === "onchain"}
                      onChange={() => setRewardPaymentMethod("onchain")}
                      disabled={isLoading}
                      className="accent-violet-600"
                    />
                    <span className="text-xs">On-chain (MetaMask/Smart Contract)</span>
                  </label>
                </div>
                <p className="text-[10px] text-muted-foreground italic">
                  Off-chain uses your system balance. On-chain requires a MetaMask transaction.
                </p>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={sharePhone}
                  onChange={(e) => setSharePhone(e.target.checked)}
                  disabled={isLoading}
                />
                Share mobile number with potential finder
              </label>

              {sharePhone && (
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  disabled={isLoading}
                  placeholder="Mobile number (optional)"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
                />
              )}
            </div>
          )}
          <div className="space-y-3">
            <label className="text-sm font-medium">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isLoading}
              placeholder="Describe the item (e.g., 'Black leather wallet with credit cards')"
              required
              rows={3}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
            />
          </div>
          <Button
            type="submit"
            disabled={isLoading}
            className="w-full"
            size="lg"
          >
            {isLoading ? 'Analyzing...' : 'Submit'}
          </Button>
        </div>
      )}
    </form>
  )
}
