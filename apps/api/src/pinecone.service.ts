import { Injectable } from '@nestjs/common';
import { Pinecone } from '@pinecone-database/pinecone';
import { OpenAIEmbeddings } from '@langchain/openai';
import { TableMatch } from './types';

@Injectable()
export class PineconeService {
  private pinecone: Pinecone;
  private indexName: string;
  private embeddings: OpenAIEmbeddings;

  constructor() {
    this.pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });
    this.indexName = process.env.PINECONE_INDEX_NAME || 'table-embeddings';
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: 'text-embedding-3-small',
      dimensions: 512,
    });
  }

  async initialize() {
    try {
      await this.pinecone.describeIndex(this.indexName);
    } catch (error) {
      console.log(`Index ${this.indexName} does not exist. Please create it first.`);
    }
  }

  async createEmbedding(text: string): Promise<number[]> {
    return await this.embeddings.embedQuery(text);
  }

  async upsertTableEmbeddings(tables: Array<{ name: string; description?: string }>) {
    const index = this.pinecone.index(this.indexName);
    const vectors = [];

    for (const table of tables) {
      const text = `${table.name} ${table.description || ''}`.trim();
      const embedding = await this.createEmbedding(text);

      vectors.push({
        id: table.name,
        values: embedding,
        metadata: {
          tableName: table.name,
          description: table.description,
        },
      });
    }

    await index.upsert(vectors);
    console.log(`Upserted ${vectors.length} table embeddings to Pinecone`);
  }

  async searchSimilarTables(query: string, topK: number = 5): Promise<TableMatch[]> {
    const index = this.pinecone.index(this.indexName);
    const queryEmbedding = await this.createEmbedding(query);

    const searchResponse = await index.query({
      vector: queryEmbedding,
      topK,
      includeMetadata: true,
    });

    return (
      searchResponse.matches?.map((match) => ({
        id: match.id,
        score: match.score || 0,
        metadata: {
          tableName: match.metadata?.tableName as string,
          description: match.metadata?.description as string,
        },
      })) || []
    );
  }

  async getAllTables(): Promise<string[]> {
    const index = this.pinecone.index(this.indexName);

    try {
      const listResponse = await index.listPaginated();
      return listResponse.vectors?.map((v) => v.id) || [];
    } catch (error) {
      console.warn('Could not fetch tables from Pinecone:', error.message);
      return [];
    }
  }
}
