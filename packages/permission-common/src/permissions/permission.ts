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

import { CRUDAction, PermissionAttributes } from './attributes';

export type PermissionJSON = {
  name: string;
  attributes: PermissionAttributes;
  resourceType?: string;
};

export class Permission {
  constructor(
    readonly name: string,
    readonly attributes: PermissionAttributes,
    readonly resourceType?: string,
  ) {}

  is(permission: Permission) {
    return this.name === permission.name;
  }

  supportsType(type: string) {
    return this.resourceType === type;
  }

  get isRouteVisibility() {
    return !!this.attributes.ROUTE_VISIBILITY;
  }

  get isCreate() {
    return this.attributes.CRUD_ACTION === CRUDAction.CREATE;
  }

  get isRead() {
    return this.attributes.CRUD_ACTION === CRUDAction.READ;
  }

  get isUpdate() {
    return this.attributes.CRUD_ACTION === CRUDAction.UPDATE;
  }

  get isDelete() {
    return this.attributes.CRUD_ACTION === CRUDAction.DELETE;
  }

  static fromJSON({ name, attributes, resourceType }: PermissionJSON) {
    return new Permission(name, attributes, resourceType);
  }
}
