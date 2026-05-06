/**
 * 测试配置示例
 * 复制为 test-config.ts 并填入实际值
 */

export interface TestConfig {
  /** Tester Bot 配置 */
  tester: {
    apiKey: string;      // 如 "cc_bot_tester_xxx"
    serverUrl: string;   // 如 "ws://localhost:6061/v0/channels"
  };

  /** 被测 Agent (小八) 配置 */
  target: {
    apiKey: string;      // 如 "cc_bot_xiaoba_xxx"
    serverUrl: string;
  };

  /** 固定测试 topic */
  testTopic: string;     // 如 "p2p_tester_xiaoba"
}

export const testConfig: TestConfig = {
  tester: {
    apiKey: process.env.TESTER_BOT_API_KEY || '',
    serverUrl: process.env.CATS_SERVER_URL || 'ws://localhost:6061/v0/channels',
  },
  target: {
    apiKey: process.env.TARGET_BOT_API_KEY || '',
    serverUrl: process.env.CATS_SERVER_URL || 'ws://localhost:6061/v0/channels',
  },
  testTopic: process.env.TEST_TOPIC || 'p2p_test',
};
