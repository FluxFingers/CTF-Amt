import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, Message, TextChannel } from "discord.js";
import {
    addHiddenCtf,
    addSlot,
    getActiveSlotByCtfId,
    getAllCachedCtfs,
    getDiscordMessages,
    getHiddenCtfs,
    getInterestedUsersForCtftimeUrl,
    markSlotsAsGone,
    replaceCachedCtfs,
    replaceDiscordMessages,
    updateSlotInterests,
} from "./store";
import type { CTF, Slot } from "./types";
import axios from "axios";
import { client } from "./main";
import { t } from "./i18n";

export const is_feed_enabled = (): boolean => !!process.env.CTFTIME_FEED_CHANNEL;

const feed_amount = (): number => parseInt(process.env.CTFTIME_FEED_AMOUNT ?? "10", 10);

const fetch_ctftime = async (hidden_ctfs: string[]): Promise<CTF[]> => {
    const start = Math.ceil((Date.now() - 8 * 24 * 60 * 60 * 1000) / 1000);
    const resp = await axios.get(`https://ctftime.org/api/v1/events/?limit=100&start=${start}`, {
        headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/111.0" },
        timeout: 30000,
    });
    const min_points = parseInt(process.env.CTFTIME_POINTS_MIN ?? "0", 10);
    const with_onsite = process.env.CTFTIME_INCLUDE_ONSITE === "true";
    return resp.data
        .filter((c: any) =>
            !hidden_ctfs.includes(c.ctftime_url) &&
            c.onsite === with_onsite &&
            c.weight >= min_points &&
            new Date(c.finish) > new Date() &&
            c.restrictions === "Open"
        )
        .map((c: any) => ({
            title: c.title,
            url: c.url,
            description: c.description,
            weight: c.weight,
            start: c.start,
            id: c.id,
            finish: c.finish,
            format: c.format,
            ctftime: c.ctftime_url,
            organizers: c.organizers.map((o: any) => o.name).join(", "),
        } as CTF))
        .sort((a: CTF, b: CTF) => new Date(a.start).getTime() - new Date(b.start).getTime())
        .slice(0, feed_amount())
        .map((c: CTF, i: number) => ({ ...c, position: i }));
};

const assure_messages = async (): Promise<Message[] | undefined> => {
    const chan = client.channels.cache.get(process.env.CTFTIME_FEED_CHANNEL as string) as TextChannel | undefined;
    if (!chan) {
        console.error("[ctftime] CTFTIME_FEED_CHANNEL not found");
        return;
    }

    const msg_objects: Message[] = [];
    const stored_msgs = getDiscordMessages();
    let changed = false;
    const amount = feed_amount();

    for (let i = 0; i < amount; i++) {
        try {
            if (stored_msgs[i]) {
                msg_objects.push(await chan.messages.fetch(stored_msgs[i]));
                continue;
            }
        } catch {}
        const msg = await chan.send({ content: t("feed.slot.loading") });
        stored_msgs[i] = msg.id;
        msg_objects.push(msg);
        changed = true;
    }
    if (changed) replaceDiscordMessages(stored_msgs);
    return msg_objects;
};

const create_embed = (ctf: CTF, interested: string[]) => ({
    author: { name: `${ctf.title} by ${ctf.organizers}`, url: ctf.ctftime },
    url: ctf.url,
    description: t("feed.embed.click_interest"),
    color: Math.floor(Math.random() * 16777215),
    fields: [
        {
            name: t("feed.embed.date"),
            value: `<t:${Math.ceil(new Date(ctf.start).getTime() / 1000)}:F> -\n<t:${Math.ceil(new Date(ctf.finish).getTime() / 1000)}:F>`,
            inline: false,
        },
        { name: t("feed.embed.points"), value: ctf.weight.toString(), inline: true },
        { name: t("feed.embed.format"), value: ctf.format, inline: true },
        { name: t("feed.embed.link"), value: ctf.url, inline: true },
        {
            name: t("feed.embed.description"),
            value: ctf.description.length > 250
                ? ctf.description.slice(0, 250).replace("\n\n", "\n") + "..."
                : ctf.description.replace("\n\n", "\n"),
            inline: false,
        },
        {
            name: t("feed.embed.interested", { count: interested.length }),
            value: interested.length ? interested.map(k => `<@${k}>`).join(" ") : t("feed.embed.nobody_yet"),
            inline: false,
        },
    ],
});

