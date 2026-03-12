/**
 * X402.Fun - Telegram Bot (ESM)
 * 
 * Announces: New token launches, graduations, price alerts
 */

import TelegramBotPkg from 'node-telegram-bot-api';

const TelegramBot = TelegramBotPkg;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHANNEL = process.env.TELEGRAM_CHANNEL || process.env.TELEGRAM_ANNOUNCEMENT_CHANNEL;

// Bot instance
let bot = null;
if (TELEGRAM_BOT_TOKEN && TELEGRAM_BOT_TOKEN !== 'YOUR_BOT_TOKEN_HERE') {
  try {
    bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });
    console.log('🤖 Telegram bot initialized');
  } catch (e) {
    console.log('⚠️ Telegram bot failed to initialize:', e.message);
  }
}

export async function announceLaunch(token) {
  if (!bot || !TELEGRAM_CHANNEL) {
    console.log('📢 Would announce launch:', token?.name);
    return;
  }
  
  const message = `
🚀 *NEW TOKEN LAUNCHED*

🪙 *${token.name}* ($${token.symbol})
👤 Creator: \`${token.creator}\`
💵 Bonding Curve

Start trading via MCP!
  `.trim();

  try {
    await bot.sendMessage(TELEGRAM_CHANNEL, message, { parse_mode: 'Markdown' });
    console.log('📢 Announced launch:', token.name);
  } catch (e) {
    console.log('❌ Failed to announce:', e.message);
  }
}

export async function announceGraduation(token) {
  if (!bot || !TELEGRAM_CHANNEL) {
    console.log('📢 Would announce graduation:', token?.name);
    return;
  }
  
  const message = `
🎉 *TOKEN GRADUATED!*

🪙 *${token.name}* ($${token.symbol})
👤 Creator: \`${token.creator}\`
💰 Now tradable on PumpSwap!

Public trading now open! 🚀
  `.trim();

  try {
    await bot.sendMessage(TELEGRAM_CHANNEL, message, { parse_mode: 'Markdown' });
    console.log('📢 Announced graduation:', token.name);
  } catch (e) {
    console.log('❌ Failed to announce:', e.message);
  }
}

export async function announceMilestone(token, milestone) {
  if (!bot || !TELEGRAM_CHANNEL) {
    console.log('📢 Would announce milestone:', milestone);
    return;
  }
  
  const message = `
📈 *LIQUIDITY MILESTONE*

🪙 *${token.symbol}*
💵 Pool: ${milestone.liquidity} SOL
📊 ${milestone.progress}% to graduation

${milestone.message || 'Keep climbing! 🚀'}
  `.trim();

  try {
    await bot.sendMessage(TELEGRAM_CHANNEL, message, { parse_mode: 'Markdown' });
  } catch (e) {
    console.log('❌ Failed to announce:', e.message);
  }
}
