"""视觉分析模块 - 调用 Claude 视觉模型"""
import os
import sys
import base64
import time
import requests
from config import API_KEY, BASE_URL, MODEL, MAX_IMAGE_SIZE
from image_compressor import compress_image

def encode_image(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")

def get_media_type(path):
    if path.lower().endswith('.png'): return "image/png"
    elif path.lower().endswith(('.jpg', '.jpeg')): return "image/jpeg"
    elif path.lower().endswith('.gif'): return "image/gif"
    elif path.lower().endswith('.webp'): return "image/webp"
    return "image/png"

def call_vision_api(contents, max_tokens=1024):
    """带重试的 API 调用"""
    for attempt in range(3):
        try:
            response = requests.post(
                f"{BASE_URL}/v1/messages",
                headers={
                    "Authorization": f"Bearer {API_KEY}",
                    "Content-Type": "application/json",
                    "anthropic-version": "2023-06-01"
                },
                json={"model": MODEL, "max_tokens": max_tokens, "messages": [{"role": "user", "content": contents}]},
                timeout=120
            )
            if response.status_code == 200:
                return response.json()
            elif "AWS服务异常" in response.text or response.status_code >= 500:
                print(f"  重试 {attempt + 1}/3...")
                time.sleep(2)
                continue
            else:
                raise Exception(f"API 错误 {response.status_code}: {response.text}")
        except requests.exceptions.RequestException as e:
            if attempt < 2:
                print(f"  网络错误，重试 {attempt + 1}/3...")
                time.sleep(2)
                continue
            raise
    raise Exception("API 重试失败")

def analyze_image(image_path, prompt="描述这张图片的内容", compress=True):
    image_path = os.path.abspath(image_path)
    original_size = os.path.getsize(image_path)
    if compress and original_size > MAX_IMAGE_SIZE:
        print(f"  原始: {original_size / 1024:.1f} KB > 8MB，执行压缩...")
        image_path = compress_image(image_path)
    else:
        print(f"  图片: {original_size / 1024:.1f} KB")
    image_data = encode_image(image_path)
    contents = [
        {"type": "image", "source": {"type": "base64", "media_type": get_media_type(image_path), "data": image_data}},
        {"type": "text", "text": prompt}
    ]
    result = call_vision_api(contents)
    return result["content"][0]["text"]

def analyze_images(image_paths, prompt="描述这些图片的内容"):
    contents = []
    for path in image_paths:
        path = os.path.abspath(path)
        size = os.path.getsize(path)
        if size > MAX_IMAGE_SIZE:
            print(f"  压缩: {os.path.basename(path)} ({size / 1024:.1f} KB)")
            path = compress_image(path)
        contents.append({"type": "image", "source": {"type": "base64", "media_type": get_media_type(path), "data": encode_image(path)}})
        print(f"  加载: {os.path.basename(path)} ({os.path.getsize(path) / 1024:.1f} KB)")
    contents.append({"type": "text", "text": prompt})
    result = call_vision_api(contents, max_tokens=2048)
    return result["content"][0]["text"]

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python vision_analyzer.py <图片路径> [提示词]")
    else:
        image_file = sys.argv[1]
        prompt = sys.argv[2] if len(sys.argv) > 2 else "详细描述这张图片的内容"
        print(f"正在分析: {image_file}")
        print(analyze_image(image_file, prompt))
