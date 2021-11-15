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

import React, { useMemo, useEffect, useState, PropsWithChildren } from 'react';
import { ThemeProvider } from '@material-ui/core/styles';
import CssBaseline from '@material-ui/core/CssBaseline';
import { useApi, appThemeApiRef, AppTheme } from '@backstage/core-plugin-api';
import { useObservable } from 'react-use';

// This tries to find the most accurate match, but also falls back to less
// accurate results in order to avoid errors.
function resolveTheme(
  themeId: string | undefined,
  shouldPreferDark: boolean,
  themes: AppTheme[],
) {
  if (themeId !== undefined) {
    const selectedTheme = themes.find(theme => theme.id === themeId);
    if (selectedTheme) {
      return selectedTheme;
    }
  }

  if (shouldPreferDark) {
    const darkTheme = themes.find(theme => theme.variant === 'dark');
    if (darkTheme) {
      return darkTheme;
    }
  }

  const lightTheme = themes.find(theme => theme.variant === 'light');
  if (lightTheme) {
    return lightTheme;
  }

  return themes[0];
}

const useShouldPreferDarkTheme = () => {
  const mediaQuery = useMemo(
    () => window.matchMedia('(prefers-color-scheme: dark)'),
    [],
  );
  const [shouldPreferDark, setPrefersDark] = useState(mediaQuery.matches);

  useEffect(() => {
    const listener = (event: MediaQueryListEvent) => {
      setPrefersDark(event.matches);
    };
    mediaQuery.addListener(listener);
    return () => {
      mediaQuery.removeListener(listener);
    };
  }, [mediaQuery]);

  return shouldPreferDark;
};

export function AppThemeProvider({ children }: PropsWithChildren<{}>) {
  const appThemeApi = useApi(appThemeApiRef);
  const themeId = useObservable(
    appThemeApi.activeThemeId$(),
    appThemeApi.getActiveThemeId(),
  );

  // Browser feature detection won't change over time, so ignore lint rule
  const shouldPreferDark = Boolean(window.matchMedia)
    ? useShouldPreferDarkTheme() // eslint-disable-line react-hooks/rules-of-hooks
    : false;

  const appTheme = resolveTheme(
    themeId,
    shouldPreferDark,
    appThemeApi.getInstalledThemes(),
  );
  if (!appTheme) {
    throw new Error('App has no themes');
  }

  if (appTheme.Provider) {
    return <appTheme.Provider children={children} />;
  }

  // eslint-disable-next-line no-console
  console.warn(
    "DEPRECATION WARNING: A provided app theme is using the deprecated 'theme' property " +
      'and should be migrated to use a Provider instead. ' +
      'See https://backstage.io/docs/api/deprecations#app-theme for more info.',
  );

  return (
    <ThemeProvider theme={appTheme.theme}>
      <CssBaseline>{children}</CssBaseline>
    </ThemeProvider>
  );
}
