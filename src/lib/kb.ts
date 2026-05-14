import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type Citation = {
  id: string;
  title: string;
  source: string;
  url?: string | null;
  snippet: string;
  score: number;
  vector_score: number;
  lexical_score: number;
  chunk_id: string;
  chunk_index: number;
};

export type RetrievalDebugItem = Citation & {
  tenant_scope: string;
  user_id?: string | null;
};

const VECTOR_DIM = 96;

function normalizeWhitespace(value: string) {
  return value.replace(/\r/g, "").replace(/\s+/g, " ").trim();
}

function chunkText(content: string, size = 500, overlap = 80) {
  const normalized = normalizeWhitespace(content);
  const chunks: string[] = [];
  let index = 0;

  while (index < normalized.length) {
    const next = normalized.slice(index, index + size);
    if (!next) break;
    chunks.push(next);
    index += Math.max(1, size - overlap);
  }

  return chunks.filter(Boolean);
}

function tokenize(text: string) {
  return normalizeWhitespace(text)
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function hashToken(token: string) {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function buildEmbedding(text: string) {
  const vector = Array.from({ length: VECTOR_DIM }, () => 0);
  const tokens = tokenize(text);
  if (tokens.length === 0) return vector;

  for (const token of tokens) {
    const idx = hashToken(token) % VECTOR_DIM;
    vector[idx] += 1;
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

function keywordScore(text: string, terms: string[]) {
  const haystack = text.toLowerCase();
  if (terms.length === 0) return 0;
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0) / terms.length;
}

function vectorLiteral(vector: number[]) {
  return `[${vector.map((value) => Number(value.toFixed(8))).join(",")}]`;
}

let infraReady = false;

async function ensureKnowledgeVectorInfrastructure() {
  if (infraReady) return;

  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector;`);
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "KnowledgeChunk" ADD COLUMN IF NOT EXISTS "embedding" vector(${VECTOR_DIM});`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "knowledge_chunk_embedding_ivfflat_idx" ON "KnowledgeChunk" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);`,
  );
  infraReady = true;
}

async function setChunkEmbedding(docId: string, chunkIndex: number, embedding: number[]) {
  const literal = vectorLiteral(embedding);
  await prisma.$executeRawUnsafe(
    `UPDATE "KnowledgeChunk" SET "embedding" = $1::vector WHERE "doc_id" = $2::uuid AND "chunk_index" = $3;`,
    literal,
    docId,
    chunkIndex,
  );
}

export async function reindexKnowledgeDoc(docId: string) {
  await ensureKnowledgeVectorInfrastructure();

  const doc = await prisma.knowledgeDoc.findUnique({ where: { id: docId } });
  if (!doc) return null;

  const chunks = chunkText(doc.content, 480, 70);
  await prisma.knowledgeChunk.deleteMany({ where: { doc_id: doc.id } });
  if (chunks.length > 0) {
    await prisma.knowledgeChunk.createMany({
      data: chunks.map((content, index) => ({
        doc_id: doc.id,
        chunk_index: index,
        content,
        tokens: Math.ceil(content.length / 4),
      })),
    });

    for (let index = 0; index < chunks.length; index += 1) {
      const content = chunks[index];
      await setChunkEmbedding(doc.id, index, buildEmbedding(`${doc.title}\n${content}`));
    }
  }

  return prisma.knowledgeDoc.update({
    where: { id: doc.id },
    data: {
      indexed_at: new Date(),
      metadata: {
        ...(typeof doc.metadata === "object" && doc.metadata ? (doc.metadata as Record<string, unknown>) : {}),
        index_version: "rag-v3-pgvector",
        chunk_count: chunks.length,
        vector_dim: VECTOR_DIM,
      },
    },
  });
}

type RetrievalRow = {
  id: string;
  title: string;
  source: string;
  url: string | null;
  tenant_scope: string;
  user_id: string | null;
  chunk_id: string;
  chunk_index: number;
  chunk_content: string;
  vector_score: number | null;
};

async function fetchVectorCandidates(query: string, userId?: string | null, limit = 24) {
  await ensureKnowledgeVectorInfrastructure();

  const embedding = vectorLiteral(buildEmbedding(query));
  const scopeWhere = userId
    ? Prisma.sql`("KnowledgeDoc"."tenant_scope" = 'global' OR ("KnowledgeDoc"."tenant_scope" = 'user' AND "KnowledgeDoc"."user_id" = ${userId}::uuid))`
    : Prisma.sql`"KnowledgeDoc"."tenant_scope" = 'global'`;

  const rows = await prisma.$queryRaw<RetrievalRow[]>(Prisma.sql`
    SELECT
      "KnowledgeDoc"."id" AS "id",
      "KnowledgeDoc"."title" AS "title",
      "KnowledgeDoc"."source" AS "source",
      "KnowledgeDoc"."url" AS "url",
      "KnowledgeDoc"."tenant_scope" AS "tenant_scope",
      "KnowledgeDoc"."user_id" AS "user_id",
      "KnowledgeChunk"."id" AS "chunk_id",
      "KnowledgeChunk"."chunk_index" AS "chunk_index",
      "KnowledgeChunk"."content" AS "chunk_content",
      CASE
        WHEN "KnowledgeChunk"."embedding" IS NULL THEN NULL
        ELSE 1 - ("KnowledgeChunk"."embedding" <=> ${embedding}::vector)
      END AS "vector_score"
    FROM "KnowledgeChunk"
    INNER JOIN "KnowledgeDoc" ON "KnowledgeDoc"."id" = "KnowledgeChunk"."doc_id"
    WHERE ${scopeWhere}
    ORDER BY "KnowledgeChunk"."embedding" <=> ${embedding}::vector ASC
    LIMIT ${limit};
  `);

  return rows;
}

async function fetchFallbackCandidates(userId?: string | null, limit = 200) {
  const docs = await prisma.knowledgeDoc.findMany({
    where: {
      OR: [
        { tenant_scope: "global" },
        ...(userId ? [{ tenant_scope: "user", user_id: userId }] : []),
      ],
    },
    include: {
      chunks: true,
    },
    take: 100,
  });

  return docs.flatMap((doc) =>
    doc.chunks.slice(0, limit).map(
      (chunk): RetrievalRow => ({
        id: doc.id,
        title: doc.title,
        source: doc.source,
        url: doc.url,
        tenant_scope: doc.tenant_scope,
        user_id: doc.user_id,
        chunk_id: chunk.id,
        chunk_index: chunk.chunk_index,
        chunk_content: chunk.content,
        vector_score: null,
      }),
    ),
  );
}

export async function retrieveKnowledgeDebug(query: string, userId?: string | null, limit = 8) {
  const terms = tokenize(query);
  let candidates: RetrievalRow[] = [];

  try {
    candidates = await fetchVectorCandidates(query, userId, Math.max(limit * 4, 24));
  } catch {
    candidates = await fetchFallbackCandidates(userId);
  }

  const ranked = candidates
    .map((row) => {
      const lexical = keywordScore(`${row.title}\n${row.chunk_content}`, terms);
      const vector = typeof row.vector_score === "number" ? row.vector_score : 0;
      const score = vector * 0.75 + lexical * 0.25;
      return {
        ...row,
        lexical_score: lexical,
        vector_score: vector,
        score,
      };
    })
    .filter((item) => item.score > 0 || terms.length === 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return ranked.map(
    (item): RetrievalDebugItem => ({
      id: item.id,
      title: item.title,
      source: item.source,
      url: item.url,
      snippet: item.chunk_content.slice(0, 280),
      score: Number(item.score.toFixed(4)),
      vector_score: Number(item.vector_score.toFixed(4)),
      lexical_score: Number(item.lexical_score.toFixed(4)),
      chunk_id: item.chunk_id,
      chunk_index: item.chunk_index,
      tenant_scope: item.tenant_scope,
      user_id: item.user_id,
    }),
  );
}

export async function retrieveKnowledge(query: string, userId?: string | null) {
  const citations = await retrieveKnowledgeDebug(query, userId, 6);
  const context = citations
    .map(
      (citation, index) =>
        `[${index + 1}] ${citation.title}\n來源: ${citation.source}\n片段: ${citation.snippet}`,
    )
    .join("\n\n");

  return { citations, context };
}