const overwrite_slot = async (slot: Slot, ctf: CTF, msg: Message) => {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("interesse-" + slot.ctf_id).setStyle(ButtonStyle.Success).setEmoji("👍").setLabel(t("feed.button.interest")),
        new ButtonBuilder().setCustomId("del-" + slot.ctf_id).setStyle(ButtonStyle.Secondary).setLabel("🗑️"),
    );
    await msg.edit({ embeds: [create_embed(ctf, slot.user_ids_interested)], content: "", components: [row] });
};

export const fetch_ctfs = async () => {
    if (!is_feed_enabled()) return;
    const hidden = getHiddenCtfs();
    const last = getAllCachedCtfs();
    const fresh = await fetch_ctftime(hidden);
    const msgs = await assure_messages();
    if (!msgs) return;
    if (JSON.stringify(fresh) === JSON.stringify(last)) return;
    replaceCachedCtfs(fresh);

    for (const ctf of fresh) {
        const prev = last.find(f => f.ctftime === ctf.ctftime);
        if (!prev || JSON.stringify(ctf) !== JSON.stringify(prev)) {
            const slot: Slot = {
                ctf_id: ctf.id.toString(),
                message_id: msgs[msgs.length - 1 - ctf.position].id,
                ctftime_url: ctf.ctftime,
                user_ids_interested: getInterestedUsersForCtftimeUrl(ctf.ctftime),
                position: ctf.position,
                gone: false,
                created_at: Date.now(),
            };
            markSlotsAsGone(slot.position, slot.ctftime_url);
            addSlot(slot);
            await overwrite_slot(slot, ctf, msgs[msgs.length - 1 - ctf.position]);
        }
    }
};

export const handle_delete_ctf = async (inter: ButtonInteraction) => {
    const member = await inter.guild?.members.fetch(inter.user.id);
    if (!member?.roles.cache.has(process.env.FULL_MEMBER_ROLE_ID as string)) {
        return inter.reply({ content: t("feed.delete.need_role"), ephemeral: true });
    }

    const fnd = getActiveSlotByCtfId(inter.customId.split("-")[1]);
    if (!fnd) return inter.reply({ content: t("feed.delete.not_in_feed"), ephemeral: true });
    const msg = await inter.channel?.messages.fetch(fnd.message_id);
    if (!msg) return inter.reply({ content: t("feed.delete.msg_gone"), ephemeral: true });

    const actionrow = new ActionRowBuilder<ButtonBuilder>().addComponents([
        new ButtonBuilder().setCustomId("x-purge").setLabel(t("feed.delete.confirm.button")).setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("x-cancel").setLabel(t("announce.cancel.button")).setStyle(ButtonStyle.Secondary),
    ]);
    const confirm = await inter.reply({
        content: t("feed.delete.confirm.prompt", { name: msg.embeds[0].author?.name ?? "unknown" }),
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
        addHiddenCtf(fnd.ctftime_url);
        await msg.edit({ embeds: [], content: t("feed.slot.loading"), components: [] });
        await res.reply({ content: t("feed.delete.done"), ephemeral: true });
    } catch {}
};

export const handle_interesse = async (inter: ButtonInteraction) => {
    const fnd = getActiveSlotByCtfId(inter.customId.split("-")[1]);
    if (!fnd) return inter.reply({ content: t("feed.delete.not_in_feed"), ephemeral: true });
    const msg = await inter.channel?.messages.fetch(fnd.message_id);
    if (!msg) return inter.reply({ content: t("feed.delete.msg_gone"), ephemeral: true });

    const joined = !fnd.user_ids_interested.includes(inter.user.id);
    const newInterested = joined
        ? [...fnd.user_ids_interested, inter.user.id]
        : fnd.user_ids_interested.filter(k => k !== inter.user.id);
    updateSlotInterests(fnd.ctf_id, newInterested);

    const interestedLabelPrefix = t("feed.embed.interested", { count: 0 }).split("(")[0];
    const embed = msg.embeds[0].toJSON();
    embed.fields = embed.fields!.map(f =>
        f.name.startsWith(interestedLabelPrefix)
            ? {
                  ...f,
                  name: t("feed.embed.interested", { count: newInterested.length }),
                  value: newInterested.length ? newInterested.map(k => `<@${k}>`).join(" ") : t("feed.embed.nobody_yet"),
              }
            : f
    );
    await msg.edit({ embeds: [embed] });
    await inter.reply({ content: joined ? t("feed.interest.joined") : t("feed.interest.left"), ephemeral: true });
};
