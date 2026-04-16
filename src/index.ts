#!/usr/bin/env node

import { Command } from 'commander';
import { Logger } from './utils/logger';
import { chatCommand } from './commands/chat';
import { configCommand } from './commands/config';
import { registerSkillCommand } from './commands/skill';
import { feishuCommand } from './commands/feishu';
import { runtimeCommand } from './commands/runtime';
import { APP_VERSION } from './version';

function main() {
  const program = new Command();

  Logger.brand();

  program
    .name('xiaoba')
    .description('XiaoBa agent CLI')
    .version(APP_VERSION)
    .option('-s, --skill <name>', 'Bind a skill at startup');

  program
    .command('chat')
    .description('Start a XiaoBa chat session')
    .option('-i, --interactive', 'Enter interactive mode')
    .option('-m, --message <message>', 'Send a single message')
    .option('-s, --skill <name>', 'Bind a skill at startup')
    .action(chatCommand);

  program
    .command('config')
    .description('Configure XiaoBa API settings')
    .action(configCommand);

  program
    .command('feishu')
    .description('Start the Feishu bot')
    .action(feishuCommand);

  program
    .command('catscompany')
    .description('Start the Cats Company bot')
    .action(async () => {
      const { catscompanyCommand } = await import('./commands/catscompany');
      await catscompanyCommand();
    });

  program
    .command('weixin')
    .description('Start the Weixin bot')
    .action(async () => {
      const { weixinCommand } = await import('./commands/weixin');
      await weixinCommand();
    });

  program
    .command('dashboard')
    .description('Start the XiaoBa Dashboard')
    .option('-p, --port <port>', 'Specify the port number', '3800')
    .action(async (options) => {
      const { dashboardCommand } = await import('./commands/dashboard');
      await dashboardCommand(options);
    });

  program
    .command('runtime')
    .description('Show the resolved node, python, and git runtimes')
    .action(runtimeCommand);

  registerSkillCommand(program);

  program.action(() => {
    const options = program.opts();
    chatCommand({ interactive: true, skill: options.skill });
  });

  program.parse();
}

main();