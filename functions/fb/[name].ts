/**
 * GET /fb/<key>.jpg — a Facebook carousel card's picture (src/lib/card-pictures.ts): the outlet's photo as a square
 * JPEG, made by the deploy and kept in the admin's database beside Instagram's pictures, which /ig/ serves the same
 * way. Public: Facebook fetches it when the post is made, and keeps its own copy.
 */
export { onRequestGet } from "../ig/[name]";
