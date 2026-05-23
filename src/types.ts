export interface CTFAnnounce {
    slug: string;
    ctf_name: string;
    ctf_id: string;
    role_id: string;
    category_id: string;
    info_channel: string;
    user_id: string;
    created_at: number;
    announce_message_id?: string;
}

export interface CTF {
    title: string;
    url: string;
    description: string;
    id: number;
    weight: number;
    start: string;
    finish: string;
    format: string;
    ctftime: string;
    organizers: string;
    position: number;
}

export interface Slot {
    message_id: string;
    ctftime_url: string;
    user_ids_interested: string[];
    position: number;
    ctf_id: string;
    gone: boolean;
    created_at: number;
}
