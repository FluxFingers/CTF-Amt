import { ActivityType, BaseInteraction, ChannelType, Client, GatewayIntentBits, Message, MessageReaction, PartialMessageReaction, PartialUser, Partials, SlashCommandBuilder, TextChannel, User } from "discord.js";
import { config } from "dotenv";
import schedule from "node-schedule";

config();

import { handle_announce, handle_joinctf } from "./announcer";
import { create_cmd, handle_delete_channels, handle_solved } from "./padengine";
import { fetch_ctfs, handle_delete_ctf, handle_interesse, is_feed_enabled } from "./ctftime";
import { closeDatabase, getAllAnnouncements, initDatabase, kvGet, kvSet, updateAnnouncementMessageId } from "./store";
import { t } from "./i18n";

initDatabase();

export const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Message, Partials.Reaction, Partials.User, Partials.Channel],
});

const shutdown = () => {
    console.log("Shutting down...");
    closeDatabase();
    client.destroy();
    process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const register_commands = async (guildChannel: TextChannel) => {
    const cmds = await guildChannel.guild.commands.fetch();
    for (const cmd of cmds.values()) {
        try { await cmd.delete(); } catch {}
    }
    await guildChannel.guild.commands.create(new SlashCommandBuilder().setName("announce").setDescription(t("cmd.announce.desc")));
    await guildChannel.guild.commands.create(new SlashCommandBuilder().setName("solved").setDescription(t("cmd.solved.desc")));
    await guildChannel.guild.commands.create(new SlashCommandBuilder().setName("delete").setDescription(t("cmd.delete.desc")));
    await guildChannel.guild.commands.create(
        new SlashCommandBuilder()
            .setName("challenge")
            .setDescription(t("cmd.challenge.desc"))
            .addStringOption(opt => opt.setName("genre").setDescription(t("cmd.challenge.opt.genre")).setRequired(true).setMinLength(2).setMaxLength(10).setAutocomplete(true))
            .addStringOption(opt => opt.setName("name").setDescription(t("cmd.challenge.opt.name")).setRequired(true).setMinLength(2).setMaxLength(20))
    );
    console.log("Created commands");
};

client.once("clientReady", async () => {
    client.user!.setPresence({
        activities: [{ name: "github.com/fluxfingers/CTF-Amt", type: ActivityType.Playing }],
        status: "online",
    });
    console.log("Ready!");

    const announce_channel = client.channels.cache.get(process.env.ANNOUNCEMENT_CHANNEL as string) as TextChannel;
    if (!announce_channel) {
        console.error("[main] ANNOUNCEMENT_CHANNEL not found in cache");
        return;
    }

    const forceSetup = process.argv.includes("--setup");
    const setupDone = kvGet("setup_done") === "1";
    if (forceSetup || !setupDone) {
        await register_commands(announce_channel);
        kvSet("setup_done", "1");
    }

    if (is_feed_enabled()) {
        if (process.argv.includes("--once")) {
            console.log("Loading CTFs once");
            await fetch_ctfs();
        }
    } else {
        console.log("[main] CTFtime feed disabled (CTFTIME_FEED_CHANNEL not set)");
    }
});

client.on("messageCreate", async (msg: Message) => {
    if (msg.channel.type !== ChannelType.GuildAnnouncement && msg.channel.type !== ChannelType.GuildText) return;
    if (msg.author.bot || msg.channelId !== process.env.ANNOUNCEMENT_CHANNEL) return;
    const fnd = getAllAnnouncements().find(k => msg.content.includes(k.ctf_id));
    if (fnd) {
        updateAnnouncementMessageId(fnd.ctf_id, msg.id);
        await msg.react("✅");
    }
});

client.on("messageReactionAdd", async (reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) => {
    await reaction.fetch();
    await reaction.message.fetch();
    if (reaction.message.channelId === process.env.ANNOUNCEMENT_CHANNEL && !user.bot && reaction.emoji.name === "✅") {
        await handle_joinctf(reaction, user);
    }
});

client.on("interactionCreate", async (inter: BaseInteraction) => {
    if (inter.isChatInputCommand() && inter.inGuild()) {
        if (inter.commandName === "announce") await handle_announce(inter);
        if (inter.commandName === "solved") await handle_solved(inter);
        if (inter.commandName === "challenge") await create_cmd(inter);
        if (inter.commandName === "delete") await handle_delete_channels(inter);
    }
    if (inter.isButton() && inter.inGuild() && is_feed_enabled()) {
        if (inter.customId.startsWith("del-")) await handle_delete_ctf(inter);
        if (inter.customId.startsWith("interesse-")) await handle_interesse(inter);
    }
    if (inter.isAutocomplete() && inter.commandName === "challenge") {
        const focussed = inter.options.getFocused(true);
        if (focussed.name === "genre") {
            const cats = ["web", "pwn", "rev", "crypto", "misc", "forensics"].filter(c => c.startsWith(focussed.value));
            await inter.respond(cats.map(c => ({ name: c, value: c })));
        }
    }
});

if (is_feed_enabled()) {
    schedule.scheduleJob("*/4 * * * *", async () => {
        if (!process.argv.includes("--once")) {
            try {
                console.log("Fetching ctfs");
                await fetch_ctfs();
            } catch (e) {
                console.error(e);
            }
        }
    });
}

client.login(process.env.TOKEN);
