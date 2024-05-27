import axios from "axios"
import { Client,TextChannel,CategoryChannel, MessageType, ChannelType, CommandInteraction, ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js"
import { read_db } from "./store"
import { CTFAnnounce } from "./announcer"
import slugify from "slugify"

const createPad = async(name:string) => {
    const res = await axios.post(`${process.env.PAD_URL}/new`, `${name}\n===\n`, {
        headers: {
            "Content-Type": "text/markdown"
        }
    })
    const url = res.request.res.responseUrl
    return url
}

export const handle_solved = async(inter:CommandInteraction) => {
    const channel = await inter.guild?.channels.fetch(inter.channelId)
    if(!channel || channel.type !== ChannelType.GuildText) return;
    if(!(channel.topic ?? "").includes("Pad: ")) {
        if(!inter.replied) await inter.reply({content: "This channel is not a challenge channel!", ephemeral: true})
        return;
    }
    const ldb = await read_db("announced.json")
    const ctfs_currently = (ldb.pending ?? []) as CTFAnnounce[]
    const fnd = ctfs_currently.find((k) => k.category_id === channel.parentId)
    if(!fnd) {
        await inter.reply({content: "This channel is not a challenge channel!", ephemeral: true})
        return 
    }
    if(!inter.replied) {
        const msgx = await inter.reply({content: `🍉` , ephemeral: false, fetchReply: true})
        await msgx.react("🍉")

    }
    if(!channel.name.includes("solved-")) {
        const category_channel = await channel.guild.channels.fetch(channel.parentId!) as CategoryChannel
        const last_position = category_channel.children!.cache.map((k:any) => k.position)


        await channel.edit({position: Math.max(...last_position), name: `solved-${channel.name}`})

    }
}
export const create_cmd = async(inter:ChatInputCommandInteraction) => {
    const channel = await inter.guild?.channels.fetch(inter.channelId)
    if(!channel || channel.type !== ChannelType.GuildText) return;
    const ldb = await read_db("announced.json")
    const ctfs_currently = (ldb.pending ?? []) as CTFAnnounce[]
    const fnd = ctfs_currently.find((k:any) => k.category_id === channel.parentId)
    if(!fnd) return await inter.reply({content: "This command must be executed in a challenge category.", ephemeral: true})
    const genre = inter.options.getString("genre") ?? null
    const name = inter.options.getString("name") ?? null
    if(!genre || !name) return await inter.reply({content: "Please enter a name and a category.", ephemeral: true})
    const real_name = slugify(name, {lower: true, strict: true})
    const real_category = slugify(genre, {lower: true, strict: true})
    const padurl = await createPad(`${genre}: ${name}`)

    const channel_name = `${real_category}-${real_name}`
    const new_channel = await channel.guild.channels.create({
        parent: channel.parentId,
        name: channel_name,
        type: ChannelType.GuildText,
        topic: `Pad: pinned`,

    })
    await new_channel.edit({position: 2})
    const lnkbtn = new ButtonBuilder().setURL(padurl).setLabel("Open pad").setStyle(ButtonStyle.Link)
    const padComp = new ActionRowBuilder<ButtonBuilder>().addComponents(lnkbtn)
    const new_msg = await new_channel.send({content: `Challenge (${genre}):\n## ${name}\n\n\nPad: <${padurl}>`, components: [padComp]})

    await new_msg.pin()
    // delete pin message
    const last_pin = await new_channel.messages.fetch({limit: 1, cache: false})
    if(last_pin.size === 1 && last_pin.first()?.type === MessageType.ChannelPinnedMessage) {
        try {
            await last_pin.first()?.delete()
        } catch (e) {
        }
    }
    
    await inter.reply({content: `Channel <#${new_channel.id}> created!`, ephemeral: true})

}