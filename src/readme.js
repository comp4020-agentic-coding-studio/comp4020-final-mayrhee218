import { marked } from "marked";
import { readFile } from "node:fs/promises";

export async function renderReadme() {
  const md = await readFile("README.md", "utf8");
  return marked.parse(md);
}
