import axios from 'axios'
import FormData from 'form-data'
import { Readable } from 'stream'

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:5001'

export async function getEmbedding(fileBuffer: Buffer, filename: string): Promise<number[]> {
    const form = new FormData()

    // Convert buffer to stream for form-data
    const stream = Readable.from(fileBuffer)
    form.append('image', stream, { filename })

    try {
        const response = await axios.post(`${PYTHON_SERVICE_URL}/process_image`, form, {
            headers: {
                ...form.getHeaders(),
            },
            timeout: 30000, // 30 second timeout
        })

        return response.data.embedding
    } catch (error) {
        if (axios.isAxiosError(error)) {
            if (error.code === 'ECONNREFUSED') {
                throw new Error('AI Service is not running. Please start it with: cd python_service && python ai_app.py')
            }
            throw new Error(`AI Service Error: ${error.message}`)
        }
        throw error
    }
}

export async function getMatchScore(
    embedding1: number[],
    embedding2: number[]
): Promise<{ match_score: number; is_match: boolean }> {
    try {
        const response = await axios.post(
            `${PYTHON_SERVICE_URL}/match`,
            {
                embedding1,
                embedding2,
            },
            {
                timeout: 10000, // 10 second timeout
            }
        )

        return response.data
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error('AI Match Error:', error.message)
        }
        return { match_score: 0, is_match: false }
    }
}

export async function getTextEmbedding(text: string): Promise<number[]> {
    try {
        const response = await axios.post(
            `${PYTHON_SERVICE_URL}/process_text`,
            { text },
            {
                timeout: 10000, // 10 second timeout
            }
        )

        return response.data.embedding
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error('AI Text Processing Error:', error.message)
        }
        throw error
    }
}

export async function getTextMatchScore(
    textEmbedding1: number[],
    textEmbedding2: number[]
): Promise<{ match_score: number; is_match: boolean }> {
    try {
        const response = await axios.post(
            `${PYTHON_SERVICE_URL}/match_text`,
            {
                text_embedding1: textEmbedding1,
                text_embedding2: textEmbedding2,
            },
            {
                timeout: 10000, // 10 second timeout
            }
        )

        return response.data
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error('AI Text Match Error:', error.message)
        }
        return { match_score: 0, is_match: false }
    }
}

export async function getCombinedMatchScore(
    imageEmbedding1: number[],
    imageEmbedding2: number[],
    textEmbedding1: number[],
    textEmbedding2: number[],
    weights?: { image: number; text: number }
): Promise<{
    combined_match_score: number
    image_match_score: number
    text_match_score: number
    is_match: boolean
    confidence: number
}> {
    try {
        const response = await axios.post(
            `${PYTHON_SERVICE_URL}/match_combined`,
            {
                image_embedding1: imageEmbedding1,
                image_embedding2: imageEmbedding2,
                text_embedding1: textEmbedding1,
                text_embedding2: textEmbedding2,
                weights: weights || { image: 0.6, text: 0.4 },
            },
            {
                timeout: 10000, // 10 second timeout
            }
        )

        return response.data
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error('AI Combined Match Error:', error.message)
        }
        return {
            combined_match_score: 0,
            image_match_score: 0,
            text_match_score: 0,
            is_match: false,
            confidence: 0,
        }
    }
}

export async function checkAIServiceHealth(): Promise<boolean> {
    try {
        await axios.get(`${PYTHON_SERVICE_URL}/health`, { timeout: 5000 })
        return true
    } catch (error) {
        return false
    }
}
