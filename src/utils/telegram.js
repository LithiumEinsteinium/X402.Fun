/**
 * X402.Fun - Telegram Bot (ESM)
 * 
 * Announces: New token launches, graduations, price alerts
 */

import pkg from 'node-telegram-bot-api';
const TelegramBot = pkg;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHANNEL = process.env.TELEGRAM_CHANNEL;

console.log('🤖 Telegram bot loading...');
console.log('  Token set:', !!TELEGRAM_BOT_TOKEN);
console.log('  Channel set:', !!TELEGRAM_CHANNEL);

// Bot instance
let bot = null;

if (TELEGRAM_BOT_TOKEN && TELEGRAM_BOT_TOKEN !== 'YOUR_BOT_TOKEN_HERE') {
  try {
    bot = new TelegramBot(TELEGRAM_BOT_TOKEN);
    console.log('🤖 Telegram bot initialized (announcements only)');
  } catch (e) {
    console.log('⚠️ Telegram bot failed:', e.message);
  }
} else {
  console.log('⚠️ Telegram bot not configured - missing token');
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
    console.log('❌ Failed to announce launch:', e.message);
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
    console.log('❌ Failed to announce graduation:', e.message);
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
  `.trim();

  try {
    await bot.sendMessage(TELEGRAM_CHANNEL, message, { parse_mode: 'Markdown' });
  } catch (e) {
    console.log('❌ Failed to announce milestone:', e.message);
  }
}
