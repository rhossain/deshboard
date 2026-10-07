/** YouTube addresses built from a video ID, for the client and the server alike. */
export const watchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
export const thumb = (id: string, size: "mqdefault" | "hqdefault") => `https://i.ytimg.com/vi/${id}/${size}.jpg`;
