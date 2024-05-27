import { ActionRowBuilder, BaseInteraction, ButtonBuilder, ButtonInteraction, ButtonStyle, CacheType, CategoryChannel, ChannelType, ChatInputCommandInteraction, Client, CommandInteraction, Message, MessageInteraction, MessageReaction, ModalBuilder, ModalSubmitInteraction, PartialMessageReaction, PartialUser, PermissionFlagsBits, TextChannel, TextInputBuilder, TextInputStyle, User } from "discord.js";
import { client } from "./main";
import { randomBytes } from "crypto"
import { read_db, save_db } from "./store";
import slugify from "slugify"

export type CTFAnnounce = {
    slug: string,
    ctf_name: string,
    ctf_id: string,
    role_id: string,
    category_id: string,
    info_channel: string,
    user_id: string,
    created_at: number,
    announce_message_id?: string
}
export const handle_announce = async (inter: ChatInputCommandInteraction) => {
    const announce_channel = client.channels.cache.get(process.env.ANNOUNCEMENT_CHANNEL as string) as TextChannel
    const member = await announce_channel.guild.members.fetch(inter.user.id)
    if (!member.roles.cache.has(process.env.FULL_MEMBER_ROLE_ID as string)) return await inter.reply({ content: "You need the member role to do this!", ephemeral: true })
    const modal = new ModalBuilder()
        .setCustomId("new-ctf-modal")
        .setTitle("Announce new CTF")

    const ctf_name = new TextInputBuilder()
        .setCustomId("ctf-name")
        .setPlaceholder("Name of CTF")
        .setMinLength(3)
        .setMaxLength(30)
        .setLabel("Name of the CTF")
        .setRequired(true)
        .setStyle(TextInputStyle.Short)

    const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(ctf_name)
    modal.addComponents([firstActionRow])
    await inter.showModal(modal)
    let submission: ModalSubmitInteraction | null = null
    try {
        submission = await inter.awaitModalSubmit({ time: 1000 * 30, filter: (i) => i.customId === "new-ctf-modal" })

    } catch (e) {
        console.log(e)
        return;
    }
    if (!submission) return;
    const ctf_name_val = submission.fields.getTextInputValue("ctf-name")
    if (!ctf_name_val) return;
    const slug = slugify(ctf_name_val, { lower: true, strict: true })
    const btnconfirm = new ButtonBuilder()
        .setCustomId("confirm-ctf")
        .setLabel("Announce CTF now")
        .setStyle(ButtonStyle.Danger)
    const btncancel = new ButtonBuilder()
        .setCustomId("cancel-ctf")
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Secondary)
    const actionrow = new ActionRowBuilder<ButtonBuilder>().addComponents([btnconfirm, btncancel])
    const confirm_create = await submission.reply({
        content: `Do you really want to announce the CTF \`${ctf_name_val}\`?\n- This will create a category and role for the CTF.`,
        components: [actionrow], fetchReply: true, ephemeral: true
    })
    try {
        const confirmation = await confirm_create.awaitMessageComponent({ time: 1000 * 30, filter: (i) => i.isButton() && i.customId === "confirm-ctf" || i.customId === "cancel-ctf" })
        if (!confirmation) return;
        if (confirmation.customId !== "confirm-ctf") return await confirmation.update({ content: "Canceled!", components: [] })
        await confirmation.deferReply({ ephemeral: true, fetchReply: true })
        const ctfid = randomBytes(5).toString("hex") + Date.now().toString()

        const newrole = await announce_channel.guild.roles.create({
            name: ctf_name_val
        })
        const generalCategory = announce_channel.guild!.channels.cache.get(process.env.GENERAL_CATEGORY as string) as CategoryChannel

        const new_category = await announce_channel.guild.channels.create({
            name: ctf_name_val,
            type: ChannelType.GuildCategory,
            position: generalCategory.position,
            permissionOverwrites: [
                {
                    id: announce_channel.guild!.roles.everyone.id,
                    deny: PermissionFlagsBits.ViewChannel
                },
                {
                    id: newrole.id,
                    allow: PermissionFlagsBits.ViewChannel
                },
                {
                    id: process.env.FULL_MEMBER_ROLE_ID as string,
                    allow: PermissionFlagsBits.ViewChannel
                },
                {
                    id: client.user!.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels]
                }
            ]

        })
        await new_category.edit({
            position: generalCategory.position
        })
        const newChannel = await new_category.guild!.channels.create({
            name: "info",
            type: ChannelType.GuildText,
            parent: new_category,
        })
        await newChannel.send({ content: `## ${ctf_name_val}\n\n**Confirmed by:** <@${inter.user.id}>\n\nCreate new Challenges with \`/challenge\`.\nSolved a challenge? \`/solved\`` })

        const dbdat: any = await read_db("announced.json")
        if (!dbdat.pending) dbdat.pending = []
        const itm: CTFAnnounce = { slug, ctf_name: ctf_name_val, ctf_id: ctfid, role_id: newrole.id, category_id: new_category.id, info_channel: newChannel.id, user_id: inter.user.id, created_at: Math.floor(Date.now() / 1000) }
        dbdat.pending.push(itm)
        await save_db("announced.json", dbdat)

        await confirmation.editReply({
            content: `IMPORTANT: Please send **now** an announcement in the predefined announcements channel.\n**Important**: You must include the string \`\`\`\n${ctfid}\n\`\`\`\nin the announcement. You can edit the message directly after sending it. But this way I can connect the roles.`,
        })
        


    } catch (e) {
        console.log(e)
        return;
    }
}

export const handle_joinctf = async(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) => {
    const membr = await reaction.message.guild!.members.fetch(user.id)
    if(!membr) return;
    if(!membr.roles.cache.has(process.env.PLAYER_ROLE as string) && !membr.roles.cache.has(process.env.FULL_MEMBER_ROLE_ID as string)) {
        try {
            await membr.send(process.env.NEWBIE_REACTED_ERROR ?? "You need the member role to join a CTF.")
        } catch(e) {
            console.error(e)
        }
        return;
    }
    const akeys:any = await read_db("announced.json")
    if (!akeys.pending) akeys.pending = []
    const announcement_keys: CTFAnnounce[] = akeys.pending

    const fnd = announcement_keys.find((k) => k.announce_message_id === reaction.message.id)
    if(!fnd) return;
    const role = reaction.message.guild!.roles.cache.get(fnd.role_id)
    if(!role) return;
    try {
        await membr.roles.add(role)

    } catch(e) {
        console.error(e)
    } 

}
