import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.feature_extraction.text import TfidfVectorizer
import io
import string
import tensorflow as tf
from tensorflow.keras.applications import MobileNetV2
from tensorflow.keras.applications.mobilenet_v2 import preprocess_input

_mobilenet = None

def get_mobilenet():
    global _mobilenet
    if _mobilenet is None:
        base = MobileNetV2(weights='imagenet', include_top=False, pooling='avg')
        _mobilenet = base
    return _mobilenet
app = Flask(__name__)
CORS(app)

# TF-IDF for text
tfidf_vectorizer = TfidfVectorizer(
    max_features=512,
    lowercase=True,
    stop_words='english',
    ngram_range=(1, 2),
    min_df=1
)
_text_vocabulary = None


def preprocess_text(text):
    text = str(text).lower()
    text = text.translate(str.maketrans('', '', string.punctuation))
    return text


def get_text_embedding(text):
    global _text_vocabulary
    processed_text = preprocess_text(text)
    if _text_vocabulary is None:
        fitted = tfidf_vectorizer.fit_transform([processed_text])
        _text_vocabulary = tfidf_vectorizer
        return fitted.toarray().flatten()
    else:
        transformed = _text_vocabulary.transform([processed_text])
        return transformed.toarray().flatten()


def get_image_embedding(image):
    model = get_mobilenet()
    image = image.resize((224, 224)).convert('RGB')
    img_array = tf.keras.preprocessing.image.img_to_array(image)
    img_array = np.expand_dims(img_array, axis=0)
    img_array = preprocess_input(img_array)
    features = model.predict(img_array, verbose=0).flatten()
    norm = np.linalg.norm(features)
    if norm > 0:
        features = features / norm
    return features


@app.route('/process_image', methods=['POST'])
def process_image():
    if 'image' not in request.files:
        return jsonify({"error": "No image provided"}), 400

    file = request.files['image']
    try:
        image = Image.open(file.stream).convert('RGB')
        embedding = get_image_embedding(image)
        return jsonify({
            "message": "Processed successfully",
            "embedding": embedding.tolist()
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/match', methods=['POST'])
def match_embeddings():
    data = request.json
    if not data or 'embedding1' not in data or 'embedding2' not in data:
        return jsonify({"error": "Missing embeddings"}), 400

    emb1 = np.array(data['embedding1']).reshape(1, -1)
    emb2 = np.array(data['embedding2']).reshape(1, -1)
    score = cosine_similarity(emb1, emb2)[0][0]

    return jsonify({
        "match_score": float(score),
        "is_match": bool(score > 0.8)
    })


@app.route('/process_text', methods=['POST'])
def process_text():
    data = request.json
    if not data or 'text' not in data:
        return jsonify({"error": "No text provided"}), 400

    try:
        embedding = get_text_embedding(data['text'])
        return jsonify({
            "message": "Text processed successfully",
            "embedding": embedding.tolist()
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/match_text', methods=['POST'])
def match_text():
    data = request.json
    if not data or 'text_embedding1' not in data or 'text_embedding2' not in data:
        return jsonify({"error": "Missing text embeddings"}), 400

    emb1 = np.array(data['text_embedding1']).reshape(1, -1)
    emb2 = np.array(data['text_embedding2']).reshape(1, -1)
    score = cosine_similarity(emb1, emb2)[0][0]

    return jsonify({
        "match_score": float(score),
        "is_match": bool(score > 0.75)
    })


@app.route('/match_combined', methods=['POST'])
def match_combined():
    data = request.json
    if not data:
        return jsonify({"error": "Missing data"}), 400

    required_fields = ['image_embedding1', 'image_embedding2', 'text_embedding1', 'text_embedding2']
    if not all(field in data for field in required_fields):
        return jsonify({"error": "Missing required embeddings"}), 400

    try:
        weights = data.get('weights', {'image': 0.3, 'text': 0.7})
        image_weight = weights.get('image', 0.3)
        text_weight = weights.get('text', 0.7)
        total_weight = image_weight + text_weight
        image_weight /= total_weight
        text_weight /= total_weight

        img_emb1 = np.array(data['image_embedding1']).reshape(1, -1)
        img_emb2 = np.array(data['image_embedding2']).reshape(1, -1)
        image_score = cosine_similarity(img_emb1, img_emb2)[0][0]

        txt_emb1 = np.array(data['text_embedding1']).reshape(1, -1)
        txt_emb2 = np.array(data['text_embedding2']).reshape(1, -1)
        text_score = cosine_similarity(txt_emb1, txt_emb2)[0][0]

        combined_score = (image_score * image_weight) + (text_score * text_weight)

        return jsonify({
            "combined_match_score": float(combined_score),
            "image_match_score": float(image_score),
            "text_match_score": float(text_score),
            "is_match": bool(combined_score > 0.75),
            "confidence": float(combined_score)
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy", "message": "AI service is running"})


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 4300))
    app.run(host='0.0.0.0', port=port)
