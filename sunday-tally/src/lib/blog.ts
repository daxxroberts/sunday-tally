import 'server-only'
import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'
import rehypeStringify from 'rehype-stringify'

const BLOG_DIR = path.join(process.cwd(), 'content', 'blog')

export type PostMeta = {
  slug: string
  title: string
  description: string
  date: string
  lastUpdated: string
  author: string
  tags: string[]
  coverImage?: string
  coverImageAlt?: string
  ogImage?: string
  status?: string
  featured?: boolean
}

export type Faq = { question: string; answer: string }

export type Post = PostMeta & {
  html: string
  faqs: Faq[]
}

/** Drop HTML comments (handoff notes, [MARKER] annotations) from rendered output. */
function stripComments(markdown: string): string {
  return markdown.replace(/<!--[\s\S]*?-->/g, '')
}

/** The page template renders the title as the page's single H1, so remove the
 *  leading H1 from the body to avoid two H1s on one page. */
function stripLeadingH1(markdown: string): string {
  return markdown.replace(/^\s*#\s+.*(?:\r?\n)+/, '')
}

/** Pull the FAQ Q/A pairs out of the body so we can emit FAQPage JSON-LD. */
function extractFaqs(markdown: string): Faq[] {
  const lines = markdown.split('\n')
  const startIdx = lines.findIndex((l) => /^##\s+Frequently Asked Questions/i.test(l))
  if (startIdx === -1) return []
  // FAQ section runs until the next H2 (### question headings stay inside it).
  let endIdx = lines.length
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) {
      endIdx = i
      break
    }
  }
  const section = lines.slice(startIdx, endIdx).join('\n')
  const faqs: Faq[] = []
  const re = /^###\s+(.+?)\s*\n+([\s\S]*?)(?=\n###\s|$)/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(section)) !== null) {
    const question = m[1].trim()
    const answer = m[2].replace(/\s+/g, ' ').trim()
    if (question && answer) faqs.push({ question, answer })
  }
  return faqs
}

async function renderMarkdown(markdown: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(markdown)
  return String(file)
}

export function getAllPostSlugs(): string[] {
  if (!fs.existsSync(BLOG_DIR)) return []
  return fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith('.md') || f.endsWith('.mdx'))
    .map((f) => f.replace(/\.mdx?$/, ''))
    .filter((slug) => {
      // Only real posts. Internal docs in content/blog (e.g. CONTENT_CLUSTER_PLAN)
      // have no post frontmatter and must never be routed or listed.
      const parsed = readPostFile(slug)
      return !!parsed && typeof parsed.data.title === 'string' && !!parsed.data.date
    })
}

function readPostFile(slug: string) {
  const mdPath = path.join(BLOG_DIR, `${slug}.md`)
  const mdxPath = path.join(BLOG_DIR, `${slug}.mdx`)
  const filePath = fs.existsSync(mdPath) ? mdPath : mdxPath
  if (!fs.existsSync(filePath)) return null
  const raw = fs.readFileSync(filePath, 'utf8')
  return matter(raw)
}

function toMeta(slug: string, data: Record<string, unknown>): PostMeta {
  return {
    slug,
    title: String(data.title ?? slug),
    description: String(data.description ?? ''),
    date: String(data.date ?? ''),
    lastUpdated: String(data.lastUpdated ?? data.date ?? ''),
    author: String(data.author ?? 'Sunday Tally'),
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
    coverImage: data.coverImage ? String(data.coverImage) : undefined,
    coverImageAlt: data.coverImageAlt ? String(data.coverImageAlt) : undefined,
    ogImage: data.ogImage ? String(data.ogImage) : undefined,
    status: data.status ? String(data.status) : undefined,
    featured: data.featured === true,
  }
}

/** Published posts only (drafts hidden in production), newest first. */
export function getAllPostsMeta(): PostMeta[] {
  const includeDrafts = process.env.NODE_ENV !== 'production'
  return getAllPostSlugs()
    .map((slug) => {
      const parsed = readPostFile(slug)
      return parsed ? toMeta(slug, parsed.data) : null
    })
    .filter((p): p is PostMeta => p !== null)
    .filter((p) => includeDrafts || !(p.status ?? '').startsWith('draft'))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
}

/** Featured posts for the homepage band; falls back to latest if none flagged. */
export function getFeaturedPostsMeta(limit = 3): PostMeta[] {
  const all = getAllPostsMeta()
  const featured = all.filter((p) => p.featured)
  return (featured.length ? featured : all).slice(0, limit)
}

export async function getPostBySlug(slug: string): Promise<Post | null> {
  const parsed = readPostFile(slug)
  if (!parsed) return null
  // Guard: internal docs (no post frontmatter) must 404, even by direct URL.
  if (typeof parsed.data.title !== 'string' || !parsed.data.date) return null
  const meta = toMeta(slug, parsed.data)
  const body = stripLeadingH1(stripComments(parsed.content))
  const html = await renderMarkdown(body)
  const faqs = extractFaqs(parsed.content)
  return { ...meta, html, faqs }
}
