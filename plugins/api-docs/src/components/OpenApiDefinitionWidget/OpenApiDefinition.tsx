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

import { makeStyles } from '@material-ui/core/styles';
import React, { useEffect, useState } from 'react';
import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';

const useStyles = makeStyles(theme => ({
  root: {
    '& .swagger-ui': {
      fontFamily: 'inherit',
      color: theme.palette.text.primary,

      [`& .info h1,
          .info h2,
          .info h3,
          .info h4,
          .info h5,
          .info h6`]: {
        fontFamily: 'inherit',
        color: theme.palette.text.primary,
      },
      [`& .scheme-container`]: {
        backgroundColor: theme.palette.background.default,
      },
      [`& .opblock-tag,
          .opblock-tag small,
          table thead tr td,
          table thead tr th`]: {
        fontFamily: 'inherit',
        color: theme.palette.text.primary,
        borderColor: theme.palette.divider,
      },
      [`& section.models,
          section.models.is-open h4`]: {
        borderColor: theme.palette.divider,
      },
      [`& .opblock .opblock-summary-description,
          .parameter__type,
          table.headers td,
          .model-title,
          .model .property.primitive,
          section h3`]: {
        fontFamily: 'inherit',
        color: theme.palette.text.secondary,
      },
      [`& .opblock .opblock-summary-operation-id, 
          .opblock .opblock-summary-path,
          .opblock .opblock-summary-path__deprecated,
          .opblock .opblock-section-header h4,
          .parameter__name,
          .response-col_status,
          .response-col_links,
          .responses-inner h4,
          .responses-inner h5,
          .opblock-section-header .btn,
          .tab li,
          .info li,
          .info p,
          .info table,
          section.models h4,
          .info .title,
          table.model tr.description,
          .property-row`]: {
        fontFamily: 'inherit',
        color: theme.palette.text.primary,
      },
      [`& .opblock .opblock-section-header, 
          .model-box,
          section.models .model-container`]: {
        background: theme.palette.background.default,
      },
      [`& .prop-format,
          .parameter__in`]: {
        color: theme.palette.text.disabled,
      },
      [`& .opblock-description-wrapper p,
          .opblock-external-docs-wrapper p,
          .opblock-title_normal p,
          .response-control-media-type__accept-message,
          .opblock .opblock-section-header>label,
          .scheme-container .schemes>label,
          .info .base-url,
          .model`]: {
        color: theme.palette.text.hint,
      },
      [`& .parameter__name.required:after`]: {
        color: theme.palette.warning.dark,
      },
      [`& .prop-type`]: {
        color: theme.palette.primary.main,
      },
    },
  },
}));

export type OpenApiDefinitionProps = {
  definition: string;
};

export const OpenApiDefinition = ({ definition }: OpenApiDefinitionProps) => {
  const classes = useStyles();

  // Due to a bug in the swagger-ui-react component, the component needs
  // to be created without content first.
  const [def, setDef] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDef(definition), 0);
    return () => clearTimeout(timer);
  }, [definition, setDef]);

  return (
    <div className={classes.root}>
      <SwaggerUI spec={def} deepLinking />
    </div>
  );
};
