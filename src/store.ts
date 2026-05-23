import Database, { Database as DatabaseType } from "better-sqlite3";
import path from "path";
import fs from "fs";
import type { CTFAnnounce, CTF, Slot } from "./types";

let db: DatabaseType | null = null;

export const initDatabase = (): DatabaseType => {
    if (db) return db;
    const basePath = process.env.BASE_PATH || "./fluxbot/";
    if (!fs.existsSync(basePath)) fs.mkdirSync(basePath, { recursive: true });

    db = new Database(path.join(basePath, "fluxbot.db"));
    db.pragma("journal_mode = WAL");
    db.exec(`
        CREATE TABLE IF NOT EXISTS announcements (
            id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL, ctf_name TEXT NOT NULL,
            ctf_id TEXT UNIQUE NOT NULL, role_id TEXT NOT NULL, category_id TEXT NOT NULL,
            info_channel TEXT NOT NULL, user_id TEXT NOT NULL, created_at INTEGER NOT NULL,
            announce_message_id TEXT
        );
        CREATE TABLE IF NOT EXISTS ctf_cache (
            id INTEGER PRIMARY KEY, title TEXT NOT NULL, url TEXT NOT NULL, description TEXT NOT NULL,
            weight REAL NOT NULL, start TEXT NOT NULL, finish TEXT NOT NULL, format TEXT NOT NULL,
            ctftime TEXT UNIQUE NOT NULL, organizers TEXT NOT NULL, position INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS slots (
            id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT NOT NULL, ctftime_url TEXT NOT NULL,
            position INTEGER NOT NULL, ctf_id TEXT NOT NULL, gone INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS slot_interests (
            id INTEGER PRIMARY KEY AUTOINCREMENT, slot_id INTEGER NOT NULL, user_id TEXT NOT NULL,
            FOREIGN KEY (slot_id) REFERENCES slots(id) ON DELETE CASCADE, UNIQUE(slot_id, user_id)
        );
        CREATE TABLE IF NOT EXISTS discord_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT UNIQUE NOT NULL, position INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS hidden_ctfs (
            id INTEGER PRIMARY KEY AUTOINCREMENT, ctftime_url TEXT UNIQUE NOT NULL
        );
        CREATE TABLE IF NOT EXISTS kv (
            k TEXT PRIMARY KEY, v TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_slots_ctf_id ON slots(ctf_id);
        CREATE INDEX IF NOT EXISTS idx_slots_gone ON slots(gone);
    `);
    console.log("[Store] SQLite initialized");
    return db;
};

export const getDb = (): DatabaseType => db || initDatabase();
export const closeDatabase = () => { if (db) { db.close(); db = null; } };

// Key-value store (used for one-time setup flag)
export const kvGet = (k: string): string | undefined =>
    (getDb().prepare(`SELECT v FROM kv WHERE k = ?`).get(k) as { v: string } | undefined)?.v;

export const kvSet = (k: string, v: string) =>
    getDb().prepare(`INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`).run(k, v);

// Announcements
export const getAllAnnouncements = (): CTFAnnounce[] =>
    getDb().prepare(`SELECT slug, ctf_name, ctf_id, role_id, category_id, info_channel, user_id, created_at, announce_message_id FROM announcements`).all() as CTFAnnounce[];

export const getAnnouncementByMessageId = (messageId: string): CTFAnnounce | undefined =>
    getDb().prepare(`SELECT * FROM announcements WHERE announce_message_id = ?`).get(messageId) as CTFAnnounce | undefined;

export const getAnnouncementByCategoryId = (categoryId: string): CTFAnnounce | undefined =>
    getDb().prepare(`SELECT * FROM announcements WHERE category_id = ?`).get(categoryId) as CTFAnnounce | undefined;

export const addAnnouncement = (a: CTFAnnounce) =>
    getDb().prepare(`INSERT INTO announcements (slug, ctf_name, ctf_id, role_id, category_id, info_channel, user_id, created_at, announce_message_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(a.slug, a.ctf_name, a.ctf_id, a.role_id, a.category_id, a.info_channel, a.user_id, a.created_at, a.announce_message_id || null);

export const updateAnnouncementMessageId = (ctfId: string, messageId: string) =>
    getDb().prepare(`UPDATE announcements SET announce_message_id = ? WHERE ctf_id = ?`).run(messageId, ctfId);

export const getAnnouncementByInfoChannel = (infoChannel: string): CTFAnnounce | undefined =>
    getDb().prepare(`SELECT * FROM announcements WHERE info_channel = ?`).get(infoChannel) as CTFAnnounce | undefined;

export const deleteAnnouncementByInfoChannel = (infoChannel: string) =>
    getDb().prepare(`DELETE FROM announcements WHERE info_channel = ?`).run(infoChannel);

// CTF Cache
export const getAllCachedCtfs = (): CTF[] =>
    getDb().prepare(`SELECT id, title, url, description, weight, start, finish, format, ctftime, organizers, position FROM ctf_cache ORDER BY position`).all() as CTF[];

export const replaceCachedCtfs = (ctfs: CTF[]) => {
    const d = getDb();
    d.transaction((items: CTF[]) => {
        d.prepare(`DELETE FROM ctf_cache`).run();
        const ins = d.prepare(`INSERT INTO ctf_cache (id, title, url, description, weight, start, finish, format, ctftime, organizers, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        items.forEach(c => ins.run(c.id, c.title, c.url, c.description, c.weight, c.start, c.finish, c.format, c.ctftime, c.organizers, c.position));
    })(ctfs);
};

