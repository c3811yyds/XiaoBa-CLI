"""PDF 转图片模块 - 使用 PyMuPDF"""
import os
import sys
import fitz
from config import OUTPUT_DIR, PDF_DPI

def pdf_to_images(pdf_path, output_dir=None, dpi=PDF_DPI):
    if output_dir is None:
        output_dir = OUTPUT_DIR
    pdf_path = os.path.abspath(pdf_path)
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"PDF 文件不存在: {pdf_path}")
    doc = fitz.open(pdf_path)
    image_paths = []
    base_name = os.path.splitext(os.path.basename(pdf_path))[0]
    for page_num in range(len(doc)):
        page = doc[page_num]
        zoom = dpi / 72
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat)
        output_path = os.path.join(output_dir, f"{base_name}_page{page_num + 1}.png")
        pix.save(output_path)
        image_paths.append(output_path)
        print(f"  页面 {page_num + 1} -> {output_path}")
    doc.close()
    return image_paths

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python pdf_to_images.py <pdf文件路径>")
    else:
        images = pdf_to_images(sys.argv[1])
        print(f"转换完成! 共 {len(images)} 页")
