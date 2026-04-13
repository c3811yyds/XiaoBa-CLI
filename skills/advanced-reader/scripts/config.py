"""视觉分析技能 - 配置文件"""
import os

API_KEY = "sk-ant-oat01-RGKn219y1sJbP6GTeSNfJjyXlbi3MLN12JsO1jAcmULXNufxOAVRseReNKCPWkbWQ8cYP_PZ4g5qFD72BqJD7GRpe1IPQAA"
BASE_URL = "https://code.newcli.com/claude/ultra"
MODEL = "claude-opus-4-6"

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WORK_DIR = os.path.dirname(SCRIPT_DIR)
OUTPUT_DIR = os.path.join(WORK_DIR, "test_outputs")
os.makedirs(OUTPUT_DIR, exist_ok=True)

MAX_IMAGE_SIZE = 8 * 1024 * 1024
MAX_DIMENSION = 2048
COMPRESS_QUALITY = 85
PDF_DPI = 150
