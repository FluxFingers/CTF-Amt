import axios from "axios";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, CategoryChannel, ChannelType, ChatInputCommandInteraction, CommandInteraction, MessageType, Role } from "discord.js";
import { deleteAnnouncementByInfoChannel, getAnnouncementByCategoryId, getAnnouncementByInfoChannel } from "./store";
import { t } from "./i18n";
import slugify from "slugify";

const login = async (): Promise<string | null> => {
    const { PAD_USERNAME, PAD_PASSWORD, PAD_URL } = process.env;
    if (!PAD_USERNAME || !PAD_PASSWORD) return null;
    const res = await axios.post(
        `${PAD_URL}/login`,
        new URLSearchParams({ email: PAD_USERNAME, password: PAD_PASSWORD }).toString(),
        {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            timeout: 15000,
            maxRedirects: 0,
            validateStatus: (s) => s >= 200 && s < 400,
        }
    );
    const setCookie = res.headers["set-cookie"];
    if (!setCookie?.length) return null;
    return setCookie.map((c: string) => c.split(";")[0]).join("; ");
};

const createPad = async (name: string): Promise<string> => {
    const cookie = await login();
    const headers: Record<string, string> = { "Content-Type": "text/markdown" };
    if (cookie) headers["Cookie"] = cookie;
    const res = await axios.post(`${process.env.PAD_URL}/new`, `${name}\n===\n`, { headers, timeout: 15000 });
    return res.request.res.responseUrl;
};

const solved_emotes = (process.env.SOLVED_EMOTES ?? "🍉")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

export const handle_solved = async (inter: CommandInteraction) => {
    const channel = await inter.guild?.channels.fetch(inter.channelId);
    if (!channel || channel.type !== ChannelType.GuildText) return;
    if (!(channel.topic ?? "").includes("Pad: ") || !getAnnouncementByCategoryId(channel.parentId ?? "")) {
        return inter.reply({ content: t("solved.not_challenge"), ephemeral: true });
    }
    const emote = solved_emotes[Math.floor(Math.random() * solved_emotes.length)];
    const msgx = await inter.reply({ content: emote, ephemeral: false, fetchReply: true });
    await msgx.react(emote);

    if (!channel.name.includes("solved-")) {
        const category = await channel.guild.channels.fetch(channel.parentId!) as CategoryChannel;
        const maxPos = Math.max(...category.children!.cache.map((c: any) => c.position));
        await channel.edit({ position: maxPos, name: `solved-${channel.name}` });
    }
};

export const create_cmd = async (inter: ChatInputCommandInteraction) => {
    const channel = await inter.guild?.channels.fetch(inter.channelId);
    if (!channel || channel.type !== ChannelType.GuildText) return;
    if (!getAnnouncementByCategoryId(channel.parentId ?? "")) {
        return inter.reply({ content: t("challenge.category_required"), ephemeral: true });
    }

    const genre = inter.options.getString("genre");
    const name = inter.options.getString("name");
    if (!genre || !name) return inter.reply({ content: t("challenge.missing_args"), ephemeral: true });

    const padurl = await createPad(`${genre}: ${name}`);
    const new_channel = await channel.guild.channels.create({
        parent: channel.parentId,
        name: `${slugify(genre, { lower: true, strict: true })}-${slugify(name, { lower: true, strict: true })}`,
        type: ChannelType.GuildText,
        topic: `Pad: pinned`,
    });
    const new_msg = await new_channel.send({
        content: `Challenge (${genre}):\n## ${name}\n\n\nPad: <${padurl}>`,
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setURL(padurl).setLabel(t("challenge.pad_button")).setStyle(ButtonStyle.Link)
        )],
    });
    await new_msg.pin();

    const last_pin = await new_channel.messages.fetch({ limit: 1, cache: false });
    if (last_pin.size === 1 && last_pin.first()?.type === MessageType.ChannelPinnedMessage) {
        try { await last_pin.first()?.delete(); } catch {}
    }

    await inter.reply({ content: t("challenge.created", { id: new_channel.id }), ephemeral: true });
};

export const handle_delete_channels = async (inter: CommandInteraction) => {
    const channel = await inter.guild?.channels.fetch(inter.channelId);
    if (!channel || channel.type !== ChannelType.GuildText) return;
    const member = await channel.guild.members.fetch(inter.user.id);
    if (!member.roles.cache.has(process.env.FULL_MEMBER_ROLE_ID as string)) {
        return inter.reply({ content: t("announce.need_member_role"), ephemeral: true });
    }

    const fnd = getAnnouncementByInfoChannel(inter.channelId);
    if (!fnd) return inter.reply({ content: t("delete.info_channel_required"), ephemeral: true });

    const category = await channel.guild.channels.fetch(channel.parentId!) as CategoryChannel;
    const role = await channel.guild.roles.fetch(fnd.role_id) as Role;

    const actionrow = new ActionRowBuilder<ButtonBuilder>().addComponents([
        new ButtonBuilder().setCustomId("x-purge").setLabel(t("delete.confirm.button")).setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("x-cancel").setLabel(t("announce.cancel.button")).setStyle(ButtonStyle.Secondary),
    ]);
    const confirm = await inter.reply({
        content: t("delete.confirm.prompt", { name: category.name }),
        components: [actionrow],
        fetchReply: true,
        ephemeral: true,
    });

    try {
        const res = await confirm.awaitMessageComponent({
            time: 30000,
            filter: (i) => i.isButton() && ["x-cancel", "x-purge"].includes(i.customId),
        });
        if (res.customId !== "x-purge") return res.update({ content: t("announce.cancelled"), components: [] });

        try {
            category.children!.cache.forEach((c: any) => c.delete("Delete CTF"));
            category.delete("Delete CTF");
        } catch (e) {
            console.error(e);
            return res.reply({ content: t("delete.failed"), ephemeral: true });
        }
        try { role.delete("Delete CTF"); } catch {}
        deleteAnnouncementByInfoChannel(inter.channelId);
    } catch (e) {
        console.error(e);
    }
};
