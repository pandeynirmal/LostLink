'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import { useDropzone } from 'react-dropzone';
import { useRouter, useSearchParams } from 'next/navigation';
import { Upload, X, FileText, AlertCircle } from 'lucide-react';
import { Navbar } from '@/components/navbar';

interface UploadedFile {
  file: File;
  preview?: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
}

function UploadForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const typeParam = searchParams.get('type') as 'lost' | 'found' | null;

  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [itemType, setItemType] = useState<'lost' | 'found'>(typeParam === 'found' ? 'found' : 'lost');
  const [description, setDescription] = useState('');
  const [rewardAmount, setRewardAmount] = useState('0');
  const [contactPhone, setContactPhone] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (typeParam === 'found' || typeParam === 'lost') {
      setItemType(typeParam);
    }
  }, [typeParam]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles: UploadedFile[] = acceptedFiles.map(file => ({
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      status: 'pending',
      progress: 0,
    }));
    setFiles(prev => [...prev, ...newFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif'],
    },
  });

  const removeFile = (index: number) => {
    setFiles(prev => {
      const newFiles = [...prev];
      if (newFiles[index].preview) URL.revokeObjectURL(newFiles[index].preview!);
      newFiles.splice(index, 1);
      return newFiles;
    });
  };

  const uploadFiles = async () => {
    setFormError('');

    if (files.length === 0) {
      setFormError('Please select an image.');
      return;
    }
    if (!description.trim()) {
      setFormError('Please enter a description.');
      return;
    }

    setIsUploading(true);

    for (let i = 0; i < files.length; i++) {
      if (files[i].status === 'success') continue;

      setFiles(prev => {
        const newFiles = [...prev];
        newFiles[i] = { ...newFiles[i], status: 'uploading', progress: 0 };
        return newFiles;
      });

      const formData = new FormData();
      formData.append('image', files[i].file);        // ← correct field name
      formData.append('type', itemType);               // ← required by API
      formData.append('description', description.trim()); // ← required by API
      formData.append('rewardAmount', itemType === 'lost' ? rewardAmount : '0');
      formData.append('contactPhone', contactPhone);
      formData.append('rewardPaymentMethod', 'offchain');

      try {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const progress = Math.round((e.loaded / e.total) * 100);
            setFiles(prev => {
              const newFiles = [...prev];
              newFiles[i] = { ...newFiles[i], progress };
              return newFiles;
            });
          }
        });

        const uploadPromise = new Promise<any>((resolve, reject) => {
          xhr.addEventListener('load', () => {
            try {
              const data = JSON.parse(xhr.responseText);
              if (xhr.status === 200 || xhr.status === 201) resolve(data);
              else reject(new Error(data.error || `Upload failed with status ${xhr.status}`));
            } catch {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          });
          xhr.addEventListener('error', () => reject(new Error('Upload failed')));
          xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));
        });

        xhr.open('POST', '/api/upload');
        xhr.withCredentials = true;
        xhr.send(formData);

        const data = await uploadPromise;

        setFiles(prev => {
          const newFiles = [...prev];
          newFiles[i] = { ...newFiles[i], status: 'success', progress: 100 };
          return newFiles;
        });

        // Redirect to item page after success
        setTimeout(() => {
          if (data.itemId) router.push(`/item/${data.itemId}`);
          else router.push('/my-uploads');
        }, 1000);

      } catch (error) {
        setFiles(prev => {
          const newFiles = [...prev];
          newFiles[i] = {
            ...newFiles[i],
            status: 'error',
            error: error instanceof Error ? error.message : 'Upload failed',
          };
          return newFiles;
        });
      }
    }

    setIsUploading(false);
  };

  const getStatusColor = (status: UploadedFile['status']) => {
    switch (status) {
      case 'success': return 'text-green-600';
      case 'error': return 'text-red-600';
      case 'uploading': return 'text-blue-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold mb-2">
            {itemType === 'lost' ? 'Report Lost Item' : 'Report Found Item'}
          </h1>
          <p className="text-muted-foreground">
            Upload a clear photo of the item you {itemType === 'lost' ? 'lost' : 'found'}
          </p>
        </div>

        {/* Type Toggle */}
        <div className="flex gap-3 mb-8">
          <button
            onClick={() => setItemType('lost')}
            className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all ${
              itemType === 'lost'
                ? 'bg-red-500 text-white shadow-md'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            I Lost an Item
          </button>
          <button
            onClick={() => setItemType('found')}
            className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all ${
              itemType === 'found'
                ? 'bg-green-500 text-white shadow-md'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            I Found an Item
          </button>
        </div>

        {/* Dropzone */}
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-300 mb-6 ${
            isDragActive
              ? 'border-violet-500 bg-violet-500/5'
              : 'border-border hover:border-violet-400 hover:bg-muted/50'
          }`}
        >
          <input {...getInputProps()} />
          <Upload className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          {isDragActive ? (
            <p className="text-xl text-violet-600">Drop the image here...</p>
          ) : (
            <div>
              <p className="text-xl font-medium mb-2">Drag and drop your image here</p>
              <p className="text-sm text-muted-foreground">or click to select a file</p>
            </div>
          )}
        </div>

        {/* Description */}
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1">
            Description <span className="text-red-500">*</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={itemType === 'lost' ? 'e.g. Black leather wallet with initials...' : 'e.g. Found a blue backpack near the park...'}
            rows={3}
            className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
          />
        </div>

        {/* Lost-only fields */}
        {itemType === 'lost' && (
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-semibold mb-1">Reward Amount (ETH)</label>
              <input
                type="number"
                min="0"
                step="0.001"
                value={rewardAmount}
                onChange={(e) => setRewardAmount(e.target.value)}
                className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Contact Phone</label>
              <input
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="+1 234 567 8900"
                className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>
          </div>
        )}

        {/* File list */}
        {files.length > 0 && (
          <div className="mb-6 space-y-4">
            {files.map((uploadedFile, index) => (
              <div key={index} className="flex items-center gap-4 p-4 bg-muted rounded-lg border border-border">
                {uploadedFile.preview ? (
                  <img src={uploadedFile.preview} alt={uploadedFile.file.name} className="w-16 h-16 object-cover rounded" />
                ) : (
                  <FileText className="w-16 h-16 text-muted-foreground" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{uploadedFile.file.name}</p>
                  <p className="text-sm text-muted-foreground">{(uploadedFile.file.size / 1024 / 1024).toFixed(2)} MB</p>
                  {uploadedFile.status === 'uploading' && (
                    <div className="mt-2">
                      <div className="w-full bg-muted rounded-full h-2">
                        <div className="bg-violet-600 h-2 rounded-full transition-all" style={{ width: `${uploadedFile.progress}%` }} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{uploadedFile.progress}%</p>
                    </div>
                  )}
                  {uploadedFile.status === 'error' && (
                    <div className="flex items-center gap-1 mt-1">
                      <AlertCircle className="w-4 h-4 text-red-600" />
                      <p className="text-sm text-red-600">{uploadedFile.error}</p>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${getStatusColor(uploadedFile.status)}`}>
                    {uploadedFile.status === 'pending' && 'Pending'}
                    {uploadedFile.status === 'uploading' && 'Uploading...'}
                    {uploadedFile.status === 'success' && '✓ Uploaded'}
                    {uploadedFile.status === 'error' && '✗ Failed'}
                  </span>
                  {uploadedFile.status !== 'uploading' && (
                    <button onClick={() => removeFile(index)} className="p-1 hover:bg-muted rounded-full transition-colors">
                      <X className="w-5 h-5 text-muted-foreground" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {formError && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl mb-4">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-sm text-red-600">{formError}</p>
          </div>
        )}

        <button
          onClick={uploadFiles}
          disabled={isUploading || files.every(f => f.status === 'success')}
          className={`w-full py-3 px-6 rounded-xl font-semibold text-white transition-all duration-300 ${
            isUploading || files.every(f => f.status === 'success')
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-violet-600 hover:bg-violet-700 hover:shadow-lg'
          }`}
        >
          {isUploading ? 'Uploading...' : `Submit ${itemType === 'lost' ? 'Lost' : 'Found'} Item`}
        </button>
      </main>
    </div>
  );
}

export default function UploadPage() {
  return (
    <Suspense>
      <UploadForm />
    </Suspense>
  );
}