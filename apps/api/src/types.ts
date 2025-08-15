export type Nl2SqlResult = { sql: string };

export type ReactQueryResult = {
  sql: string[];
  reasoning: string[];
  observations: string[];
  rows: any[];
  iterations: number;
  success: boolean;
};

export type QueryMode = 'direct' | 'react';

export interface TableMatch {
  id: string;
  score: number;
  metadata: {
    tableName: string;
    description?: string;
  };
}
