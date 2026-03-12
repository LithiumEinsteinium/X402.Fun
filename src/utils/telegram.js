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

// Bot instance - use polling for simplicity
let bot = null;

if (TELEGRAM_BOT_TOKEN && TELEGRAM_BOT_TOKEN !== 'YOUR_BOT_TOKEN_HERE') {
  try {
    bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
    console.log('🤖 Telegram bot initialized successfully');
    
    // Set up commands
    bot.setMyCommands([
      { command: 'start', description: 'Welcome message' },
      { command: 'stats', description: 'View stats' },
      { command: 'help', description: 'Help' }
    ]);
    
    // Handle messages
    bot.on('message', async (msg) => {
      const chatId = msg.chat.id;
      const text = msg.text;
      console.log('📩 Received message:', text);
      
      if (text === '/start') {
        await bot.sendMessage(chatId, `
🤖 *X402.Fun Bot*

I announce:
• New token launches
• Token graduations
• Liquidity milestones

No trading through bot - use MCP for that!

🔗 *API:* https://x402-fun.onrender.com
        `.trim(), { parse_mode: 'Markdown' });
      }
      
      if (text === '/stats') {
        await bot.sendMessage(chatId, '📊 Check the API for stats!');
      }
      
      if (text === '/help') {
        await bot.sendMessage(chatId, `
*Commands:*
/start - Welcome message
/stats - View stats  
/help - This help message

*Links:*
API: https://x402-fun.onrender.com
        `.trim(), { parse_mode: 'Markdown' });
      }
    });
    
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
