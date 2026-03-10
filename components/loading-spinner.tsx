'use client'

export function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <div className="relative h-12 w-12">
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
      <p className="text-lg font-medium text-muted-foreground">Analyzing image</p>
    </div>
  )
}

