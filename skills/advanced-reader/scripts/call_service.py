"""
调用 Advanced Reader 微服务
"""
import os
import sys
import requests

# 微服务地址（可配置）
SERVICE_URL = os.environ.get("ADVANCED_READER_URL", "http://localhost:8000")


def analyze_file(file_path: str, prompt: str = "详细描述这张图片/文档的内容") -> str:
    """
    分析图片或 PDF
    
    Args:
        file_path: 文件路径
        prompt: 分析提示词
    
    Returns:
        分析结果文本
    """
    file_path = os.path.abspath(file_path)
    
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"文件不存在: {file_path}")
    
    with open(file_path, 'rb') as f:
        files = {'file': (os.path.basename(file_path), f)}
        data = {'prompt': prompt}
        
        response = requests.post(
            f"{SERVICE_URL}/analyze",
            files=files,
            data=data,
            timeout=300
        )
    
    if response.status_code != 200:
        raise Exception(f"服务错误: {response.status_code} - {response.text}")
    
    result = response.json()
    return result.get("analysis", "")


def analyze_batch(file_paths: list, prompt: str = "描述这些图片的内容") -> str:
    """
    批量分析多张图片
    
    Args:
        file_paths: 文件路径列表
        prompt: 分析提示词
    
    Returns:
        分析结果文本
    """
    files = []
    for path in file_paths:
        path = os.path.abspath(path)
        if not os.path.exists(path):
            raise FileNotFoundError(f"文件不存在: {path}")
        files.append(('files', (os.path.basename(path), open(path, 'rb'))))
    
    data = {'prompt': prompt}
    
    response = requests.post(
        f"{SERVICE_URL}/analyze/batch",
        files=files,
        data=data,
        timeout=300
    )
    
    # 关闭文件
    for _, (_, f) in files:
        f.close()
    
    if response.status_code != 200:
        raise Exception(f"服务错误: {response.status_code} - {response.text}")
    
    result = response.json()
    return result.get("analysis", "")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法:")
        print("  python call_service.py <文件路径> [提示词]")
        print("  python call_service.py file.png '描述这张图'")
        sys.exit(1)
    
    file_path = sys.argv[1]
    prompt = sys.argv[2] if len(sys.argv) > 2 else "详细描述这张图片/文档的内容"
    
    print(f"正在分析: {file_path}")
    result = analyze_file(file_path, prompt)
    print(f"\n结果:\n{result}")
