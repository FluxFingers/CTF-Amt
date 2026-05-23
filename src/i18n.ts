type Lang = "en" | "de";

const STRINGS = {
    // Announce flow
    "announce.modal.title":          { en: "Announce new CTF",                          de: "Neuen CTF ankündigen" },
    "announce.modal.label":          { en: "Name of the CTF",                           de: "Name des CTFs" },
    "announce.modal.placeholder":    { en: "Name of CTF",                               de: "Name des CTFs" },
    "announce.confirm.button":       { en: "Announce CTF now",                          de: "CTF jetzt ankündigen" },
    "announce.cancel.button":        { en: "Cancel",                                    de: "Abbrechen" },
    "announce.confirm.prompt":       { en: "Do you really want to announce the CTF `{name}`?\n- This will create a category and role for the CTF.", de: "Möchtest du den CTF `{name}` wirklich ankündigen?\n- Du musst Access zum Raum organisieren.\n- Dies wird eine Kategorie und Rolle für den CTF erstellen." },
    "announce.cancelled":            { en: "Cancelled!",                                de: "Abgebrochen!" },
    "announce.need_member_role":     { en: "You need the member role to do this!",      de: "Du benötigst die Member-Rolle!" },
    "announce.info_msg":             { en: "## {name}\n\n**Confirmed by:** <@{user}>\n\nCreate new challenges with `/challenge`.\nSolved a challenge? `/solved`", de: "## {name}\n\n**Bestätigt von:** <@{user}>\n\nNeue Challenges mit `/challenge` erstellen.\nSolved? `/solved`" },
    "announce.post_create_hint":     { en: "IMPORTANT: Please send **now** an announcement in the announcements channel.\n**Important**: You must include the string ```\n{id}\n```\nin the announcement. You can edit the message right after sending it. That's how I can connect roles.", de: "WICHTIG: Bitte sende **jetzt** ein Announcement in den announcements-Channel.\n**Wichtig**: Du musst die Zeichenfolge ```\n{id}\n```\nin dem Announcement includen. Du kannst die Nachricht nach senden direkt editieren. Aber so kann ich die Roles connecten." },

    // Join via reaction
    "join.newbie_dm":                { en: "Welcome! Cool that you want to play a CTF with us. To join CTFs you need the player role — please reach out to an admin or member.", de: "Willkommen! Cool, dass du mit uns CTF spielen möchtest. Damit du dich zum CTF anmelden kannst, brauchst du die \"Player\" Rolle. Sprich gern einen Admin oder Member an. :-)" },

    // Challenge / solved
    "challenge.category_required":   { en: "This command must be executed in a challenge category.", de: "Dieser Command muss in einer Challenge-Kategorie ausgeführt werden." },
    "challenge.missing_args":        { en: "Please enter a name and a category.",       de: "Bitte gib einen Namen und eine Kategorie an." },
    "challenge.created":             { en: "Channel <#{id}> created!",                  de: "Channel <#{id}> erstellt!" },
    "challenge.pad_button":          { en: "Open pad",                                  de: "Pad öffnen" },
    "solved.not_challenge":          { en: "This channel is not a challenge channel!",  de: "Dieser Channel ist kein Challenge-Channel!" },

    // Delete
    "delete.confirm.prompt":         { en: "Do you really want to remove the CTF `{name}`?\nThis will permanently delete all channels, the category, and the role.", de: "Möchtest du den CTF `{name}` wirklich entfernen?\nDies wird alle Kanäle und die dazugehörige Kategorie, so wie die Rolle für immer löschen." },
    "delete.confirm.button":         { en: "Delete CTF now",                            de: "CTF jetzt löschen" },
    "delete.info_channel_required":  { en: "This command must be executed in the info channel of a CTF.", de: "Dieser Command muss im info Channel eines CTF ausgeführt werden." },
    "delete.failed":                 { en: "Deletion failed. Please contact your administrator.", de: "Entfernen fehlgeschlagen. Bitte kontaktiere deinen Administrator." },

    // CTFtime feed
    "feed.embed.click_interest":     { en: "Click 👍 below if you're interested!",      de: "Klicke unten auf 👍, falls du Interesse hast!" },
    "feed.embed.date":               { en: "Date",                                      de: "Datum" },
    "feed.embed.points":             { en: "Points",                                    de: "Punkte" },
    "feed.embed.format":             { en: "Format",                                    de: "Format" },
    "feed.embed.link":               { en: "Link",                                      de: "Link" },
    "feed.embed.description":        { en: "Description",                               de: "Beschreibung" },
    "feed.embed.interested":         { en: "Interested ({count})",                      de: "Interessenten ({count})" },
    "feed.embed.nobody_yet":         { en: "Nobody yet.",                               de: "Bisher niemand." },
    "feed.slot.loading":             { en: "*This slot will be refilled in a few minutes... Loading...*", de: "*Dieser Slot wird in wenigen Minuten neu besetzt... Loading...*" },
    "feed.button.interest":          { en: "Interested",                                de: "Interesse" },
    "feed.delete.need_role":         { en: "Sorry, only members can remove CTFs from the feed.", de: "Sorry, nur Member können CTFs aus dem Feed löschen." },
    "feed.delete.not_in_feed":       { en: "This CTF is no longer in the feed.",        de: "Dieser CTF ist nicht mehr im Feed." },
    "feed.delete.msg_gone":          { en: "This CTF (or its message) is no longer in the feed.", de: "Dieser CTF bzw die Nachricht ist nicht mehr im Feed." },
    "feed.delete.confirm.prompt":    { en: "Do you really want to remove the CTF `{name}` from the feed?", de: "Möchtest du den CTF `{name}` wirklich aus dem Feed entfernen?" },
    "feed.delete.confirm.button":    { en: "Remove CTF now",                            de: "CTF jetzt löschen" },
    "feed.delete.done":              { en: "CTF removed from feed.",                    de: "CTF aus Feed gelöscht." },
    "feed.interest.joined":          { en: "You're in.",                                de: "Eingetragen." },
    "feed.interest.left":            { en: "Removed.",                                  de: "Ausgetragen." },

    // Slash command descriptions
    "cmd.announce.desc":             { en: "Announce a new CTF",                        de: "Ankündigung eines CTFs" },
    "cmd.solved.desc":               { en: "Mark the challenge as solved",              de: "Markiert die Challenge als gelöst" },
    "cmd.challenge.desc":            { en: "Create a new challenge",                    de: "Erstellt eine neue Challenge" },
    "cmd.challenge.opt.genre":       { en: "Category (pwn/web/..)",                     de: "Kategorie (pwn/web/..)" },
    "cmd.challenge.opt.name":        { en: "Challenge name",                            de: "Name der Challenge" },
    "cmd.delete.desc":               { en: "Remove all channels of the CTF",            de: "Entferne alle Kanäle des CTF" },
} as const;

type Key = keyof typeof STRINGS;

const LANG: Lang = ((process.env.BOT_LANG || "en").toLowerCase() === "de" ? "de" : "en") as Lang;

export const t = (key: Key, vars: Record<string, string | number> = {}): string => {
    const tmpl = STRINGS[key][LANG] ?? STRINGS[key].en;
    return tmpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
};
