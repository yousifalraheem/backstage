/*
 * Copyright 2020 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Entity, stringifyEntityRef } from '@backstage/catalog-model';
import { InputError, NotFoundError } from '@backstage/errors';
import { Knex } from 'knex';
import {
  EntitiesCatalog,
  EntitiesRequest,
  EntitiesResponse,
  EntityAncestryResponse,
  EntityPagination,
  EntityFilter,
  EntitiesSearchFilter,
} from '../catalog/types';
import {
  DbFinalEntitiesRow,
  DbRefreshStateReferencesRow,
  DbRefreshStateRow,
  DbSearchRow,
  DbPageInfo,
} from '../database/tables';

function parsePagination(input?: EntityPagination): {
  limit?: number;
  offset?: number;
} {
  if (!input) {
    return {};
  }

  let { limit, offset } = input;

  if (input.after !== undefined) {
    let cursor;
    try {
      const json = Buffer.from(input.after, 'base64').toString('utf8');
      cursor = JSON.parse(json);
    } catch {
      throw new InputError('Malformed after cursor, could not be parsed');
    }
    if (cursor.limit !== undefined) {
      if (!Number.isInteger(cursor.limit)) {
        throw new InputError('Malformed after cursor, limit was not an number');
      }
      limit = cursor.limit;
    }
    if (cursor.offset !== undefined) {
      if (!Number.isInteger(cursor.offset)) {
        throw new InputError('Malformed after cursor, offset was not a number');
      }
      offset = cursor.offset;
    }
  }

  return { limit, offset };
}

function stringifyPagination(input: { limit: number; offset: number }) {
  const json = JSON.stringify({ limit: input.limit, offset: input.offset });
  const base64 = Buffer.from(json, 'utf8').toString('base64');
  return base64;
}

function addCondition(
  queryBuilder: Knex.QueryBuilder,
  db: Knex,
  { key, matchValueIn, matchValueExists }: EntitiesSearchFilter,
) {
  // NOTE(freben): This used to be a set of OUTER JOIN, which may seem to
  // make a lot of sense. However, it had abysmal performance on sqlite
  // when datasets grew large, so we're using IN instead.
  const matchQuery = db<DbSearchRow>('search')
    .select('entity_id')
    .where(function keyFilter() {
      this.andWhere({ key: key.toLowerCase() });
      if (matchValueExists !== false && matchValueIn) {
        if (matchValueIn.length === 1) {
          this.andWhere({ value: matchValueIn[0].toLowerCase() });
        } else if (matchValueIn.length > 1) {
          this.andWhere(
            'value',
            'in',
            matchValueIn.map(v => v.toLowerCase()),
          );
        }
      }
    });
  // Explicitly evaluate matchValueExists as a boolean since it may be undefined
  queryBuilder.andWhere(
    'entity_id',
    matchValueExists === false ? 'not in' : 'in',
    matchQuery,
  );
}

function isEntitiesSearchFilter(
  filter: EntitiesSearchFilter | EntityFilter,
): filter is EntitiesSearchFilter {
  return filter.hasOwnProperty('key');
}

function isAndEntityFilter(
  filter: { allOf: EntityFilter[] } | EntityFilter,
): filter is { allOf: EntityFilter[] } {
  return filter.hasOwnProperty('allOf');
}

function isOrEntityFilter(
  filter: { anyOf: EntityFilter[] } | EntityFilter,
): filter is { anyOf: EntityFilter[] } {
  return filter.hasOwnProperty('anyOf');
}

function parseFilter(
  filter: EntityFilter,
  query: Knex.QueryBuilder,
  db: Knex,
): Knex.QueryBuilder {
  if (isEntitiesSearchFilter(filter)) {
    return query.where(function filterFunction() {
      addCondition(this, db, filter);
    });
  }

  if (isOrEntityFilter(filter)) {
    let cumulativeQuery = query;
    for (const subFilter of filter.anyOf ?? []) {
      cumulativeQuery = cumulativeQuery.orWhere(subQuery =>
        parseFilter(subFilter, subQuery, db),
      );
    }
    return cumulativeQuery;
  }

  if (isAndEntityFilter(filter)) {
    let cumulativeQuery = query;
    for (const subFilter of filter.allOf ?? []) {
      cumulativeQuery = cumulativeQuery.andWhere(subQuery =>
        parseFilter(subFilter, subQuery, db),
      );
    }
    return cumulativeQuery;
  }

  return query;
}

export class NextEntitiesCatalog implements EntitiesCatalog {
  constructor(private readonly database: Knex) {}

  async entities(request?: EntitiesRequest): Promise<EntitiesResponse> {
    const db = this.database;

    let entitiesQuery = db<DbFinalEntitiesRow>('final_entities');
    if (request?.filter) {
      entitiesQuery = parseFilter(request.filter, entitiesQuery, db);
    }

    // TODO: move final_entities to use entity_ref
    entitiesQuery = entitiesQuery
      .select('final_entities.*')
      .whereNotNull('final_entities.final_entity')
      .orderBy('entity_id', 'asc');

    const { limit, offset } = parsePagination(request?.pagination);
    if (limit !== undefined) {
      entitiesQuery = entitiesQuery.limit(limit + 1);
    }
    if (offset !== undefined) {
      entitiesQuery = entitiesQuery.offset(offset);
    }

    let rows = await entitiesQuery;

    let pageInfo: DbPageInfo;
    if (limit === undefined || rows.length <= limit) {
      pageInfo = { hasNextPage: false };
    } else {
      rows = rows.slice(0, -1);
      pageInfo = {
        hasNextPage: true,
        endCursor: stringifyPagination({
          limit,
          offset: (offset ?? 0) + limit,
        }),
      };
    }

    const dbResponse = rows.map(e => JSON.parse(e.final_entity!));

    const entities = dbResponse.map(e =>
      request?.fields ? request.fields(e) : e,
    );

    return {
      entities,
      pageInfo,
    };
  }

  async removeEntityByUid(uid: string): Promise<void> {
    await this.database<DbRefreshStateRow>('refresh_state')
      .where('entity_id', uid)
      .delete();
  }

  async entityAncestry(rootRef: string): Promise<EntityAncestryResponse> {
    const [rootRow] = await this.database<DbRefreshStateRow>('refresh_state')
      .leftJoin<DbFinalEntitiesRow>('final_entities', {
        'refresh_state.entity_id': 'final_entities.entity_id',
      })
      .where('refresh_state.entity_ref', '=', rootRef)
      .select({
        entityJson: 'final_entities.final_entity',
      });

    if (!rootRow) {
      throw new NotFoundError(`No such entity ${rootRef}`);
    }

    const rootEntity = JSON.parse(rootRow.entityJson) as Entity;
    const seenEntityRefs = new Set<string>();
    const todo = new Array<Entity>();
    const items = new Array<{ entity: Entity; parentEntityRefs: string[] }>();

    for (
      let current: Entity | undefined = rootEntity;
      current;
      current = todo.pop()
    ) {
      const currentRef = stringifyEntityRef(current);
      seenEntityRefs.add(currentRef);

      const parentRows = await this.database<DbRefreshStateReferencesRow>(
        'refresh_state_references',
      )
        .innerJoin<DbRefreshStateRow>('refresh_state', {
          'refresh_state_references.source_entity_ref':
            'refresh_state.entity_ref',
        })
        .innerJoin<DbFinalEntitiesRow>('final_entities', {
          'refresh_state.entity_id': 'final_entities.entity_id',
        })
        .where('refresh_state_references.target_entity_ref', '=', currentRef)
        .select({
          parentEntityRef: 'refresh_state.entity_ref',
          parentEntityJson: 'final_entities.final_entity',
        });

      const parentRefs: string[] = [];
      for (const { parentEntityRef, parentEntityJson } of parentRows) {
        parentRefs.push(parentEntityRef);
        if (!seenEntityRefs.has(parentEntityRef)) {
          seenEntityRefs.add(parentEntityRef);
          todo.push(JSON.parse(parentEntityJson));
        }
      }

      items.push({
        entity: current,
        parentEntityRefs: parentRefs,
      });
    }

    return {
      rootEntityRef: stringifyEntityRef(rootEntity),
      items,
    };
  }

  async batchAddOrUpdateEntities(): Promise<never> {
    throw new Error('Not implemented');
  }
}
