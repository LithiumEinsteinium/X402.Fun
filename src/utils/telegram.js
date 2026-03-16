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
    console.log('🤖 Telegram bot initialized');
  } catch (e) {
    console.log('⚠️ Telegram bot failed:', e.message);
  }
} else {
  console.log('⚠️ Telegram bot not configured - missing token');
}

// Helper to format SOL amount
function formatSOL(lamports) {
  return (lamports / 1e9).toFixed(4);
}

export async function announceLaunch(token) {
  if (!bot || !TELEGRAM_CHANNEL) {
    console.log('📢 Would announce launch:', token?.name);
    return;
  }
  
  const message = `
🚀 *NEW TOKEN LAUNCHED*

🪙 *${token.name}* ($${token.symbol})
👤 Creator: \`${token.creator?.slice(0, 8)}...\`
🔗 Mint: \`${token.mint?.slice(0, 8)}...\`
💵 Bonding Curve: 30% buyable / 70% liquidity

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
👤 Creator: \`${token.creator?.slice(0, 8)}...\`
🔗 Mint: \`${token.mint?.slice(0, 8)}...\`
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

export async function announceBuy(token, buyer, solAmount, tokensReceived) {
  if (!bot || !TELEGRAM_CHANNEL) {
    console.log('📢 Would announce buy:', token?.name);
    return;
  }
  
  const message = `
📈 *BUY ORDER*

🪙 *${token.symbol}*
💵 ${solAmount} SOL → ${tokensReceived.toLocaleString()} tokens
👤 Buyer: \`${buyer?.slice(0, 6)}...\`
  `.trim();

  try {
    await bot.sendMessage(TELEGRAM_CHANNEL, message, { parse_mode: 'Markdown' });
  } catch (e) {
    console.log('❌ Failed to announce buy:', e.message);
  }
}

export async function announceSell(token, seller, tokensSold, solReceived) {
  if (!bot || !TELEGRAM_CHANNEL) {
    console.log('📢 Would announce sell:', token?.name);
    return;
  }
  
  const message = `
📉 *SELL ORDER*

🪙 *${token.symbol}*
💵 ${tokensSold.toLocaleString()} tokens → ${solReceived} SOL
👤 Seller: \`${seller?.slice(0, 6)}...\`
  `.trim();

  try {
    await bot.sendMessage(TELEGRAM_CHANNEL, message, { parse_mode: 'Markdown' });
  } catch (e) {
    console.log('❌ Failed to announce sell:', e.message);
  }
}

export async function announceMilestone(token, milestone) {
  if (!bot || !TELEGRAM_CHANNEL) {
    console.log('📢 Would announce milestone:', milestone);
    return;
  }
  
  const message = `
📊 *LIQUIDITY MILESTONE*

🪙 *${token.name}* ($${token.symbol})
💵 Pool: ${milestone.liquidity} SOL
📊 ${milestone.progress}% to graduation
  `.trim();

  try {
    await bot.sendMessage(TELEGRAM_CHANNEL, message, { parse_mode: 'Markdown' });
  } catch (e) {
    console.log('❌ Failed to announce milestone:', e.message);
  }
}
