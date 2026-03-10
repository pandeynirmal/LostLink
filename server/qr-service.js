const QRCode = require('qrcode');
const crypto = require('crypto');

/**
 * QR Code Service for Lost and Found Items
 * Generates QR codes with blockchain-linked metadata
 */

class QRCodeService {
    /**
     * Generate a unique hash for QR code
     * @param {string} itemId - The item ID
     * @returns {string} - SHA256 hash
     */
    static generateQRHash(itemId) {
        const timestamp = Date.now();
        const data = `${itemId}-${timestamp}`;
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    /**
     * Generate QR code as data URL
     * @param {string} itemId - The item ID
     * @param {string} qrHash - The QR code hash
     * @returns {Promise<{dataUrl: string, hash: string}>}
     */
    static async generateQRCode(itemId, qrHash = null) {
        try {
            const hash = qrHash || this.generateQRHash(itemId);

            // Create QR code data with item metadata
            const qrData = JSON.stringify({
                itemId: itemId,
                hash: hash,
                timestamp: Date.now(),
                type: 'blockchain-lost-found'
            });

            // Generate QR code as data URL
            const dataUrl = await QRCode.toDataURL(qrData, {
                errorCorrectionLevel: 'H',
                type: 'image/png',
                quality: 0.95,
                margin: 1,
                width: 400,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            });

            return {
                dataUrl: dataUrl,
                hash: hash,
                qrData: qrData
            };
        } catch (error) {
            console.error('QR Code generation error:', error);
            throw new Error('Failed to generate QR code');
        }
    }

    /**
     * Generate QR code as buffer (for file download)
     * @param {string} itemId - The item ID
     * @param {string} qrHash - The QR code hash
     * @returns {Promise<{buffer: Buffer, hash: string}>}
     */
    static async generateQRCodeBuffer(itemId, qrHash = null) {
        try {
            const hash = qrHash || this.generateQRHash(itemId);

            const qrData = JSON.stringify({
                itemId: itemId,
                hash: hash,
                timestamp: Date.now(),
                type: 'blockchain-lost-found'
            });

            const buffer = await QRCode.toBuffer(qrData, {
                errorCorrectionLevel: 'H',
                type: 'png',
                quality: 0.95,
                margin: 1,
                width: 400
            });

            return {
                buffer: buffer,
                hash: hash
            };
        } catch (error) {
            console.error('QR Code buffer generation error:', error);
            throw new Error('Failed to generate QR code buffer');
        }
    }

    /**
     * Decode QR code data
     * @param {string} qrDataString - The QR code data string
     * @returns {Object} - Parsed QR data
     */
    static decodeQRData(qrDataString) {
        try {
            const data = JSON.parse(qrDataString);

            if (data.type !== 'blockchain-lost-found') {
                throw new Error('Invalid QR code type');
            }

            return {
                itemId: data.itemId,
                hash: data.hash,
                timestamp: data.timestamp
            };
        } catch (error) {
            console.error('QR decode error:', error);
            throw new Error('Invalid QR code format');
        }
    }

    /**
     * Validate QR code hash
     * @param {string} hash - The hash to validate
     * @param {string} itemId - The item ID
     * @returns {boolean}
     */
    static validateQRHash(hash, itemId) {
        // Basic validation - check if hash exists and is valid format
        if (!hash || typeof hash !== 'string' || hash.length !== 64) {
            return false;
        }
        return true;
    }
}

module.exports = QRCodeService;
