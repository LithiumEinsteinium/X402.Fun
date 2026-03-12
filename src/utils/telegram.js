/**
 * X402.Fun - Telegram Bot
 * 
 * Announces: New token launches, graduations, price alerts
 * No trading through bot
 */

const TelegramBot = require('node-telegram-bot-api');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHANNEL = process.env.TELEGRAM_CHANNEL || process.env.TELEGRAM_ANNOUNCEMENT_CHANNEL;

// Bot instance (won't work until token is set)
let bot = null;
if (TELEGRAM_BOT_TOKEN && TELEGRAM_BOT_TOKEN !== 'YOUR_BOT_TOKEN_HERE') {
  try {
    bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });
    console.log('🤖 Telegram bot initialized');
  } catch (e) {
    console.log('⚠️ Telegram bot failed to initialize:', e.message);
  }
}

/**
 * Announce new token launch
 */
async function announceLaunch(token) {
  if (!bot || !TELEGRAM_CHANNEL) {
    console.log('📢 Would announce launch:', token.name);
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

/**
 * Announce token graduation
 */
async function announceGraduation(token) {
  if (!bot || !TELEGRAM_CHANNEL) {
    console.log('📢 Would announce graduation:', token.name);
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

/**
 * Announce liquidity milestone
 */
async function announceMilestone(token, milestone) {
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

// Handle incoming messages (for owner only)
if (bot) {
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
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
}

module.exports = {
  announceLaunch,
  announceGraduation,
  announceMilestone
};
