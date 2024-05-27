import fs from "fs/promises"
export const read_db = async (filename: string) => {
    try {
        const dat = await fs.readFile(process.env.BASE_PATH as string + filename, "utf-8")
        return JSON.parse(dat)

    } catch (e) {
        await fs.writeFile(process.env.BASE_PATH as string + filename, "{}")
        return {}
    }
}
export const save_db = async (filename: string, data: any) => {
    await fs.writeFile(process.env.BASE_PATH as string + filename, JSON.stringify(data))
}