import { marked } from "marked";
import { readFile } from "node:fs/promises";

// README images live in src/public/readme/ and are written as repo paths, so
// GitHub shows them; here they're served from /assets/ like the rest.
export async function renderReadme() {
  const md = await readFile("README.md", "utf8");
  return marked.parse(md).replaceAll('src="src/public/', 'src="/assets/');
}
