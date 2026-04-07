import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { Logger } from './logger';

interface UploadState {
  [key: string]: {
    lastUploadTime: string;
    uploadedTurns: number;
  };
}

export class LogUploader {
  private serverUrl: string;
  private logsDir: string;
  private stateFile: string;
  private state: UploadState = {};

  constructor(serverUrl: string, logsDir: string) {
    this.serverUrl = serverUrl;
    this.logsDir = logsDir;
    this.stateFile = path.join(logsDir, '.upload-state.json');
    this.loadState();
  }

  private loadState() {
    if (fs.existsSync(this.stateFile)) {
      this.state = JSON.parse(fs.readFileSync(this.stateFile, 'utf-8'));
    }
  }

  private saveState() {
    fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));
  }

  async uploadAll() {
    const platforms = ['chat', 'catscompany', 'cli'];
    let totalUploaded = 0;

    for (const platform of platforms) {
      const platformDir = path.join(this.logsDir, 'sessions', platform);
      if (!fs.existsSync(platformDir)) continue;

      const dates = fs.readdirSync(platformDir);
      for (const date of dates) {
        const dateDir = path.join(platformDir, date);
        if (!fs.statSync(dateDir).isDirectory()) continue;

        const files = fs.readdirSync(dateDir).filter(f => f.endsWith('.jsonl'));
        for (const file of files) {
          const uploaded = await this.uploadFile(platform, date, file);
          totalUploaded += uploaded;
        }
      }
    }

    return totalUploaded;
  }

  private async uploadFile(platform: string, date: string, filename: string): Promise<number> {
    const filePath = path.join(this.logsDir, 'sessions', platform, date, filename);
    const session_id = filename.replace('.jsonl', '');
    const stateKey = `${platform}/${date}/${session_id}`;

    // 读取日志
    const content = fs.readFileSync(filePath, 'utf-8').trim();
    if (!content) return 0;

    const allLogs = content.split('\n').map(line => JSON.parse(line));
    
    // 检查已上传的数量
    const uploadedCount = this.state[stateKey]?.uploadedTurns || 0;
    const newLogs = allLogs.slice(uploadedCount);

    if (newLogs.length === 0) return 0;

    // 提取 agent_id
    const agent_id = session_id;

    try {
      const response = await axios.post(`${this.serverUrl}/api/logs/upload`, {
        agent_id,
        date,
        platform,
        session_id,
        logs: newLogs,
      }, { timeout: 30000 });

      if (response.data.success) {
        this.state[stateKey] = {
          lastUploadTime: new Date().toISOString(),
          uploadedTurns: allLogs.length,
        };
        this.saveState();
        Logger.info(`Uploaded ${newLogs.length} logs for ${stateKey}`);
        return newLogs.length;
      }
    } catch (error: any) {
      Logger.error(`Failed to upload ${stateKey}: ${error.message}`);
    }

    return 0;
  }
}
