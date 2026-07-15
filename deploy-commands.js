require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('يعرض ترتيب أفضل اللاعبين في Mafiadle'),

  new SlashCommandBuilder()
    .setName('streak')
    .setDescription('يعرض سلسلة الفوز المتتالية لك أو لشخص آخر')
    .addUserOption(opt => opt.setName('user').setDescription('اللاعب (اختياري)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('يعرض إحصائياتك أو إحصائيات لاعب آخر')
    .addUserOption(opt => opt.setName('user').setDescription('اللاعب (اختياري)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('resetuser')
    .setDescription('[أدمن فقط] يحذف كل نتائج لاعب معيّن من السجل')
    .addStringOption(opt => opt.setName('username').setDescription('الاسم كما كُتب داخل اللعبة').setRequired(true))
    .setDefaultMemberPermissions(0), // hidden by default; server admins can grant it via Integrations settings
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try{
    const target = process.env.GUILD_ID
      ? Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
      : Routes.applicationCommands(process.env.CLIENT_ID);

    await rest.put(target, { body: commands });
    console.log(`✅ Registered ${commands.length} slash commands` + (process.env.GUILD_ID ? ' (guild — instant)' : ' (global — can take up to 1 hour)'));
  }catch(err){
    console.error('Failed to register commands:', err);
  }
})();
