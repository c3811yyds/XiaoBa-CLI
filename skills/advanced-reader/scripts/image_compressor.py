"""图片压缩模块 - Claude Code 风格"""
import os
import sys
from PIL import Image
from config import MAX_DIMENSION, COMPRESS_QUALITY

MAX_IMAGE_SIZE = 8 * 1024 * 1024

def resize_image(img, max_dim=MAX_DIMENSION):
    width, height = img.size
    if width <= max_dim and height <= max_dim:
        return img, False
    if width > height:
        new_w, new_h = max_dim, int(height * max_dim / width)
    else:
        new_h, new_w = max_dim, int(width * max_dim / height)
    return img.resize((new_w, new_h), Image.Resampling.LANCZOS), True

def compress_image(image_path, output_path=None):
    image_path = os.path.abspath(image_path)
    if output_path is None:
        output_path = image_path
    original_size = os.path.getsize(image_path)
    print(f"  原始: {original_size / 1024:.1f} KB")
    img = Image.open(image_path)
    if img.mode in ('RGBA', 'LA', 'P'):
        bg = Image.new('RGB', img.size, (255, 255, 255))
        if img.mode == 'P':
            img = img.convert('RGBA')
        if img.mode == 'RGBA':
            bg.paste(img, mask=img.split()[-1])
        else:
            bg.paste(img)
        img = bg
    img, was_resized = resize_image(img)
    if was_resized:
        print(f"  缩放: {img.size}")
    quality = COMPRESS_QUALITY
    temp_path = image_path.replace('.png', '_temp.jpg')
    for _ in range(15):
        img.save(temp_path, 'JPEG', quality=quality, optimize=True)
        size = os.path.getsize(temp_path)
        if size <= MAX_IMAGE_SIZE:
            os.replace(temp_path, output_path)
            print(f"  压缩: {size / 1024:.1f} KB (quality={quality})")
            return output_path
        quality -= 5
        if quality < 30:
            img, _ = resize_image(img, int(min(img.size) * 0.8))
            quality = 70
    os.replace(temp_path, output_path)
    return output_path

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python image_compressor.py <图片路径>")
    else:
        compress_image(sys.argv[1])
