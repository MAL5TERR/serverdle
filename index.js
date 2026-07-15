require('dotenv').config();
const express = require('express');
const cors = require('cors');
const {
  Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField
} = require('discord.js');
const store = require('./lib/store');

/* ============================================================
   DISCORD CLIENT
   ============================================================ */
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('clientReady', () => {
  console.log(`🤖 Mafiadle bot logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  if(!interaction.isChatInputCommand()) return;

  if(interaction.commandName === 'leaderboard'){
    const board = store.getLeaderboard().slice(0, 10);
    if(board.length === 0){
      await interaction.reply('لا توجد نتائج مسجلة بعد.');
      return;
    }
    const lines = board.map((u, i) =>
      `**${i + 1}.** ${u.username} — 🏆 ${u.wins} فوز / ${u.played} محاولة (${u.winRate}%)` +
      (u.avgAttempts ? ` — متوسط ${u.avgAttempts} تخمينات` : '')
    );
    const embed = new EmbedBuilder()
      .setTitle('🏆 ترتيب Mafiadle')
      .setDescription(lines.join('\n'))
      .setColor(0x39ff6a);
    await interaction.reply({ embeds: [embed] });
  }

  if(interaction.commandName === 'streak'){
    const target = interaction.options.getUser('user') || interaction.user;
    const username = target.username;
    const streak = store.getStreak(username);
    await interaction.reply(`🔥 سلسلة فوز **${username}**: ${streak} يوم متتالي`);
  }

  if(interaction.commandName === 'stats'){
    const target = interaction.options.getUser('user') || interaction.user;
    const username = target.username;
    const s = store.getUserStats(username);
    if(s.played === 0){
      await interaction.reply(`لا توجد نتائج مسجلة لـ **${username}** بعد.`);
      return;
    }
    const embed = new EmbedBuilder()
      .setTitle(`📊 إحصائيات ${username}`)
      .addFields(
        { name: 'عدد الألعاب', value: String(s.played), inline: true },
        { name: 'الفوز', value: String(s.wins), inline: true },
        { name: 'نسبة الفوز', value: `${s.winRate}%`, inline: true },
        { name: 'متوسط التخمينات', value: s.avgAttempts ? String(s.avgAttempts) : '—', inline: true }
      )
      .setColor(0x39ff6a);
    await interaction.reply({ embeds: [embed] });
  }

  if(interaction.commandName === 'resetuser'){
    const isAdmin = interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator);
    if(!isAdmin){
      await interaction.reply({ content: 'هذا الأمر للأدمن فقط.', ephemeral: true });
      return;
    }
    const username = interaction.options.getString('username');
    const removed = store.resetUser(username);
    await interaction.reply(`تم حذف ${removed} نتيجة لـ **${username}**.`);
  }
});

client.login(process.env.DISCORD_TOKEN);

/* ============================================================
   HTTP API — the website POSTs each finished game here
   ============================================================ */
const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/result', async (req, res) => {
  if(req.headers['x-mafiadle-secret'] !== process.env.API_SECRET){
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { username, date, won, attemptsUsed, maxAttempts, answer, guesses } = req.body || {};
  if(!username || !date || typeof won !== 'boolean'){
    return res.status(400).json({ error: 'invalid payload' });
  }

  store.upsertResult({ username, date, won, attemptsUsed, maxAttempts, answer, guesses, timestamp: Date.now() });

  const channelId = process.env.RESULT_CHANNEL_ID;
  if(channelId){
    try{
      const channel = await client.channels.fetch(channelId);
      const line = won
        ? `✅ **${username}** حل تحدي اليوم (${answer}) في ${attemptsUsed}/${maxAttempts} محاولات`
        : `❌ **${username}** فشل بتحدي اليوم. الإجابة كانت **${answer}**`;
      await channel.send(line);
    }catch(e){
      console.error('Failed to post result to channel:', e);
    }
  }

  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`📡 API listening on port ${PORT}`));