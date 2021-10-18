/*
 * Copyright 2021 The Backstage Authors
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

import { ResponseError } from '@backstage/errors';
import fetch from 'cross-fetch';
import * as uuid from 'uuid';

// TODO(mtlewis): Seems from the CatalogClient example that we shouldn't
// be depending on core-plugin-api. Probably worth a wider conversation
// about organization of permission packages and dependencies.
import type { DiscoveryApi } from '@backstage/core-plugin-api';
import {
  AuthorizeResult,
  AuthorizeRequest,
  AuthorizeResponse,
  Identified,
} from './types';

export type PermissionRequestOptions = {
  token?: string;
};

export class PermissionClient {
  private readonly discoveryApi: DiscoveryApi;

  constructor(options: { discoveryApi: DiscoveryApi }) {
    this.discoveryApi = options.discoveryApi;
  }

  async authorize(
    requests: AuthorizeRequest[],
    options?: PermissionRequestOptions,
  ): Promise<AuthorizeResponse[]> {
    // TODO(timbonicus/joeporpeglia): we should batch requests here for some ms, and potentially de-duplicate?
    return this._authorize('/authorize', requests, options);
  }

  //
  // Private methods
  //

  private async _authorize(
    path: string,
    requests: AuthorizeRequest[],
    options?: PermissionRequestOptions,
  ): Promise<AuthorizeResponse[]> {
    const identifiedRequests: Identified<AuthorizeRequest>[] = requests.map(
      request => ({
        id: uuid.v4(),
        ...request,
      }),
    );

    const identifiedResponses = await this.post(
      path,
      identifiedRequests,
      options,
    );
    this.assertValidResponses(identifiedRequests, identifiedResponses);

    const responsesById = identifiedResponses.reduce((acc, r) => {
      acc[r.id] = r;
      return acc;
    }, {} as Record<string, Identified<AuthorizeResponse>>);

    return identifiedRequests.map(request => responsesById[request.id]);
  }

  private assertValidResponses(
    requests: Identified<AuthorizeRequest>[],
    json: any,
  ): asserts json is Identified<AuthorizeResponse>[] {
    const responses = Array.isArray(json) ? json : [];
    const authorizedResponses: Identified<AuthorizeResponse>[] =
      responses.filter(
        (r: any): r is Identified<AuthorizeResponse> =>
          typeof r === 'object' &&
          typeof r.id === 'string' &&
          r.result in AuthorizeResult,
      );
    const responseIds = authorizedResponses.map(r => r.id);
    const hasAllRequestIds = requests.every(r => responseIds.includes(r.id));
    if (!hasAllRequestIds) {
      throw new Error('Unexpected response from permission-backend');
    }
  }

  private authHeaders(
    options?: PermissionRequestOptions,
  ): Record<string, string> {
    return options?.token ? { Authorization: `Bearer ${options.token}` } : {};
  }

  private async urlFor(path: string): Promise<string> {
    return `${await this.discoveryApi.getBaseUrl('permission')}${path}`;
  }

  private async post(
    path: string,
    requests: AuthorizeRequest[],
    options?: PermissionRequestOptions,
  ): Promise<any> {
    const response = await fetch(await this.urlFor(path), {
      method: 'POST',
      body: JSON.stringify(requests),
      headers: {
        ...this.authHeaders(options),
        'content-type': 'application/json',
      },
    });
    if (!response.ok) {
      throw await ResponseError.fromResponse(response);
    }
    return response.json();
  }
}
