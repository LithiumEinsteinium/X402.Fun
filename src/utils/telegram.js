/**
 * Telegram Bot - Announcements Only
 * 
 * Announces: New token launches, graduations, price alerts
 * No trading through bot
 */

const TelegramBot = require('node-telegram-bot-api');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Bot instance (won't work until token is set)
let bot = null;
if (TELEGRAM_BOT_TOKEN) {
  bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
}

// Channel/chat to post announcements
const ANNOUNCEMENT_CHANNEL = process.env.TELEGRAM_CHANNEL || '';

/**
 * Announce new token launch
 */
export async function announceLaunch(token) {
  if (!bot || !ANNOUNCEMENT_CHANNEL) return;
  
  const message = `
🚀 *NEW TOKEN LAUNCHED*

🪙 *${token.name}* ($${token.symbol})
👤 Creator: \`${token.creator}\`
💵 Bonding Curve

Start trading via MCP:
\`\`\`
x402fun_launch_token
{
  agentId: "your-agent",
  name: "${token.name}",
  symbol: "${token.symbol}"
}
\`\`\`

🔗 View: ${process.env.API_URL}/tokens/${token.id}
  `.trim();

  bot.sendMessage(ANNOUNCEMENT_CHANNEL, message, { parse_mode: 'Markdown' });
}

/**
 * Announce token graduation
 */
export async function announceGraduation(token) {
  if (!bot || !ANNOUNCEMENT_CHANNEL) return;
  
  const message = `
🎉 *TOKEN GRADUATED!*

🪙 *${token.name}* ($${token.symbol})
👤 Creator: \`${token.creator}\`
💰 Now tradable on PumpSwap!

Public trading now open!
  `.trim();

  bot.sendMessage(ANNOUNCEMENT_CHANNEL, message, { parse_mode: 'Markdown' });
}

/**
 * Announce price milestone
 */
export async function announceMilestone(token, milestone) {
  if (!bot || !ANNOUNCEMENT_CHANNEL) return;
  
  const message = `
📈 *PRICE ALERT*

🪙 *${token.symbol}*
💵 Market Cap: $${milestone.marketCap}

${milestone.message || 'Keep climbing!'}
  `.trim();

  bot.sendMessage(ANNOUNCEMENT_CHANNEL, message, { parse_mode: 'Markdown' });
}

// Handle incoming messages (for admin/owner only)
if (bot) {
  bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    
    // Only respond to owner
    if (msg.text === '/start') {
      bot.sendMessage(chatId, `
🤖 X402.Fun Bot

I announce:
- New token launches
- Token graduations
- Price milestones

No trading through bot - use MCP for that!
      `.trim());
    }
    
    if (msg.text === '/stats') {
      // Could add stats here
      bot.sendMessage(chatId, 'Stats coming soon!');
    }
  });
}

export default {
  announceLaunch,
  announceGraduation,
  announceMilestone
};
