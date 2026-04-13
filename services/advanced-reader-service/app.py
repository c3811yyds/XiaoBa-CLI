"""
Advanced Reader Service
基于 Claude Vision 的云端文件分析服务
"""
import base64
import time
from io import BytesIO

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from PIL import Image
import fitz
import requests

API_KEY = "sk-ant-oat01-RGKn219y1sJbP6GTeSNfJjyXlbi3MLN12JsO1jAcmULXNufxOAVRseReNKCPWkbWQ8cYP_PZ4g5qFD72BqJD7GRpe1IPQAA"
BASE_URL = "https://code.newcli.com/claude/ultra"
MODEL = "claude-opus-4-6"
MAX_FILE_SIZE = 50 * 1024 * 1024
MAX_IMAGE_SIZE = 8 * 1024 * 1024
MAX_DIMENSION = 2048
COMPRESS_QUALITY = 85
PDF_DPI = 150

app = FastAPI(title="Advanced Reader Service")


def get_media_type(filename: str) -> str:
    ext = filename.lower()
    if ext.endswith('.png'): return "image/png"
    if ext.endswith(('.jpg', '.jpeg')): return "image/jpeg"
    if ext.endswith('.gif'): return "image/gif"
    if ext.endswith('.webp'): return "image/webp"
    return "image/png"


def compress_image(content: bytes) -> tuple[bytes, str]:
    """压缩图片到 < 8MB，返回 (bytes, media_type)"""
    img = Image.open(BytesIO(content))
    
    # RGBA/LA/P 转 RGB
    if img.mode in ('RGBA', 'LA', 'P'):
        bg = Image.new('RGB', img.size, (255, 255, 255))
        if img.mode == 'P':
            img = img.convert('RGBA')
        if img.mode == 'RGBA':
            bg.paste(img, mask=img.split()[-1])
        else:
            bg.paste(img)
        img = bg
    
    # 缩放
    w, h = img.size
    if max(w, h) > MAX_DIMENSION:
        if w > h:
            img = img.resize((MAX_DIMENSION, int(h * MAX_DIMENSION / w)), Image.Resampling.LANCZOS)
        else:
            img = img.resize((int(w * MAX_DIMENSION / h), MAX_DIMENSION), Image.Resampling.LANCZOS)
    
    # 迭代压缩为 JPEG
    quality = COMPRESS_QUALITY
    for _ in range(20):
        output = BytesIO()
        img.save(output, 'JPEG', quality=quality, optimize=True)
        if output.tell() <= MAX_IMAGE_SIZE:
            return output.getvalue(), "image/jpeg"
        quality -= 5
        if quality < 20:
            w, h = img.size
            img = img.resize((int(w * 0.8), int(h * 0.8)), Image.Resampling.LANCZOS)
            quality = COMPRESS_QUALITY
    
    output = BytesIO()
    img.save(output, 'JPEG', quality=quality)
    return output.getvalue(), "image/jpeg"


def pdf_to_images(content: bytes) -> list[bytes]:
    """PDF 转图片"""
    images = []
    doc = fitz.open(stream=content, filetype="pdf")
    for page in doc:
        zoom = PDF_DPI / 72
        pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
        images.append(pix.tobytes("png"))
    doc.close()
    return images


def extract_text_from_response(response_data: dict) -> str:
    """从 API 响应中提取文本"""
    for item in response_data.get("content", []):
        if item.get("type") == "text":
            return item["text"]
    raise Exception("响应中未找到文本内容")


def call_vision_api(contents: list, max_tokens: int = 1024) -> str:
    """调用视觉模型 API"""
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
                timeout=300
            )
            
            if response.status_code == 200:
                return extract_text_from_response(response.json())
            
            # 服务异常时重试
            if response.status_code >= 500 or "AWS服务异常" in response.text or "服务异常" in response.text:
                time.sleep(5)
                continue
            
            raise Exception(f"API 错误 {response.status_code}: {response.text[:200]}")
            
        except requests.exceptions.RequestException as e:
            if attempt < 2:
                time.sleep(5)
                continue
            raise Exception(f"网络错误: {str(e)}")
    
    raise Exception("API 调用失败")


@app.get("/")
def root():
    return {"service": "Advanced Reader", "status": "running"}


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.post("/analyze")
def analyze(file: UploadFile = File(...), prompt: str = Form("详细描述这张图片的内容"), max_pages: int = Form(10)):
    """分析图片或 PDF"""
    content = file.file.read()
    
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="文件过大")
    
    ext = (file.filename or "").lower()
    
    try:
        if ext.endswith('.pdf'):
            images = pdf_to_images(content)[:max_pages]
            contents = []
            for img_bytes in images:
                contents.append({"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": base64.b64encode(img_bytes).decode()}})
            contents.append({"type": "text", "text": prompt})
            result = call_vision_api(contents, max_tokens=2048)
            return {"status": "success", "type": "pdf", "analysis": result}
        
        elif ext.endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp')):
            original_size = len(content)
            
            if original_size > MAX_IMAGE_SIZE:
                content, media_type = compress_image(content)
            else:
                media_type = get_media_type(ext)
            
            result = call_vision_api([
                {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": base64.b64encode(content).decode()}},
                {"type": "text", "text": prompt}
            ])
            
            return {
                "status": "success",
                "type": "image",
                "analysis": result,
                "original_size": original_size,
                "processed_size": len(content)
            }
        
        else:
            raise HTTPException(status_code=400, detail="不支持的文件类型")
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/analyze/batch")
def analyze_batch(files: list[UploadFile] = File(...), prompt: str = Form("描述这些图片的内容")):
    """批量分析图片"""
    if len(files) > 20:
        raise HTTPException(status_code=400, detail="最多 20 张")
    
    contents = []
    for file in files:
        content = file.file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail=f"{file.filename} 过大")
        if len(content) > MAX_IMAGE_SIZE:
            content, _ = compress_image(content)
        contents.append({"type": "image", "source": {"type": "base64", "media_type": get_media_type(file.filename or "image.png"), "data": base64.b64encode(content).decode()}})
    
    contents.append({"type": "text", "text": prompt})
    
    try:
        result = call_vision_api(contents, max_tokens=2048)
        return {"status": "success", "type": "batch", "analysis": result, "count": len(files)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
