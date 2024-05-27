import { ActivityType, BaseInteraction, CategoryChannel, ChannelType, Client, Collection, Embed, GatewayIntentBits, Message, MessageReaction, PartialMessageReaction, PartialUser, Partials, PermissionFlagsBits, SlashCommandBuilder, TextChannel, User } from "discord.js";
import { CTFAnnounce, handle_announce, handle_joinctf } from "./announcer";
import { read_db, save_db } from "./store";

import { create_cmd, handle_solved } from "./padengine";
import {config } from "dotenv"
config()
export const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.DirectMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Message, Partials.Reaction, Partials.User, Partials.Channel]
});




client.once('ready', async () => {
    client.user!.setPresence({
        activities: [{ name: `github.com/fluxfingers/CTF-Amt`, type: ActivityType.Playing }],
        status: 'online',
      });

    console.log('Ready!');
    const announce_channel = client.channels.cache.get(process.env.ANNOUNCEMENT_CHANNEL as string) as TextChannel
    const gld = announce_channel.guild;
    const created_commands = await read_db("setup.json")
    if (created_commands?.ok !== true) {

        const cmds = await gld.commands.fetch()
        for await (const cmd of cmds.values()) {
            try {
                await cmd.delete()
            } catch (e) {}
        }

        const announcecmd = new SlashCommandBuilder()
            .setName("announce")
            .setDescription("Announcement of a CTFs")
        const solvedCMD = new SlashCommandBuilder()
            .setName("solved")
            .setDescription("Marks the challenge as solved")
        const createCMD = new SlashCommandBuilder()
            .setName("challenge")
            .setDescription("Creates a new challenge")
            .addStringOption((opt) => opt.setName("genre").setDescription("Category (pwn/web/..)").setRequired(true).setMinLength(2).setMaxLength(10).setAutocomplete(true))
            .addStringOption((opt) => opt.setName("name").setDescription("Challenge name").setRequired(true).setMinLength(2).setMaxLength(20))
        await gld.commands.create(announcecmd)
        await gld.commands.create(solvedCMD)
        await gld.commands.create(createCMD)
        console.log("created commands")
        await save_db("setup.json", {ok: true})

    }
    


});
const handle_announcement_connect = async(msg: Message) => {
    let announcement_keys:any = await read_db("announced.json")
    let pendingCTFs:CTFAnnounce[] = announcement_keys.pending ?? [];
    
    const fnd = pendingCTFs.find((k) => msg.content.includes(k.ctf_id))
    if(!fnd) return;

    pendingCTFs = pendingCTFs.map(k => {
        if(k.ctf_id === fnd.ctf_id) k.announce_message_id = msg.id;
        return k
    })
    announcement_keys.pending = pendingCTFs;
    await save_db("announced.json", announcement_keys)
    await msg.react("✅")
}
client.on("messageCreate", async (msg: Message) => {
    if(msg.channel.type !== ChannelType.GuildAnnouncement && msg.channel.type !== ChannelType.GuildText) return;
    if(msg.author.bot) return;
    if(msg.channelId === process.env.ANNOUNCEMENT_CHANNEL as string) {
        await handle_announcement_connect(msg)
    }
    
})
client.on("messageReactionAdd", async(reaction:MessageReaction | PartialMessageReaction, user: User | PartialUser) => {
    await reaction.fetch()
    await reaction.message.fetch()

    if(reaction.message.channelId === process.env.ANNOUNCEMENT_CHANNEL && !user.bot && reaction.emoji.name === "✅") {
        await handle_joinctf(reaction, user)
    }
    
})
client.on("interactionCreate", async (inter: BaseInteraction) => {
    if (inter.isChatInputCommand() && inter.inGuild() && inter.commandName === "announce") {
        await handle_announce(inter)
    }
    if (inter.isChatInputCommand() && inter.inGuild() && inter.commandName === "solved") {
        await handle_solved(inter)
    }

    if(inter.isChatInputCommand() && inter.inGuild() && inter.commandName === "challenge") {
        await create_cmd(inter)
    }

    
    if(inter.isAutocomplete() && inter.commandName === "challenge") {
        const focussed = inter.options.getFocused(true)
        if(focussed.name === "genre") {
            const categories = ["web", "pwn", "rev", "crypto", "misc", "forensics"]
            const filtered = categories.filter((c) => c.startsWith(focussed.value))
            await inter.respond(filtered.map((c) => {
                return {
                    name: c,
                    value: c,
                }
            }
            ))
        }
        
    }
})


client.login(process.env.TOKEN)
