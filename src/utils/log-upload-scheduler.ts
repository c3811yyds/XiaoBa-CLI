import { LogUploader } from '../utils/log-uploader';
import { ConfigManager } from '../utils/config';
import { Logger } from '../utils/logger';
import path from 'path';

export class LogUploadScheduler {
  private uploader: LogUploader | null = null;
  private timer: NodeJS.Timeout | null = null;

  start() {
    const config = ConfigManager.getConfig();
    
    if (!config.logUpload?.enabled || !config.logUpload?.serverUrl) {
      return;
    }

    const logsDir = path.join(process.cwd(), 'logs');
    this.uploader = new LogUploader(config.logUpload.serverUrl, logsDir);

    const intervalMinutes = config.logUpload.intervalMinutes || 30;
    const intervalMs = intervalMinutes * 60 * 1000;

    // 立即执行一次
    this.uploadNow();

    // 定时执行
    this.timer = setInterval(() => {
      this.uploadNow();
    }, intervalMs);

    Logger.info(`Log upload scheduler started (interval: ${intervalMinutes} min)`);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async uploadNow() {
    if (!this.uploader) return;

    try {
      const count = await this.uploader.uploadAll();
      if (count > 0) {
        Logger.info(`Uploaded ${count} log entries`);
      }
    } catch (error: any) {
      Logger.error(`Log upload failed: ${error.message}`);
    }
  }
}
