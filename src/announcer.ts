import { ActionRowBuilder, ButtonBuilder, ButtonStyle, CategoryChannel, ChannelType, ChatInputCommandInteraction, MessageReaction, ModalBuilder, ModalSubmitInteraction, PartialMessageReaction, PartialUser, PermissionFlagsBits, TextChannel, TextInputBuilder, TextInputStyle, User } from "discord.js";
import { client } from "./main";
import { randomBytes } from "crypto";
import { addAnnouncement, getAnnouncementByMessageId } from "./store";
import type { CTFAnnounce } from "./types";
import { t } from "./i18n";
import slugify from "slugify";

const player_role_ids = (process.env.PLAYER_ROLE ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

export const handle_announce = async (inter: ChatInputCommandInteraction) => {
    const announce_channel = client.channels.cache.get(process.env.ANNOUNCEMENT_CHANNEL as string) as TextChannel;
    const member = await announce_channel.guild.members.fetch(inter.user.id);
    if (!member.roles.cache.has(process.env.FULL_MEMBER_ROLE_ID as string)) {
        return inter.reply({ content: t("announce.need_member_role"), ephemeral: true });
    }

    const modal = new ModalBuilder()
        .setCustomId("new-ctf-modal")
        .setTitle(t("announce.modal.title"));

    const ctf_name = new TextInputBuilder()
        .setCustomId("ctf-name")
        .setPlaceholder(t("announce.modal.placeholder"))
        .setMinLength(3)
        .setMaxLength(30)
        .setLabel(t("announce.modal.label"))
        .setRequired(true)
        .setStyle(TextInputStyle.Short);

    modal.addComponents([new ActionRowBuilder<TextInputBuilder>().addComponents(ctf_name)]);
    await inter.showModal(modal);

    let submission: ModalSubmitInteraction | null = null;
    try {
        submission = await inter.awaitModalSubmit({ time: 30000, filter: (i) => i.customId === "new-ctf-modal" });
    } catch (e) {
        console.log(e);
        return;
    }
    if (!submission) return;
    const ctf_name_val = submission.fields.getTextInputValue("ctf-name");
    if (!ctf_name_val) return;
    const slug = slugify(ctf_name_val, { lower: true, strict: true });

    const actionrow = new ActionRowBuilder<ButtonBuilder>().addComponents([
        new ButtonBuilder().setCustomId("confirm-ctf").setLabel(t("announce.confirm.button")).setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("cancel-ctf").setLabel(t("announce.cancel.button")).setStyle(ButtonStyle.Secondary),
    ]);
    const confirm_create = await submission.reply({
        content: t("announce.confirm.prompt", { name: ctf_name_val }),
        components: [actionrow],
        fetchReply: true,
        ephemeral: true,
    });

    try {
        const confirmation = await confirm_create.awaitMessageComponent({
            time: 30000,
            filter: (i) => i.isButton() && (i.customId === "confirm-ctf" || i.customId === "cancel-ctf"),
        });
        if (confirmation.customId !== "confirm-ctf") {
            return confirmation.update({ content: t("announce.cancelled"), components: [] });
        }
        await confirmation.deferReply({ ephemeral: true });

        const ctfid = randomBytes(5).toString("hex") + Date.now().toString();
        const newrole = await announce_channel.guild.roles.create({ name: ctf_name_val });
        const generalCategory = announce_channel.guild.channels.cache.get(process.env.GENERAL_CATEGORY as string) as CategoryChannel;

        const new_category = await announce_channel.guild.channels.create({
            name: ctf_name_val,
            type: ChannelType.GuildCategory,
            position: generalCategory.position,
            permissionOverwrites: [
                { id: announce_channel.guild.roles.everyone.id, deny: PermissionFlagsBits.ViewChannel },
                { id: newrole.id, allow: PermissionFlagsBits.ViewChannel },
                { id: process.env.FULL_MEMBER_ROLE_ID as string, allow: PermissionFlagsBits.ViewChannel },
                { id: client.user!.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels] },
            ],
        });
        await new_category.edit({ position: generalCategory.position });

        const newChannel = await new_category.guild.channels.create({
            name: "info",
            type: ChannelType.GuildText,
            parent: new_category,
        });
        await newChannel.send({ content: t("announce.info_msg", { name: ctf_name_val, user: inter.user.id }) });

        const item: CTFAnnounce = {
            slug,
            ctf_name: ctf_name_val,
            ctf_id: ctfid,
            role_id: newrole.id,
            category_id: new_category.id,
            info_channel: newChannel.id,
            user_id: inter.user.id,
            created_at: Math.floor(Date.now() / 1000),
        };
        addAnnouncement(item);

        await confirmation.editReply({ content: t("announce.post_create_hint", { id: ctfid }) });
    } catch (e) {
        console.log(e);
    }
};

export const handle_joinctf = async (reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) => {
    const membr = await reaction.message.guild!.members.fetch(user.id);
    if (!membr) return;
    const has_player_role = player_role_ids.some((id) => membr.roles.cache.has(id));
    const has_full_member = membr.roles.cache.has(process.env.FULL_MEMBER_ROLE_ID as string);
    if (!has_player_role && !has_full_member) {
        try {
            await membr.send(process.env.NEWBIE_REACTED_ERROR ?? t("join.newbie_dm"));
        } catch (e) {
            console.error(e);
        }
        return;
    }
    const fnd = getAnnouncementByMessageId(reaction.message.id);
    if (!fnd) return;
    const role = reaction.message.guild!.roles.cache.get(fnd.role_id);
    if (!role) return;
    try {
        await membr.roles.add(role);
    } catch (e) {
        console.error(e);
    }
};