// Slots
const buildSlot = (row: any, interests: string[]): Slot => ({
    message_id: row.message_id, ctftime_url: row.ctftime_url, position: row.position,
    ctf_id: row.ctf_id, gone: Boolean(row.gone), created_at: row.created_at, user_ids_interested: interests
});

export const getActiveSlotByCtfId = (ctfId: string): Slot | undefined => {
    const d = getDb();
    const row = d.prepare(`SELECT * FROM slots WHERE ctf_id = ? AND gone = 0`).get(ctfId) as any;
    if (!row) return undefined;
    const interests = (d.prepare(`SELECT user_id FROM slot_interests WHERE slot_id = ?`).all(row.id) as { user_id: string }[]).map(r => r.user_id);
    return buildSlot(row, interests);
};

export const getInterestedUsersForCtftimeUrl = (url: string): string[] =>
    (getDb().prepare(`SELECT DISTINCT si.user_id FROM slot_interests si JOIN slots s ON si.slot_id = s.id WHERE s.ctftime_url = ? ORDER BY si.id DESC`).all(url) as { user_id: string }[]).map(r => r.user_id);

export const addSlot = (s: Slot) => {
    const d = getDb();
    d.transaction((slot: Slot) => {
        const res = d.prepare(`INSERT INTO slots (message_id, ctftime_url, position, ctf_id, gone, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(slot.message_id, slot.ctftime_url, slot.position, slot.ctf_id, slot.gone ? 1 : 0, slot.created_at);
        const ins = d.prepare(`INSERT INTO slot_interests (slot_id, user_id) VALUES (?, ?)`);
        slot.user_ids_interested.forEach(uid => ins.run(res.lastInsertRowid, uid));
    })(s);
};

export const markSlotsAsGone = (position?: number, ctftimeUrl?: string) => {
    const d = getDb();
    if (position !== undefined) d.prepare(`UPDATE slots SET gone = 1 WHERE position = ?`).run(position);
    if (ctftimeUrl !== undefined) d.prepare(`UPDATE slots SET gone = 1 WHERE ctftime_url = ?`).run(ctftimeUrl);
};

export const updateSlotInterests = (ctfId: string, userIds: string[]) => {
    const d = getDb();
    d.transaction((cid: string, users: string[]) => {
        const slot = d.prepare(`SELECT id FROM slots WHERE ctf_id = ? AND gone = 0`).get(cid) as { id: number } | undefined;
        if (!slot) return;
        d.prepare(`DELETE FROM slot_interests WHERE slot_id = ?`).run(slot.id);
        const ins = d.prepare(`INSERT INTO slot_interests (slot_id, user_id) VALUES (?, ?)`);
        users.forEach(uid => ins.run(slot.id, uid));
    })(ctfId, userIds);
};

// Discord Messages
export const getDiscordMessages = (): string[] =>
    (getDb().prepare(`SELECT message_id FROM discord_messages ORDER BY position`).all() as { message_id: string }[]).map(r => r.message_id);

export const replaceDiscordMessages = (ids: string[]) => {
    const d = getDb();
    d.transaction((msgs: string[]) => {
        d.prepare(`DELETE FROM discord_messages`).run();
        const ins = d.prepare(`INSERT INTO discord_messages (message_id, position) VALUES (?, ?)`);
        msgs.forEach((id, i) => ins.run(id, i));
    })(ids);
};

// Hidden CTFs
export const getHiddenCtfs = (): string[] =>
    (getDb().prepare(`SELECT ctftime_url FROM hidden_ctfs`).all() as { ctftime_url: string }[]).map(r => r.ctftime_url);

export const addHiddenCtf = (url: string) =>
    getDb().prepare(`INSERT OR IGNORE INTO hidden_ctfs (ctftime_url) VALUES (?)`).run(url);
