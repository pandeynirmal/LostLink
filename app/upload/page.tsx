'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useRouter } from 'next/navigation';
import { Upload, X, FileText, AlertCircle, MapPin } from 'lucide-react';

interface UploadedFile {
  file: File;
  preview?: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
}

export default function UploadPage() {
  const router = useRouter();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [itemType, setItemType] = useState<'lost' | 'found'>('lost');
  const [description, setDescription] = useState('');
  const [rewardAmount, setRewardAmount] = useState('0');
  const [contactPhone, setContactPhone] = useState('');
  const [rewardPaymentMethod, setRewardPaymentMethod] = useState<'offchain' | 'onchain'>('offchain');
  const [locationError, setLocationError] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [formError, setFormError] = useState('');
  const [successData, setSuccessData] = useState<any>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles: UploadedFile[] = acceptedFiles.map(file => ({
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      status: 'pending',
      progress: 0,
    }));
    // Only keep one file at a time
    setFiles(newFiles.slice(0, 1));
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.gif'] },
    maxFiles: 1,
  });

  const removeFile = () => {
    setFiles(prev => {
      if (prev[0]?.preview) URL.revokeObjectURL(prev[0].preview);
      return [];
    });
  };

  const detectLocation = () => {
    setLocating(true);
    setLocationError('');
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser.');
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude);
        setLongitude(pos.coords.longitude);
        setLocating(false);
      },
      () => {
        setLocationError('Could not detect location. You can skip this.');
        setLocating(false);
      }
    );
  };

  const uploadFile = async () => {
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
    setFiles(prev => [{ ...prev[0], status: 'uploading', progress: 0 }]);

    const formData = new FormData();
    formData.append('image', files[0].file);          // API expects 'image'
    formData.append('type', itemType);                 // API expects 'type'
    formData.append('description', description.trim());
    formData.append('rewardAmount', itemType === 'lost' ? rewardAmount : '0');
    formData.append('rewardPaymentMethod', rewardPaymentMethod);
    formData.append('contactPhone', contactPhone);
    if (latitude !== null) formData.append('latitude', String(latitude));
    if (longitude !== null) formData.append('longitude', String(longitude));

    try {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          setFiles(prev => [{ ...prev[0], progress }]);
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

      setFiles(prev => [{ ...prev[0], status: 'success', progress: 100 }]);
      setSuccessData(data);

      // Redirect to the item page after short delay
      setTimeout(() => {
        if (data.itemId) router.push(`/item/${data.itemId}`);
        else router.push('/my-uploads');
      }, 1500);

    } catch (error) {
      setFiles(prev => [{
        ...prev[0],
        status: 'error',
        error: error instanceof Error ? error.message : 'Upload failed',
      }]);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8 space-y-6">
          <div>
            <h1 className="text-4xl font-bold text-gray-800 mb-1">Report Item</h1>
            <p className="text-gray-500">Upload a photo and describe your lost or found item.</p>
          </div>

          {/* Type Toggle */}
          <div className="flex gap-3">
            <button
              onClick={() => setItemType('lost')}
              className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all ${
                itemType === 'lost'
                  ? 'bg-red-500 text-white shadow-md'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              I Lost an Item
            </button>
            <button
              onClick={() => setItemType('found')}
              className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all ${
                itemType === 'found'
                  ? 'bg-green-500 text-white shadow-md'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              I Found an Item
            </button>
          </div>

          {/* Dropzone */}
          {files.length === 0 ? (
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
                isDragActive
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
              }`}
            >
              <input {...getInputProps()} />
              <Upload className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              {isDragActive ? (
                <p className="text-blue-600">Drop the image here...</p>
              ) : (
                <div>
                  <p className="text-gray-700 font-medium">Drag & drop your image here</p>
                  <p className="text-sm text-gray-400 mt-1">or click to select a file</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
              {files[0].preview ? (
                <img
                  src={files[0].preview}
                  alt="preview"
                  className="w-20 h-20 object-cover rounded-lg"
                />
              ) : (
                <FileText className="w-16 h-16 text-gray-400" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 truncate">{files[0].file.name}</p>
                <p className="text-sm text-gray-500">{(files[0].file.size / 1024 / 1024).toFixed(2)} MB</p>
                {files[0].status === 'uploading' && (
                  <div className="mt-2">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${files[0].progress}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{files[0].progress}%</p>
                  </div>
                )}
                {files[0].status === 'error' && (
                  <div className="flex items-center gap-1 mt-1">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <p className="text-sm text-red-500">{files[0].error}</p>
                  </div>
                )}
                {files[0].status === 'success' && (
                  <p className="text-sm text-green-600 mt-1 font-medium">✓ Uploaded successfully</p>
                )}
              </div>
              {files[0].status !== 'uploading' && files[0].status !== 'success' && (
                <button onClick={removeFile} className="p-1 hover:bg-gray-200 rounded-full">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              )}
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={itemType === 'lost' ? 'e.g. Black leather wallet with initials JD...' : 'e.g. Found a blue backpack near the park...'}
              rows={3}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            />
          </div>

          {/* Lost-only fields */}
          {itemType === 'lost' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Reward Amount (ETH)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={rewardAmount}
                    onChange={(e) => setRewardAmount(e.target.value)}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Contact Phone</label>
                  <input
                    type="tel"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="+1 234 567 8900"
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Reward Payment Method</label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="offchain"
                      checked={rewardPaymentMethod === 'offchain'}
                      onChange={() => setRewardPaymentMethod('offchain')}
                      className="accent-blue-500"
                    />
                    <span className="text-sm text-gray-700">Off-chain</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="onchain"
                      checked={rewardPaymentMethod === 'onchain'}
                      onChange={() => setRewardPaymentMethod('onchain')}
                      className="accent-blue-500"
                    />
                    <span className="text-sm text-gray-700">On-chain (MetaMask)</span>
                  </label>
                </div>
              </div>
            </>
          )}

          {/* Location */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Location (optional)</label>
            <button
              type="button"
              onClick={detectLocation}
              disabled={locating}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <MapPin className="w-4 h-4 text-blue-500" />
              {locating ? 'Detecting...' : latitude ? `${latitude.toFixed(4)}, ${longitude?.toFixed(4)}` : 'Detect my location'}
            </button>
            {locationError && <p className="text-xs text-red-500 mt-1">{locationError}</p>}
          </div>

          {/* Errors */}
          {formError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-600">{formError}</p>
            </div>
          )}

          {/* Success */}
          {successData && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-xl">
              <p className="text-sm text-green-700 font-medium">
                {successData.message || 'Item uploaded successfully!'} Redirecting...
              </p>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={uploadFile}
            disabled={isUploading || files[0]?.status === 'success'}
            className={`w-full py-3 px-6 rounded-xl font-semibold text-white transition-all ${
              isUploading || files[0]?.status === 'success'
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 hover:shadow-lg'
            }`}
          >
            {isUploading ? 'Uploading...' : `Submit ${itemType === 'lost' ? 'Lost' : 'Found'} Item`}
          </button>
        </div>
      </div>
    </div>
  );
}