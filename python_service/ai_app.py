
import os
import torch
import torchvision.models as models
import torchvision.transforms as transforms
from PIL import Image
from flask import Flask, request, jsonify
from flask_cors import CORS
from ultralytics import YOLO
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.feature_extraction.text import TfidfVectorizer
import io
import string

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# --- Load Models ---
print("Loading YOLOv8 model...")
# 'yolov8n.pt' will be downloaded automatically if not present
yolo_model = YOLO('yolov8n.pt') 

print("Loading ResNet model...")
# Load pre-trained ResNet50
resnet = models.resnet50(weights=models.ResNet50_Weights.IMAGENET1K_V1)
# Remove the final classification layer to get embeddings
modules = list(resnet.children())[:-1]
feature_extractor = torch.nn.Sequential(*modules)
feature_extractor.eval()

# --- Preprocessing ---
preprocess = transforms.Compose([
    transforms.Resize(256),
    transforms.CenterCrop(224),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])

# --- Text Feature Extraction ---
# Initialize TF-IDF vectorizer for text embeddings
tfidf_vectorizer = TfidfVectorizer(
    max_features=512,
    lowercase=True,
    stop_words='english',
    ngram_range=(1, 2),
    min_df=1
)

# Store a fitted vectorizer with vocabulary for consistency
_text_vocabulary = None

def preprocess_text(text):
    """
    Preprocesses text by converting to lowercase, removing punctuation.
    """
    text = str(text).lower()
    text = text.translate(str.maketrans('', '', string.punctuation))
    return text

def get_text_embedding(text):
    """
    Extracts feature embedding from text using TF-IDF.
    """
    global _text_vocabulary
    
    processed_text = preprocess_text(text)
    
    # For batch fitting with vocabulary
    if _text_vocabulary is None:
        # Initialize with the text itself on first call
        fitted = tfidf_vectorizer.fit_transform([processed_text])
        _text_vocabulary = tfidf_vectorizer
        return fitted.toarray().flatten()
    else:
        # Use existing vocabulary
        transformed = _text_vocabulary.transform([processed_text])
        return transformed.toarray().flatten()

def get_embedding(image):
    """
    Extracts feature embedding from a PIL Image using ResNet.
    """
    img_tensor = preprocess(image).unsqueeze(0) # Add batch dimension
    with torch.no_grad():
        embedding = feature_extractor(img_tensor)
    # Flatten: [1, 2048, 1, 1] -> [2048]
    return embedding.flatten().numpy()

def detect_and_crop(image):
    """
    Uses YOLOv8 to detect objects. Returns the crop of the highest confidence object.
    If no object detected, returns original image.
    """
    results = yolo_model(image)
    
    # Process the first result
    result = results[0]
    boxes = result.boxes
    
    if len(boxes) == 0:
        return image
    
    # Find box with highest confidence
    # boxes.conf is a tensor of shape (N,)
    # boxes.xyxy is a tensor of shape (N, 4)
    best_idx = torch.argmax(boxes.conf).item()
    box = boxes.xyxy[best_idx].cpu().numpy() # [x1, y1, x2, y2]
    
    # Crop
    # PIL crop expects (left, upper, right, lower)
    cropped_image = image.crop((box[0], box[1], box[2], box[3]))
    return cropped_image

@app.route('/process_image', methods=['POST'])
def process_image():
    if 'image' not in request.files:
        return jsonify({"error": "No image provided"}), 400
    
    file = request.files['image']
    try:
        image = Image.open(file.stream).convert('RGB')
        
        # 1. Detect and Crop
        cropped_img = detect_and_crop(image)
        
        # 2. Extract Features
        embedding = get_embedding(cropped_img)
        
        return jsonify({
            "message": "Processed successfully",
            "embedding": embedding.tolist()
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/match', methods=['POST'])
def match_embeddings():
    """
    Calculates cosine similarity between two embeddings.
    Expects JSON: { "embedding1": [...], "embedding2": [...] }
    """
    data = request.json
    if not data or 'embedding1' not in data or 'embedding2' not in data:
        return jsonify({"error": "Missing embeddings"}), 400
    
    emb1 = np.array(data['embedding1']).reshape(1, -1)
    emb2 = np.array(data['embedding2']).reshape(1, -1)
    
    score = cosine_similarity(emb1, emb2)[0][0]
    
    return jsonify({
        "match_score": float(score),
        "is_match": bool(score > 0.8) # Simple threshold
    })

@app.route('/process_text', methods=['POST'])
def process_text():
    """
    Extracts text embedding from description.
    Expects JSON: { "text": "description..." }
    """
    data = request.json
    if not data or 'text' not in data:
        return jsonify({"error": "No text provided"}), 400
    
    try:
        text = data['text']
        embedding = get_text_embedding(text)
        
        return jsonify({
            "message": "Text processed successfully",
            "embedding": embedding.tolist()
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/match_text', methods=['POST'])
def match_text():
    """
    Calculates similarity between two text embeddings.
    Expects JSON: { "text_embedding1": [...], "text_embedding2": [...] }
    """
    data = request.json
    if not data or 'text_embedding1' not in data or 'text_embedding2' not in data:
        return jsonify({"error": "Missing text embeddings"}), 400
    
    emb1 = np.array(data['text_embedding1']).reshape(1, -1)
    emb2 = np.array(data['text_embedding2']).reshape(1, -1)
    
    score = cosine_similarity(emb1, emb2)[0][0]
    
    return jsonify({
        "match_score": float(score),
        "is_match": bool(score > 0.75)  # Slightly lower threshold for text
    })

@app.route('/match_combined', methods=['POST'])
def match_combined():
    """
    Calculates combined similarity using both image and text embeddings.
    Expects JSON: {
        "image_embedding1": [...],
        "image_embedding2": [...],
        "text_embedding1": [...],
        "text_embedding2": [...],
        "weights": {"image": 0.6, "text": 0.4}  (optional)
    }
    """
    data = request.json
    if not data:
        return jsonify({"error": "Missing data"}), 400
    
    required_fields = ['image_embedding1', 'image_embedding2', 'text_embedding1', 'text_embedding2']
    if not all(field in data for field in required_fields):
        return jsonify({"error": "Missing required embeddings"}), 400
    
    try:
        # Get weights (default: 60% image, 40% text)
        weights = data.get('weights', {'image': 0.6, 'text': 0.4})
        image_weight = weights.get('image', 0.6)
        text_weight = weights.get('text', 0.4)
        
        # Normalize weights
        total_weight = image_weight + text_weight
        image_weight /= total_weight
        text_weight /= total_weight
        
        # Calculate image similarity
        img_emb1 = np.array(data['image_embedding1']).reshape(1, -1)
        img_emb2 = np.array(data['image_embedding2']).reshape(1, -1)
        image_score = cosine_similarity(img_emb1, img_emb2)[0][0]
        
        # Calculate text similarity
        txt_emb1 = np.array(data['text_embedding1']).reshape(1, -1)
        txt_emb2 = np.array(data['text_embedding2']).reshape(1, -1)
        text_score = cosine_similarity(txt_emb1, txt_emb2)[0][0]
        
        # Combined score (weighted average)
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
    """
    Health check endpoint.
    """
    return jsonify({
        "status": "healthy",
        "message": "AI service is running"
    })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 4300))
    app.run(host='0.0.0.0', port=port)
